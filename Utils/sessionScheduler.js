const cron = require("node-cron");
const { generateAllAcademySessions } = require("./sessionGenerator");

let cronTask = null;

/**
 * Runs a rolling generation cycle for all academies (extending sessions 30 days ahead).
 */
async function runSessionGenerationCycle() {
  console.log("[Session Scheduler] Starting rolling scheduled-session generation...");
  try {
    const result = await generateAllAcademySessions(30);
    console.log(
      `[Session Scheduler] Rolling session generation complete. Total new sessions created: ${result.grandTotalCreated}`
    );
  } catch (err) {
    console.error("[Session Scheduler] Error during session generation cycle:", err.message);
  }
}

/**
 * Initializes the background scheduler.
 * Runs daily at 02:00 AM (0 2 * * *).
 */
function initSessionScheduler() {
  if (cronTask) {
    return; // Already initialized
  }

  // Run daily at 02:00 AM
  cronTask = cron.schedule("0 2 * * *", async () => {
    await runSessionGenerationCycle();
  });

  console.log("✅ Automatic Recurring Session Scheduler initialized (runs daily at 02:00 AM).");
}

function stopSessionScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log("Automatic Recurring Session Scheduler stopped.");
  }
}

module.exports = {
  initSessionScheduler,
  stopSessionScheduler,
  runSessionGenerationCycle,
};
