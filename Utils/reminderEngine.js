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
const sendEmail = require("./sendEmail");
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
    email: studentUser.email || "",
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

    if (parentLink && parentLink.parentId && (parentLink.parentId.phone || parentLink.parentId.email)) {
      return {
        name: parentLink.parentId.fullName || studentUser.fullName,
        phone: parentLink.parentId.phone || studentUser.phone || "",
        email: parentLink.parentId.email || studentUser.email || "",
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
        email: studentDoc.guardian.email || studentUser.email || "",
        role: "parent",
      };
    }
  }

  // If student has a phone number
  if (studentUser.phone) {
    recipient.phone = studentUser.phone;
    recipient.email = studentUser.email || "";
    recipient.role = "student";
    return recipient;
  }

  return recipient;
}

/**
 * Resolves recipient contact(s) for a student fee account based on rolePreference: 'student' | 'parent' | 'both'.
 */
async function resolveRecipients(studentUser, studentProfileId = null, rolePreference = "student") {
  const studentContact = {
    name: studentUser.fullName || "Student",
    phone: studentUser.phone || "",
    email: studentUser.email || "",
    role: "student",
  };

  let parentContact = null;
  const parentLink = await ParentStudent.findOne({
    studentUserId: studentUser._id,
    status: "active",
  })
    .sort({ isPrimary: -1, createdAt: 1 })
    .populate("parentId", "fullName phone email");

  if (parentLink && parentLink.parentId && (parentLink.parentId.phone || parentLink.parentId.email)) {
    parentContact = {
      name: parentLink.parentId.fullName || "Parent / Guardian",
      phone: parentLink.parentId.phone || "",
      email: parentLink.parentId.email || "",
      role: "parent",
    };
  } else if (studentProfileId) {
    const studentDoc = await Student.findById(studentProfileId);
    if (studentDoc && studentDoc.guardian && (studentDoc.guardian.phone || studentDoc.guardian.email)) {
      parentContact = {
        name:
          studentDoc.guardian.guardianName ||
          studentDoc.guardian.fatherName ||
          studentDoc.guardian.motherName ||
          "Parent / Guardian",
        phone: studentDoc.guardian.phone || "",
        email: studentDoc.guardian.email || "",
        role: "parent",
      };
    }
  }

  if (rolePreference === "both") {
    const list = [];
    if (studentContact.phone || studentContact.email) list.push(studentContact);
    if (parentContact && (parentContact.phone || parentContact.email)) {
      // Avoid duplicate if parent phone & email are identical to student
      const isDuplicate =
        parentContact.phone &&
        parentContact.phone === studentContact.phone &&
        parentContact.email &&
        parentContact.email === studentContact.email;
      if (!isDuplicate) {
        list.push(parentContact);
      }
    }
    if (list.length === 0) list.push(studentContact);

    return {
      contacts: list,
      student: studentContact,
      parent: parentContact,
    };
  }

  if (rolePreference === "parent") {
    return {
      contacts: [parentContact || studentContact],
      student: studentContact,
      parent: parentContact,
    };
  }

  return {
    contacts: [studentContact],
    student: studentContact,
    parent: parentContact,
  };
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
  const isEmailMode = integration && (integration.mode === "resend_email" || integration.mode === "email");

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

      // Resolve recipient contact(s) based on configured defaultRecipientRole
      const rolePref = settings.defaultRecipientRole || "student";
      const resolved = await resolveRecipients(studentUser, fee.studentProfile, rolePref);

      for (const recipient of resolved.contacts) {
        const recipientEmail = recipient.email || (recipient.role === "student" ? studentUser.email : "");
        const phoneValidation = normalizePhoneNumber(recipient.phone);

        if (isEmailMode) {
          if (!recipientEmail) {
            skippedCount++;
            continue;
          }
        } else {
          if (!phoneValidation.isValid) {
            skippedCount++;
            continue;
          }

          // Check opt-out list
          if (settings.excludeOptedOut && (integration?.optOutPhoneNumbers || []).includes(phoneValidation.normalizedPhone)) {
            skippedCount++;
            continue;
          }
        }

        // Stable idempotency key: academyId_feeId_installmentId_ruleId_role_dateString
        const idempotencyKey = `${academyId}_${fee._id}_${inst._id}_${matchedRule.ruleId}_${recipient.role}_${todayDateStr}`;

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

        const clickToChatUrl = (!isEmailMode && phoneValidation.isValid)
          ? generateClickToChatUrl(phoneValidation.normalizedPhone, renderedMessage)
          : "";

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
              phone: phoneValidation.normalizedPhone || recipient.phone || "",
              email: recipientEmail,
              role: recipient.role,
            },
            amountDue: remainingAmount,
            dueDate: dueDateObj,
            channel: isEmailMode ? "resend_email" : isCloudApi ? "whatsapp_cloud_api" : "whatsapp_click_to_chat",
            reminderType: "automatic",
            reminderRule: matchedRule.ruleId,
            templateId: templateDoc?._id || null,
            renderedMessage,
            clickToChatUrl: isEmailMode ? "" : clickToChatUrl,
            status: (isEmailMode || isCloudApi) ? "processing" : "queued",
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

      // If Resend Email mode is configured, dispatch official email immediately
      if (isEmailMode && recipient.email) {
        try {
          const emailSubject = `Payment Reminder: ${academyName} - ${inst.label || "Tuition Installment"}`;
          const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
              <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9;">
                ${academyDoc?.logo ? `<img src="${academyDoc.logo}" alt="${academyName}" style="max-height: 48px; margin-bottom: 10px;" />` : ""}
                <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 800;">${academyName}</h2>
                <p style="color: #d6451b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 4px 0 0 0;">Automatic Tuition Fee Reminder</p>
              </div>
              <div style="padding: 24px 0;">
                <p style="color: #334155; font-size: 15px; margin: 0 0 16px 0;">Dear <strong>${recipient.name}</strong>,</p>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                  This is an automatic notification regarding the tuition fee installment for <strong>${studentUser.fullName || "Student"}</strong> in <strong>${fee.batch?.name || fee.course?.title || "Academic Program"}</strong>.
                </p>
                <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr>
                      <td style="color: #64748b; padding: 5px 0;">Installment:</td>
                      <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 5px 0;">${inst.label || "Tuition Installment"}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 5px 0;">Due Date:</td>
                      <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 5px 0;">${dueDateFormatted}</td>
                    </tr>
                    <tr>
                      <td style="color: #ea580c; font-size: 14px; font-weight: 800; padding: 10px 0 0 0; border-top: 1px dashed #fdba74;">Amount Due:</td>
                      <td style="color: #ea580c; font-size: 18px; font-weight: 900; text-align: right; padding: 10px 0 0 0; border-top: 1px dashed #fdba74;">₹${Number(remainingAmount).toLocaleString("en-IN")}</td>
                    </tr>
                  </table>
                </div>
                <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
                  Please complete the payment through your student/parent portal at your earliest convenience.
                </p>
                ${supportPhone ? `<p style="color: #64748b; font-size: 12px; margin: 0;">For inquiries, contact: <strong>${supportPhone}</strong></p>` : ""}
              </div>
              <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
                <p style="margin: 0;">Sent via Resend Secure Mail Gateway for ${academyName}.</p>
              </div>
            </div>
          `;

          await sendEmail({
            to: recipient.email,
            subject: emailSubject,
            html: emailHtml,
          });

          reminderRecord.status = "delivered";
          reminderRecord.sentAt = new Date();
          reminderRecord.deliveredAt = new Date();
          if (reminderRecord.recipient) {
            reminderRecord.recipient.email = recipient.email;
          }
          await reminderRecord.save();
          sentCount++;
        } catch (mailErr) {
          reminderRecord.status = "failed";
          reminderRecord.failedAt = new Date();
          reminderRecord.failureReason = mailErr.message || "Resend email dispatch failed";
          await reminderRecord.save();
        }
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
  resolveRecipients,
  ensureDefaultTemplates,
  processAcademyReminders,
};
