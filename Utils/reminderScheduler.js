const cron = require("node-cron");
const Academy = require("../Modals/Academy");
const ReminderSettings = require("../Modals/ReminderSettings");
const FeeReminder = require("../Modals/FeeReminder");
const { processAcademyReminders } = require("./reminderEngine");

let cronTask = null;

/**
 * Recovers any reminders stuck in 'processing' state due to unexpected server restart.
 */
async function recoverStuckReminders() {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const stuckReminders = await FeeReminder.find({
      status: "processing",
      updatedAt: { $lt: fifteenMinutesAgo },
    });

    for (const reminder of stuckReminders) {
      reminder.status = "failed";
      reminder.failedAt = new Date();
      reminder.failureReason = "Job timed out during worker restart or unexpected shutdown.";
      await reminder.save();
    }
  } catch (err) {
    console.error("Error during stuck reminder recovery:", err.message);
  }
}

/**
 * Runs one cycle across all active academies that have automatic reminders enabled.
 */
async function runAllAcademyReminders() {
  try {
    await recoverStuckReminders();

    const activeSettings = await ReminderSettings.find({
      automaticRemindersEnabled: true,
      isPaused: false,
    });

    for (const setting of activeSettings) {
      try {
        await processAcademyReminders(setting.academyId);
      } catch (acadErr) {
        console.error(`Reminder cycle error for academy ${setting.academyId}:`, acadErr.message);
      }
    }
  } catch (err) {
    console.error("Global fee reminder scheduler error:", err.message);
  }
}

/**
 * Starts the durable cron scheduler.
 * By default runs every hour on the hour.
 */
function initReminderScheduler() {
  if (cronTask) {
    return; // Already started
  }

  // Run every hour at minute 0 (0 * * * *)
  cronTask = cron.schedule("0 * * * *", async () => {
    console.log("[Fee Reminder Scheduler] Starting hourly automatic check...");
    await runAllAcademyReminders();
    console.log("[Fee Reminder Scheduler] Completed hourly cycle.");
  });

  console.log("✅ Automated WhatsApp Fee Reminder Scheduler initialized (running hourly).");
}

function stopReminderScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log("Automated WhatsApp Fee Reminder Scheduler stopped.");
  }
}

module.exports = {
  initReminderScheduler,
  stopReminderScheduler,
  runAllAcademyReminders,
  recoverStuckReminders,
};
