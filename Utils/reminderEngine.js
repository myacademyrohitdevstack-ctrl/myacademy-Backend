const mongoose = require("mongoose");
const FeeReminder = require("../Modals/FeeReminder");
const StudentFee = require("../Modals/StudentFee");
const FeePayment = require("../Modals/FeePayment");
const User = require("../Modals/User");
const Student = require("../Modals/Student");
const ParentStudent = require("../Modals/ParentStudent");
const Academy = require("../Modals/Academy");
const ReminderSettings = require("../Modals/ReminderSettings");
const ReminderTemplate = require("../Modals/ReminderTemplate");
const WhatsAppIntegration = require("../Modals/WhatsAppIntegration");
const ReminderAuditLog = require("../Modals/ReminderAuditLog");
const {
  normalizePhoneNumber,
  renderTemplateMessage,
  generateClickToChatUrl,
  sendMetaCloudMessage,
  getDefaultTemplates,
} = require("./whatsappService");

/**
 * Checks whether current time is within allowed sending hours in the given timezone.
 */
function isWithinSendingHours(allowedHours = { start: "09:00", end: "20:00" }, timezone = "Asia/Kolkata") {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    const currentMins = hour * 60 + minute;

    const [startH, startM] = (allowedHours.start || "09:00").split(":").map(Number);
    const [endH, endM] = (allowedHours.end || "20:00").split(":").map(Number);
    const startMins = startH * 60 + (startM || 0);
    const endMins = endH * 60 + (endM || 0);

    return currentMins >= startMins && currentMins <= endMins;
  } catch (err) {
    console.error("Timezone evaluation error:", err);
    return true; // Fallback to allowing send if timezone string was invalid
  }
}

/**
 * Resolves the primary contact phone and name for a student (checks student profile and linked parent).
 */
async function resolveRecipientContact(studentUser, studentProfileId = null, preferParent = false) {
  let recipient = {
    name: studentUser.fullName || "Student",
    phone: studentUser.phone || "",
    role: "student",
  };

  // Check linked primary parent first if preferred or if student has no phone
  if (preferParent || !recipient.phone) {
    const parentLink = await ParentStudent.findOne({
      studentUserId: studentUser._id,
      status: "active",
    })
      .sort({ isPrimary: -1, createdAt: 1 })
      .populate("parentId", "fullName phone email");

    if (parentLink && parentLink.parentId && parentLink.parentId.phone) {
      return {
        name: parentLink.parentId.fullName || studentUser.fullName,
        phone: parentLink.parentId.phone,
        role: "parent",
      };
    }
  }

  // Next check student profile guardian info
  if (!recipient.phone && studentProfileId) {
    const studentDoc = await Student.findById(studentProfileId);
    if (studentDoc && studentDoc.guardian && studentDoc.guardian.phone) {
      return {
        name: studentDoc.guardian.guardianName || studentDoc.guardian.fatherName || studentDoc.guardian.motherName || "Parent",
        phone: studentDoc.guardian.phone,
        role: "parent",
      };
    }
  }

  // If student has a phone number
  if (studentUser.phone) {
    recipient.phone = studentUser.phone;
    recipient.role = "student";
    return recipient;
  }

  return recipient;
}

/**
 * Ensures default templates exist for an academy.
 */
async function ensureDefaultTemplates(academyId, userId) {
  const count = await ReminderTemplate.countDocuments({ academyId, isActive: true });
  if (count === 0) {
    const academy = await Academy.findById(academyId).select("name");
    const defaults = getDefaultTemplates(academy?.name || "MyAcademy");
    const docs = defaults.map((tmpl) => ({
      ...tmpl,
      academyId,
      createdBy: userId,
    }));
    await ReminderTemplate.insertMany(docs);
  }
}

/**
 * Runs the automatic fee reminder cycle for a single academy.
 */
async function processAcademyReminders(academyId) {
  const settings = await ReminderSettings.findOne({ academyId });
  if (!settings || !settings.automaticRemindersEnabled || settings.isPaused) {
    return { skipped: true, reason: "Automatic reminders disabled or paused" };
  }

  if (!isWithinSendingHours(settings.allowedSendingHours, settings.timezone)) {
    return { skipped: true, reason: "Outside allowed sending hours in academy timezone" };
  }

  const integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken +appSecret");
  const isCloudApi = integration && integration.mode === "cloud_api" && integration.connectionStatus === "connected" && integration.accessToken;

  // Active reminder rules
  const activeRules = (settings.rules || []).filter((r) => r.isActive);
  if (activeRules.length === 0) {
    return { processed: 0, sent: 0, reason: "No active reminder rules configured" };
  }

  const academyDoc = await Academy.findById(academyId).select("name phone supportPhone");
  const academyName = academyDoc?.name || "MyAcademy";
  const supportPhone = academyDoc?.supportPhone || academyDoc?.phone || "";

  // Find all active student fee records with balance > 0
  const candidateFees = await StudentFee.find({
    academyId,
    isDeleted: false,
    status: { $ne: "cancelled" },
    balanceAmount: { $gt: 0 },
  })
    .populate("student", "fullName phone email status isDeleted")
    .populate("batch", "name")
    .populate("course", "title");

  const now = new Date();
  const todayDateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  let createdCount = 0;
  let sentCount = 0;
  let skippedCount = 0;

  for (const fee of candidateFees) {
    const studentUser = fee.student;
    if (!studentUser || studentUser.isDeleted || studentUser.status !== "active") {
      skippedCount++;
      continue;
    }

    // Process each unpaid installment in the fee record
    const pendingInstallments = (fee.installments || []).filter(
      (inst) => inst.status !== "paid" && inst.status !== "waived" && inst.amount > (inst.paidAmount || 0)
    );

    for (const inst of pendingInstallments) {
      if (!inst.dueDate) continue;

      const dueDateObj = new Date(inst.dueDate);
      // Calculate difference in whole days between today and due date
      const diffTime = now.getTime() - dueDateObj.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24)); // 0 = today, -3 = 3 days before, +3 = 3 days overdue

      // Match against active rules
      const matchedRule = activeRules.find((r) => r.daysOffset === diffDays);
      if (!matchedRule) continue;

      // Check overdue reminder restriction
      if (diffDays > 0 && !settings.overdueRemindersEnabled) {
        continue;
      }

      // Check maximum reminders per installment
      const pastRemindersCount = await FeeReminder.countDocuments({
        academyId,
        feeId: fee._id,
        installmentId: inst._id,
        status: { $nin: ["cancelled", "skipped", "draft"] },
      });

      if (pastRemindersCount >= settings.maximumRemindersPerInstallment) {
        skippedCount++;
        continue;
      }

      // Check minimum reminder interval
      const lastReminder = await FeeReminder.findOne({
        academyId,
        feeId: fee._id,
        installmentId: inst._id,
        status: { $nin: ["cancelled", "skipped"] },
      }).sort({ createdAt: -1 });

      if (lastReminder) {
        const daysSinceLast = Math.round((now.getTime() - new Date(lastReminder.createdAt).getTime()) / (1000 * 3600 * 24));
        if (daysSinceLast < settings.minimumReminderIntervalDays) {
          skippedCount++;
          continue;
        }
      }

      // Resolve contact phone
      const recipient = await resolveRecipientContact(studentUser, fee.studentProfile, true);
      const phoneValidation = normalizePhoneNumber(recipient.phone);
      if (!phoneValidation.isValid) {
        skippedCount++;
        continue;
      }

      // Check opt-out list
      if (settings.excludeOptedOut && (integration?.optOutPhoneNumbers || []).includes(phoneValidation.normalizedPhone)) {
        skippedCount++;
        continue;
      }

      // Stable idempotency key: academyId_feeId_installmentId_ruleId_dateString
      const idempotencyKey = `${academyId}_${fee._id}_${inst._id}_${matchedRule.ruleId}_${todayDateStr}`;

      // Check if reminder already claimed for this rule occurrence
      const existing = await FeeReminder.findOne({ academyId, idempotencyKey });
      if (existing) {
        continue; // Already processed
      }

      // Resolve message template
      let templateDoc = null;
      if (matchedRule.templateId) {
        templateDoc = await ReminderTemplate.findOne({ _id: matchedRule.templateId, academyId, isActive: true });
      }
      if (!templateDoc) {
        const cat = diffDays > 0 ? "overdue" : diffDays === 0 ? "due_today" : "due_soon";
        templateDoc = await ReminderTemplate.findOne({ academyId, category: cat, isActive: true });
      }

      const rawTemplate = templateDoc?.messageBody ||
        `Hello {{parentName}}, reminder from {{academyName}}: Fee installment of ₹{{pendingAmount}} for {{studentName}} is due on {{dueDate}}.`;

      const remainingAmount = Math.max(0, Math.round((inst.amount - (inst.paidAmount || 0)) * 100) / 100);
      const dueDateFormatted = dueDateObj.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const renderedMessage = renderTemplateMessage(rawTemplate, {
        academyName,
        studentName: studentUser.fullName,
        parentName: recipient.name,
        className: fee.batch?.name || fee.course?.title || "Class",
        feeAmount: String(inst.amount),
        paidAmount: String(inst.paidAmount || 0),
        pendingAmount: String(remainingAmount),
        dueDate: dueDateFormatted,
        installmentName: inst.label || "Installment",
        supportPhone,
      });

      const clickToChatUrl = generateClickToChatUrl(phoneValidation.normalizedPhone, renderedMessage);

      // Create Reminder record atomically
      let reminderRecord;
      try {
        reminderRecord = await FeeReminder.create({
          academyId,
          studentId: studentUser._id,
          studentProfileId: fee.studentProfile,
          feeId: fee._id,
          installmentId: inst._id,
          installmentLabel: inst.label,
          recipient: {
            name: recipient.name,
            phone: phoneValidation.normalizedPhone,
            role: recipient.role,
          },
          amountDue: remainingAmount,
          dueDate: dueDateObj,
          channel: isCloudApi ? "whatsapp_cloud_api" : "whatsapp_click_to_chat",
          reminderType: "automatic",
          reminderRule: matchedRule.ruleId,
          templateId: templateDoc?._id || null,
          renderedMessage,
          clickToChatUrl,
          status: isCloudApi ? "processing" : "queued",
          idempotencyKey,
        });
        createdCount++;
      } catch (err) {
        if (err.code === 11000) {
          // Idempotency collision: another worker just created it
          continue;
        }
        throw err;
      }

      // If official Cloud API is connected, dispatch immediately
      if (isCloudApi) {
        try {
          const apiResult = await sendMetaCloudMessage({
            phoneNumberId: integration.phoneNumberId,
            accessToken: integration.accessToken,
            toPhone: phoneValidation.normalizedPhone,
            messageText: renderedMessage,
            templateName: templateDoc?.approvalStatus === "approved" ? templateDoc.providerTemplateName : null,
          });

          reminderRecord.status = "sent_to_provider";
          reminderRecord.providerMessageId = apiResult.messageId;
          reminderRecord.providerResponse = apiResult.providerResponse;
          reminderRecord.sentAt = new Date();
          reminderRecord.attemptCount = 1;
          await reminderRecord.save();
          sentCount++;
        } catch (apiErr) {
          reminderRecord.status = "failed";
          reminderRecord.failedAt = new Date();
          reminderRecord.failureReason = apiErr.message || "Meta Cloud API dispatch failed";
          reminderRecord.providerResponse = apiErr.providerResponse || null;
          reminderRecord.attemptCount = 1;
          await reminderRecord.save();
        }
      }
    }
  }

  return {
    success: true,
    created: createdCount,
    sent: sentCount,
    skipped: skippedCount,
  };
}

module.exports = {
  isWithinSendingHours,
  resolveRecipientContact,
  ensureDefaultTemplates,
  processAcademyReminders,
};
