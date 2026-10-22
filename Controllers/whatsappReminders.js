const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const FeeReminder = require("../Modals/FeeReminder");
const StudentFee = require("../Modals/StudentFee");
const FeePayment = require("../Modals/FeePayment");
const User = require("../Modals/User");
const Student = require("../Modals/Student");
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
  verifyWebhookSignature,
  getDefaultTemplates,
} = require("../Utils/whatsappService");
const {
  isWithinSendingHours,
  resolveRecipientContact,
  ensureDefaultTemplates,
  processAcademyReminders,
} = require("../Utils/reminderEngine");

const academyIdOf = (req) => req.academy._id;

// Helper to log audit actions
async function logReminderAudit(academyId, actorId, action, reminderId = null, details = {}) {
  try {
    await ReminderAuditLog.create({
      academyId,
      actorId,
      action,
      reminderId,
      details,
    });
  } catch (err) {
    console.error("Audit log error:", err.message);
  }
}

// ----------------------------------------------------
// 1. DASHBOARD & ANALYTICS
// ----------------------------------------------------
exports.getDashboard = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const now = new Date();

  // Start of current month & start of today
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [
    monthCount,
    todayCount,
    deliveredCount,
    failedCount,
    pendingCount,
    manuallyConfirmedCount,
    integration,
    settings,
    recentActivity,
    failedNeedingAttention,
    feesDueTodayAgg,
    feesOverdueAgg,
    feesUpcomingAgg,
  ] = await Promise.all([
    // Month reminders sent
    FeeReminder.countDocuments({
      academyId,
      createdAt: { $gte: startOfMonth },
      status: { $in: ["sent_to_provider", "delivered", "read", "manually_confirmed"] },
    }),
    // Today reminders sent
    FeeReminder.countDocuments({
      academyId,
      createdAt: { $gte: startOfToday },
      status: { $in: ["sent_to_provider", "delivered", "read", "manually_confirmed"] },
    }),
    // Delivered
    FeeReminder.countDocuments({
      academyId,
      status: { $in: ["delivered", "read"] },
    }),
    // Failed
    FeeReminder.countDocuments({
      academyId,
      status: "failed",
    }),
    // Pending / Queued / Scheduled
    FeeReminder.countDocuments({
      academyId,
      status: { $in: ["queued", "processing", "scheduled", "draft"] },
    }),
    // Manually Confirmed
    FeeReminder.countDocuments({
      academyId,
      status: "manually_confirmed",
    }),
    // Integration status
    WhatsAppIntegration.findOne({ academyId }),
    // Settings
    ReminderSettings.findOne({ academyId }),
    // Recent activity (last 10)
    FeeReminder.find({ academyId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("studentId", "fullName email phone")
      .populate("createdBy", "fullName"),
    // Failed messages needing attention (last 10)
    FeeReminder.find({ academyId, status: "failed" })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate("studentId", "fullName email phone"),
    // Fees due today
    StudentFee.aggregate([
      { $match: { academyId, isDeleted: false, status: { $ne: "cancelled" }, balanceAmount: { $gt: 0 } } },
      { $unwind: "$installments" },
      {
        $match: {
          "installments.status": { $in: ["pending", "partial"] },
          "installments.dueDate": { $gte: startOfToday, $lte: endOfToday },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: { $subtract: ["$installments.amount", { $ifNull: ["$installments.paidAmount", 0] }] } },
        },
      },
    ]),
    // Fees overdue (past due date)
    StudentFee.aggregate([
      { $match: { academyId, isDeleted: false, status: { $ne: "cancelled" }, balanceAmount: { $gt: 0 } } },
      { $unwind: "$installments" },
      {
        $match: {
          "installments.status": { $in: ["pending", "partial"] },
          "installments.dueDate": { $lt: startOfToday },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: { $subtract: ["$installments.amount", { $ifNull: ["$installments.paidAmount", 0] }] } },
        },
      },
    ]),
    // Upcoming fee dues (next 7 days)
    StudentFee.aggregate([
      { $match: { academyId, isDeleted: false, status: { $ne: "cancelled" }, balanceAmount: { $gt: 0 } } },
      { $unwind: "$installments" },
      {
        $match: {
          "installments.status": { $in: ["pending", "partial"] },
          "installments.dueDate": { $gt: endOfToday, $lte: in7Days },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: { $subtract: ["$installments.amount", { $ifNull: ["$installments.paidAmount", 0] }] } },
        },
      },
    ]),
  ]);

  await ensureDefaultTemplates(academyId, req.user._id);

  res.status(200).json({
    success: true,
    data: {
      metrics: {
        sentThisMonth: monthCount,
        sentToday: todayCount,
        delivered: deliveredCount,
        failed: failedCount,
        pending: pendingCount,
        manuallyConfirmed: manuallyConfirmedCount,
      },
      duesOverview: {
        dueToday: {
          count: feesDueTodayAgg[0]?.count || 0,
          amount: Math.round((feesDueTodayAgg[0]?.amount || 0) * 100) / 100,
        },
        overdue: {
          count: feesOverdueAgg[0]?.count || 0,
          amount: Math.round((feesOverdueAgg[0]?.amount || 0) * 100) / 100,
        },
        upcoming: {
          count: feesUpcomingAgg[0]?.count || 0,
          amount: Math.round((feesUpcomingAgg[0]?.amount || 0) * 100) / 100,
        },
      },
      connection: {
        mode: integration?.mode || "manual",
        provider: integration?.provider || "none",
        connectionStatus: integration?.connectionStatus || "not_configured",
        phoneNumberId: integration?.phoneNumberId || "",
        senderPhoneNumber: integration?.senderPhoneNumber || "",
        lastConnectionTestAt: integration?.lastConnectionTestAt || null,
        lastError: integration?.lastError || "",
      },
      automation: {
        enabled: settings?.automaticRemindersEnabled || false,
        isPaused: settings?.isPaused || false,
        timezone: settings?.timezone || "Asia/Kolkata",
        allowedSendingHours: settings?.allowedSendingHours || { start: "09:00", end: "20:00" },
        rulesCount: (settings?.rules || []).filter((r) => r.isActive).length,
      },
      recentActivity,
      failedNeedingAttention,
    },
  });
});

// ----------------------------------------------------
// 2. REMINDER HISTORY & LISTING
// ----------------------------------------------------
exports.listReminders = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const {
    status,
    reminderType,
    search = "",
    from,
    to,
    studentId,
    page = 1,
    limit = 20,
  } = req.query;

  const query = { academyId };

  if (status && status !== "all") {
    query.status = status;
  }
  if (reminderType && reminderType !== "all") {
    query.reminderType = reminderType;
  }
  if (studentId && mongoose.Types.ObjectId.isValid(studentId)) {
    query.studentId = studentId;
  }
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query.createdAt.$lte = toDate;
    }
  }
  if (search.trim()) {
    const s = search.trim();
    query.$or = [
      { "recipient.name": { $regex: s, $options: "i" } },
      { "recipient.phone": { $regex: s, $options: "i" } },
      { renderedMessage: { $regex: s, $options: "i" } },
      { installmentLabel: { $regex: s, $options: "i" } },
    ];
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));

  const [reminders, total] = await Promise.all([
    FeeReminder.find(query)
      .populate("studentId", "fullName email phone")
      .populate("feeId", "totalPayable balanceAmount status")
      .populate("templateId", "name category")
      .populate("createdBy", "fullName")
      .populate("manuallyConfirmedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l),
    FeeReminder.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    count: reminders.length,
    total,
    page: p,
    pages: Math.ceil(total / l),
    data: reminders,
  });
});

exports.getReminderById = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const reminder = await FeeReminder.findOne({
    _id: req.params.reminderId,
    academyId,
  })
    .populate("studentId", "fullName email phone")
    .populate("feeId")
    .populate("templateId")
    .populate("createdBy", "fullName email")
    .populate("manuallyConfirmedBy", "fullName");

  if (!reminder) {
    return res.status(404).json({ success: false, message: "Fee reminder not found." });
  }

  res.status(200).json({ success: true, data: reminder });
});

// ----------------------------------------------------
// 3. MESSAGE PREVIEW & CREATION
// ----------------------------------------------------
exports.previewReminder = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const { studentFeeId, installmentId, templateId, customTemplateBody, recipientRole = "student" } = req.body;

  if (!studentFeeId || !mongoose.Types.ObjectId.isValid(studentFeeId)) {
    return res.status(400).json({ success: false, message: "Valid studentFeeId is required." });
  }

  const fee = await StudentFee.findOne({ _id: studentFeeId, academyId, isDeleted: false })
    .populate("student", "fullName phone email")
    .populate("batch", "name")
    .populate("course", "title");

  if (!fee) {
    return res.status(404).json({ success: false, message: "Student fee account not found." });
  }

  const academyDoc = await Academy.findById(academyId).select("name phone supportPhone");
  const academyName = academyDoc?.name || "MyAcademy";
  const supportPhone = academyDoc?.supportPhone || academyDoc?.phone || "";

  // Resolve target installment or consolidated
  let targetInstallment = null;
  let remainingAmount = fee.balanceAmount;
  let targetDueDate = null;

  if (installmentId && mongoose.Types.ObjectId.isValid(installmentId)) {
    targetInstallment = (fee.installments || []).id(installmentId);
    if (targetInstallment) {
      remainingAmount = Math.max(0, Math.round((targetInstallment.amount - (targetInstallment.paidAmount || 0)) * 100) / 100);
      targetDueDate = targetInstallment.dueDate;
    }
  } else {
    // Consolidated: find nearest pending installment due date
    const nextDue = (fee.installments || [])
      .filter((i) => !["paid", "waived"].includes(i.status))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    targetDueDate = nextDue?.dueDate || null;
  }

  // Resolve template body
  let templateBody = customTemplateBody || "";
  if (!templateBody && templateId && mongoose.Types.ObjectId.isValid(templateId)) {
    const tmpl = await ReminderTemplate.findOne({ _id: templateId, academyId, isActive: true });
    if (tmpl) templateBody = tmpl.messageBody;
  }
  if (!templateBody) {
    templateBody = `Dear {{parentName}}, friendly fee reminder from {{academyName}} for {{studentName}} ({{className}}). Outstanding amount is ₹{{pendingAmount}}, due on {{dueDate}}. Thank you!`;
  }

  // Resolve recipient contact
  const recipient = await resolveRecipientContact(fee.student, fee.studentProfile, recipientRole === "parent");
  const phoneValidation = normalizePhoneNumber(recipient.phone);

  const formattedDueDate = targetDueDate
    ? new Date(targetDueDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Promptly";

  const renderedMessage = renderTemplateMessage(templateBody, {
    academyName,
    studentName: fee.student?.fullName || "Student",
    parentName: recipient.name,
    className: fee.batch?.name || fee.course?.title || "Class",
    feeAmount: String(targetInstallment ? targetInstallment.amount : fee.totalPayable),
    paidAmount: String(targetInstallment ? targetInstallment.paidAmount || 0 : fee.paidAmount),
    pendingAmount: String(remainingAmount),
    dueDate: formattedDueDate,
    installmentName: targetInstallment?.label || "Consolidated Balance",
    supportPhone,
  });

  const clickToChatUrl = phoneValidation.isValid
    ? generateClickToChatUrl(phoneValidation.normalizedPhone, renderedMessage)
    : "";

  res.status(200).json({
    success: true,
    data: {
      renderedMessage,
      clickToChatUrl,
      recipient: {
        name: recipient.name,
        phone: recipient.phone,
        normalizedPhone: phoneValidation.normalizedPhone,
        isValidPhone: phoneValidation.isValid,
        phoneValidationReason: phoneValidation.reason || null,
        role: recipient.role,
      },
      amountDue: remainingAmount,
      dueDate: targetDueDate,
      installmentLabel: targetInstallment?.label || "Consolidated Balance",
      isFullyPaid: remainingAmount <= 0,
    },
  });
});

// ----------------------------------------------------
// 4. MANUAL & BULK SENDING
// ----------------------------------------------------
exports.sendManualReminder = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const {
    studentFeeId,
    installmentId,
    templateId,
    customMessage,
    recipientRole = "student",
    channelPreference = "auto", // 'auto', 'click_to_chat', 'cloud_api'
  } = req.body;

  if (!studentFeeId || !mongoose.Types.ObjectId.isValid(studentFeeId)) {
    return res.status(400).json({ success: false, message: "Valid studentFeeId is required." });
  }

  const fee = await StudentFee.findOne({ _id: studentFeeId, academyId, isDeleted: false })
    .populate("student", "fullName phone email status isDeleted")
    .populate("batch", "name")
    .populate("course", "title");

  if (!fee) {
    return res.status(404).json({ success: false, message: "Student fee account not found." });
  }

  if (fee.balanceAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "This fee account has already been fully settled. No reminder required.",
    });
  }

  // Resolve installment or consolidated balance
  let targetInstallment = null;
  let remainingAmount = fee.balanceAmount;
  let targetDueDate = null;

  if (installmentId && mongoose.Types.ObjectId.isValid(installmentId)) {
    targetInstallment = (fee.installments || []).id(installmentId);
    if (!targetInstallment) {
      return res.status(404).json({ success: false, message: "Installment not found." });
    }
    remainingAmount = Math.max(0, Math.round((targetInstallment.amount - (targetInstallment.paidAmount || 0)) * 100) / 100);
    targetDueDate = targetInstallment.dueDate;
    if (remainingAmount <= 0) {
      return res.status(400).json({ success: false, message: "This installment is already fully paid." });
    }
  } else {
    const nextDue = (fee.installments || [])
      .filter((i) => !["paid", "waived"].includes(i.status))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    targetDueDate = nextDue?.dueDate || null;
  }

  const academyDoc = await Academy.findById(academyId).select("name phone supportPhone");
  const academyName = academyDoc?.name || "MyAcademy";
  const supportPhone = academyDoc?.supportPhone || academyDoc?.phone || "";

  // Resolve recipient contact
  const recipient = await resolveRecipientContact(fee.student, fee.studentProfile, recipientRole === "parent");
  const phoneValidation = normalizePhoneNumber(recipient.phone);

  if (!phoneValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: `Invalid recipient phone number (${recipient.phone || "none"}): ${phoneValidation.reason}`,
    });
  }

  // Check integration mode
  const integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken +appSecret");
  const canUseCloudApi =
    integration &&
    integration.mode === "cloud_api" &&
    integration.connectionStatus === "connected" &&
    integration.accessToken &&
    channelPreference !== "click_to_chat";

  // Check opt out
  if ((integration?.optOutPhoneNumbers || []).includes(phoneValidation.normalizedPhone)) {
    return res.status(400).json({
      success: false,
      message: `The phone number ${phoneValidation.formattedDisplay} has opted out of WhatsApp reminders.`,
    });
  }

  // Render message
  let templateDoc = null;
  let rawTemplate = customMessage || "";
  if (!rawTemplate && templateId && mongoose.Types.ObjectId.isValid(templateId)) {
    templateDoc = await ReminderTemplate.findOne({ _id: templateId, academyId, isActive: true });
    if (templateDoc) rawTemplate = templateDoc.messageBody;
  }
  if (!rawTemplate) {
    rawTemplate = `Dear {{parentName}}, fee reminder from {{academyName}} for {{studentName}} ({{className}}). Amount due: ₹{{pendingAmount}} on {{dueDate}}. Thank you!`;
  }

  const formattedDueDate = targetDueDate
    ? new Date(targetDueDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Promptly";

  const renderedMessage = renderTemplateMessage(rawTemplate, {
    academyName,
    studentName: fee.student?.fullName || "Student",
    parentName: recipient.name,
    className: fee.batch?.name || fee.course?.title || "Class",
    feeAmount: String(targetInstallment ? targetInstallment.amount : fee.totalPayable),
    paidAmount: String(targetInstallment ? targetInstallment.paidAmount || 0 : fee.paidAmount),
    pendingAmount: String(remainingAmount),
    dueDate: formattedDueDate,
    installmentName: targetInstallment?.label || "Consolidated Balance",
    supportPhone,
  });

  const clickToChatUrl = generateClickToChatUrl(phoneValidation.normalizedPhone, renderedMessage);

  // Generate an idempotency key to prevent double clicks within 30 seconds
  const dateMinuteKey = Math.floor(Date.now() / 30000);
  const idempotencyKey = `manual_${academyId}_${fee._id}_${targetInstallment?._id || "consolidated"}_${dateMinuteKey}`;

  let reminderRecord = await FeeReminder.create({
    academyId,
    studentId: fee.student._id,
    studentProfileId: fee.studentProfile,
    feeId: fee._id,
    installmentId: targetInstallment?._id || null,
    installmentLabel: targetInstallment?.label || "Consolidated Balance",
    recipient: {
      name: recipient.name,
      phone: phoneValidation.normalizedPhone,
      role: recipient.role,
    },
    amountDue: remainingAmount,
    dueDate: targetDueDate,
    channel: canUseCloudApi ? "whatsapp_cloud_api" : "whatsapp_click_to_chat",
    reminderType: "manual",
    reminderRule: "manual",
    templateId: templateDoc?._id || null,
    renderedMessage,
    clickToChatUrl,
    status: canUseCloudApi ? "processing" : "draft",
    idempotencyKey,
    createdBy: req.user._id,
  });

  if (canUseCloudApi) {
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

      await logReminderAudit(academyId, req.user._id, "MANUAL_REMINDER_CREATED", reminderRecord._id, {
        method: "cloud_api",
        recipient: phoneValidation.normalizedPhone,
      });

      return res.status(200).json({
        success: true,
        message: "Fee reminder dispatched via WhatsApp Cloud API successfully.",
        data: reminderRecord,
      });
    } catch (apiErr) {
      reminderRecord.status = "failed";
      reminderRecord.failedAt = new Date();
      reminderRecord.failureReason = apiErr.message || "Cloud API submission error";
      reminderRecord.providerResponse = apiErr.providerResponse || null;
      reminderRecord.attemptCount = 1;
      await reminderRecord.save();

      return res.status(502).json({
        success: false,
        message: `Failed to send via WhatsApp Cloud API: ${apiErr.message}. Fallback link generated.`,
        data: reminderRecord,
        fallbackClickToChatUrl: clickToChatUrl,
      });
    }
  }

  // Manual Click-to-Chat Mode
  await logReminderAudit(academyId, req.user._id, "MANUAL_REMINDER_CREATED", reminderRecord._id, {
    method: "click_to_chat",
    recipient: phoneValidation.normalizedPhone,
  });

  res.status(201).json({
    success: true,
    message: "Manual WhatsApp reminder generated. Open WhatsApp to send to the recipient.",
    data: reminderRecord,
    clickToChatUrl,
  });
});

exports.sendBulkReminders = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const {
    filterType = "all_pending", // 'all_pending', 'overdue', 'due_today', 'selected'
    selectedFeeIds = [],
    templateId,
    customMessage,
    recipientRole = "student",
  } = req.body;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let query = {
    academyId,
    isDeleted: false,
    status: { $ne: "cancelled" },
    balanceAmount: { $gt: 0 },
  };

  if (filterType === "selected") {
    if (!Array.isArray(selectedFeeIds) || selectedFeeIds.length === 0) {
      return res.status(400).json({ success: false, message: "No fee accounts selected." });
    }
    query._id = { $in: selectedFeeIds };
  } else if (filterType === "due_today") {
    query["installments"] = {
      $elemMatch: {
        status: { $in: ["pending", "partial"] },
        dueDate: { $gte: startOfToday, $lte: endOfToday },
      },
    };
  } else if (filterType === "overdue") {
    query["installments"] = {
      $elemMatch: {
        status: { $in: ["pending", "partial"] },
        dueDate: { $lt: startOfToday },
      },
    };
  }

  const candidateFees = await StudentFee.find(query)
    .populate("student", "fullName phone email status isDeleted")
    .populate("batch", "name")
    .populate("course", "title");

  const academyDoc = await Academy.findById(academyId).select("name phone supportPhone");
  const academyName = academyDoc?.name || "MyAcademy";
  const supportPhone = academyDoc?.supportPhone || academyDoc?.phone || "";

  const integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken +appSecret");
  const canUseCloudApi =
    integration &&
    integration.mode === "cloud_api" &&
    integration.connectionStatus === "connected" &&
    integration.accessToken;

  let templateDoc = null;
  let rawTemplate = customMessage || "";
  if (!rawTemplate && templateId && mongoose.Types.ObjectId.isValid(templateId)) {
    templateDoc = await ReminderTemplate.findOne({ _id: templateId, academyId, isActive: true });
    if (templateDoc) rawTemplate = templateDoc.messageBody;
  }
  if (!rawTemplate) {
    rawTemplate = `Dear {{parentName}}, fee reminder from {{academyName}} for {{studentName}} ({{className}}). Amount due: ₹{{pendingAmount}} on {{dueDate}}. Thank you!`;
  }

  const results = [];
  let sentCount = 0;
  let queuedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const fee of candidateFees) {
    const studentUser = fee.student;
    if (!studentUser || studentUser.isDeleted || studentUser.status !== "active") {
      skippedCount++;
      results.push({ feeId: fee._id, status: "skipped", reason: "Student inactive or deleted" });
      continue;
    }

    if (fee.balanceAmount <= 0) {
      skippedCount++;
      results.push({ feeId: fee._id, status: "skipped", reason: "Fee balance zero" });
      continue;
    }

    const recipient = await resolveRecipientContact(studentUser, fee.studentProfile, recipientRole === "parent");
    const phoneValidation = normalizePhoneNumber(recipient.phone);

    if (!phoneValidation.isValid) {
      skippedCount++;
      results.push({
        feeId: fee._id,
        studentName: studentUser.fullName,
        status: "skipped",
        reason: `Invalid phone: ${phoneValidation.reason}`,
      });
      continue;
    }

    if ((integration?.optOutPhoneNumbers || []).includes(phoneValidation.normalizedPhone)) {
      skippedCount++;
      results.push({
        feeId: fee._id,
        studentName: studentUser.fullName,
        status: "skipped",
        reason: "Recipient opted out",
      });
      continue;
    }

    const nextDue = (fee.installments || [])
      .filter((i) => !["paid", "waived"].includes(i.status))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

    const formattedDueDate = nextDue?.dueDate
      ? new Date(nextDue.dueDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Promptly";

    const renderedMessage = renderTemplateMessage(rawTemplate, {
      academyName,
      studentName: studentUser.fullName,
      parentName: recipient.name,
      className: fee.batch?.name || fee.course?.title || "Class",
      feeAmount: String(fee.totalPayable),
      paidAmount: String(fee.paidAmount),
      pendingAmount: String(fee.balanceAmount),
      dueDate: formattedDueDate,
      installmentName: nextDue?.label || "Consolidated Balance",
      supportPhone,
    });

    const clickToChatUrl = generateClickToChatUrl(phoneValidation.normalizedPhone, renderedMessage);

    const reminder = await FeeReminder.create({
      academyId,
      studentId: studentUser._id,
      studentProfileId: fee.studentProfile,
      feeId: fee._id,
      installmentId: nextDue?._id || null,
      installmentLabel: nextDue?.label || "Consolidated Balance",
      recipient: {
        name: recipient.name,
        phone: phoneValidation.normalizedPhone,
        role: recipient.role,
      },
      amountDue: fee.balanceAmount,
      dueDate: nextDue?.dueDate || null,
      channel: canUseCloudApi ? "whatsapp_cloud_api" : "whatsapp_click_to_chat",
      reminderType: "manual",
      reminderRule: "bulk_manual",
      templateId: templateDoc?._id || null,
      renderedMessage,
      clickToChatUrl,
      status: canUseCloudApi ? "processing" : "draft",
      createdBy: req.user._id,
    });

    if (canUseCloudApi) {
      try {
        const apiResult = await sendMetaCloudMessage({
          phoneNumberId: integration.phoneNumberId,
          accessToken: integration.accessToken,
          toPhone: phoneValidation.normalizedPhone,
          messageText: renderedMessage,
          templateName: templateDoc?.approvalStatus === "approved" ? templateDoc.providerTemplateName : null,
        });

        reminder.status = "sent_to_provider";
        reminder.providerMessageId = apiResult.messageId;
        reminder.providerResponse = apiResult.providerResponse;
        reminder.sentAt = new Date();
        reminder.attemptCount = 1;
        await reminder.save();

        sentCount++;
        results.push({
          feeId: fee._id,
          studentName: studentUser.fullName,
          status: "sent_to_provider",
          messageId: apiResult.messageId,
        });
      } catch (apiErr) {
        reminder.status = "failed";
        reminder.failedAt = new Date();
        reminder.failureReason = apiErr.message || "Meta API error";
        reminder.providerResponse = apiErr.providerResponse || null;
        reminder.attemptCount = 1;
        await reminder.save();

        failedCount++;
        results.push({
          feeId: fee._id,
          studentName: studentUser.fullName,
          status: "failed",
          error: apiErr.message,
        });
      }
    } else {
      queuedCount++;
      results.push({
        feeId: fee._id,
        studentName: studentUser.fullName,
        status: "draft",
        clickToChatUrl,
      });
    }
  }

  await logReminderAudit(academyId, req.user._id, "BULK_REMINDERS_DISPATCHED", null, {
    totalCandidates: candidateFees.length,
    sentCount,
    queuedCount,
    skippedCount,
    failedCount,
  });

  res.status(200).json({
    success: true,
    message: canUseCloudApi
      ? `Dispatched ${sentCount} reminders via WhatsApp Cloud API (${failedCount} failed, ${skippedCount} skipped).`
      : `Generated ${queuedCount} manual WhatsApp reminders (${skippedCount} skipped).`,
    summary: {
      totalCandidates: candidateFees.length,
      sentCount,
      queuedCount,
      skippedCount,
      failedCount,
    },
    results,
  });
});

exports.confirmManualSend = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const reminder = await FeeReminder.findOne({ _id: req.params.reminderId, academyId });

  if (!reminder) {
    return res.status(404).json({ success: false, message: "Reminder record not found." });
  }

  reminder.status = "manually_confirmed";
  reminder.manuallyConfirmedAt = new Date();
  reminder.manuallyConfirmedBy = req.user._id;
  await reminder.save();

  await logReminderAudit(academyId, req.user._id, "MANUAL_REMINDER_CONFIRMED", reminder._id);

  res.status(200).json({
    success: true,
    message: "Reminder marked as manually confirmed.",
    data: reminder,
  });
});

exports.retryReminder = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const reminder = await FeeReminder.findOne({ _id: req.params.reminderId, academyId });

  if (!reminder) {
    return res.status(404).json({ success: false, message: "Reminder not found." });
  }

  // Revalidate fee balance
  const fee = await StudentFee.findOne({ _id: reminder.feeId, academyId, isDeleted: false });
  if (!fee || fee.balanceAmount <= 0) {
    reminder.status = "cancelled";
    reminder.failureReason = "Fee account has since been fully paid.";
    await reminder.save();
    return res.status(400).json({
      success: false,
      message: "Fee has already been settled. Reminder marked as cancelled.",
    });
  }

  const integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken +appSecret");
  const canUseCloudApi =
    integration &&
    integration.mode === "cloud_api" &&
    integration.connectionStatus === "connected" &&
    integration.accessToken;

  reminder.attemptCount = (reminder.attemptCount || 0) + 1;

  if (canUseCloudApi) {
    reminder.status = "processing";
    await reminder.save();

    try {
      const apiResult = await sendMetaCloudMessage({
        phoneNumberId: integration.phoneNumberId,
        accessToken: integration.accessToken,
        toPhone: reminder.recipient.phone,
        messageText: reminder.renderedMessage,
      });

      reminder.status = "sent_to_provider";
      reminder.providerMessageId = apiResult.messageId;
      reminder.providerResponse = apiResult.providerResponse;
      reminder.sentAt = new Date();
      reminder.failedAt = null;
      reminder.failureReason = null;
      await reminder.save();

      await logReminderAudit(academyId, req.user._id, "REMINDER_RETRIED", reminder._id, {
        attemptCount: reminder.attemptCount,
      });

      return res.status(200).json({
        success: true,
        message: "Reminder retried and accepted by WhatsApp provider.",
        data: reminder,
      });
    } catch (apiErr) {
      reminder.status = "failed";
      reminder.failedAt = new Date();
      reminder.failureReason = apiErr.message || "Retry dispatch failed";
      reminder.providerResponse = apiErr.providerResponse || null;
      await reminder.save();

      return res.status(502).json({
        success: false,
        message: `Retry failed: ${apiErr.message}`,
        data: reminder,
      });
    }
  }

  // Click-to-Chat fallback
  reminder.status = "draft";
  reminder.clickToChatUrl = generateClickToChatUrl(reminder.recipient.phone, reminder.renderedMessage);
  await reminder.save();

  await logReminderAudit(academyId, req.user._id, "REMINDER_RETRIED", reminder._id, {
    method: "click_to_chat",
  });

  res.status(200).json({
    success: true,
    message: "Manual link refreshed for retry.",
    data: reminder,
  });
});

exports.cancelReminder = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const reminder = await FeeReminder.findOne({ _id: req.params.reminderId, academyId });

  if (!reminder) {
    return res.status(404).json({ success: false, message: "Reminder not found." });
  }

  reminder.status = "cancelled";
  reminder.notes = (reminder.notes ? reminder.notes + "; " : "") + `Cancelled by ${req.user.fullName || "Admin"}`;
  await reminder.save();

  await logReminderAudit(academyId, req.user._id, "REMINDER_CANCELLED", reminder._id);

  res.status(200).json({ success: true, message: "Reminder cancelled successfully." });
});

// ----------------------------------------------------
// 5. SETTINGS & AUTOMATIC RULES
// ----------------------------------------------------
exports.getSettings = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  let settings = await ReminderSettings.findOne({ academyId });

  if (!settings) {
    settings = await ReminderSettings.create({
      academyId,
      updatedBy: req.user._id,
    });
  }

  await ensureDefaultTemplates(academyId, req.user._id);

  res.status(200).json({ success: true, data: settings });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const {
    automaticRemindersEnabled,
    isPaused,
    timezone,
    allowedSendingHours,
    rules,
    overdueRemindersEnabled,
    maximumRemindersPerInstallment,
    minimumReminderIntervalDays,
    excludeOptedOut,
  } = req.body;

  let settings = await ReminderSettings.findOne({ academyId });
  if (!settings) {
    settings = new ReminderSettings({ academyId });
  }

  if (automaticRemindersEnabled !== undefined) settings.automaticRemindersEnabled = Boolean(automaticRemindersEnabled);
  if (isPaused !== undefined) settings.isPaused = Boolean(isPaused);
  if (timezone) settings.timezone = timezone;
  if (allowedSendingHours) {
    if (allowedSendingHours.start) settings.allowedSendingHours.start = allowedSendingHours.start;
    if (allowedSendingHours.end) settings.allowedSendingHours.end = allowedSendingHours.end;
  }
  if (Array.isArray(rules)) settings.rules = rules;
  if (overdueRemindersEnabled !== undefined) settings.overdueRemindersEnabled = Boolean(overdueRemindersEnabled);
  if (maximumRemindersPerInstallment !== undefined) settings.maximumRemindersPerInstallment = Number(maximumRemindersPerInstallment);
  if (minimumReminderIntervalDays !== undefined) settings.minimumReminderIntervalDays = Number(minimumReminderIntervalDays);
  if (excludeOptedOut !== undefined) settings.excludeOptedOut = Boolean(excludeOptedOut);

  settings.updatedBy = req.user._id;
  await settings.save();

  await logReminderAudit(academyId, req.user._id, "SETTINGS_UPDATE", null, {
    automaticRemindersEnabled: settings.automaticRemindersEnabled,
    isPaused: settings.isPaused,
  });

  res.status(200).json({ success: true, message: "Reminder settings updated successfully.", data: settings });
});

// ----------------------------------------------------
// 6. MESSAGE TEMPLATES
// ----------------------------------------------------
exports.listTemplates = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  await ensureDefaultTemplates(academyId, req.user._id);

  const templates = await ReminderTemplate.find({ academyId })
    .sort({ isDefault: -1, category: 1, createdAt: -1 })
    .populate("createdBy", "fullName email");

  res.status(200).json({ success: true, data: templates });
});

exports.createTemplate = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const { name, category = "due_soon", messageBody, providerTemplateName, language = "en" } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Template name is required." });
  }
  if (!messageBody || !messageBody.trim()) {
    return res.status(400).json({ success: false, message: "Template message body is required." });
  }

  const template = await ReminderTemplate.create({
    academyId,
    name: name.trim(),
    category,
    messageBody: messageBody.trim(),
    providerTemplateName: (providerTemplateName || "").trim(),
    language,
    approvalStatus: providerTemplateName ? "pending_approval" : "approved",
    createdBy: req.user._id,
  });

  await logReminderAudit(academyId, req.user._id, "TEMPLATE_CREATE", null, { templateId: template._id, name });

  res.status(201).json({ success: true, message: "Template created successfully.", data: template });
});

exports.updateTemplate = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const template = await ReminderTemplate.findOne({ _id: req.params.templateId, academyId });

  if (!template) {
    return res.status(404).json({ success: false, message: "Template not found." });
  }

  const { name, category, messageBody, providerTemplateName, language, isActive, approvalStatus } = req.body;

  if (name) template.name = name.trim();
  if (category) template.category = category;
  if (messageBody) template.messageBody = messageBody.trim();
  if (providerTemplateName !== undefined) template.providerTemplateName = providerTemplateName.trim();
  if (language) template.language = language;
  if (isActive !== undefined) template.isActive = Boolean(isActive);
  if (approvalStatus) template.approvalStatus = approvalStatus;

  template.updatedBy = req.user._id;
  await template.save();

  await logReminderAudit(academyId, req.user._id, "TEMPLATE_UPDATE", null, { templateId: template._id });

  res.status(200).json({ success: true, message: "Template updated successfully.", data: template });
});

exports.deleteTemplate = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const template = await ReminderTemplate.findOne({ _id: req.params.templateId, academyId });

  if (!template) {
    return res.status(404).json({ success: false, message: "Template not found." });
  }

  await ReminderTemplate.deleteOne({ _id: template._id });
  await logReminderAudit(academyId, req.user._id, "TEMPLATE_DELETE", null, { templateId: template._id });

  res.status(200).json({ success: true, message: "Template removed." });
});

exports.resetDefaultTemplates = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const academyDoc = await Academy.findById(academyId).select("name");
  const defaults = getDefaultTemplates(academyDoc?.name || "MyAcademy");

  for (const tmpl of defaults) {
    const existing = await ReminderTemplate.findOne({ academyId, name: tmpl.name });
    if (!existing) {
      await ReminderTemplate.create({
        ...tmpl,
        academyId,
        createdBy: req.user._id,
      });
    }
  }

  const allTemplates = await ReminderTemplate.find({ academyId });
  res.status(200).json({ success: true, message: "Recommended default templates restored.", data: allTemplates });
});

// ----------------------------------------------------
// 7. INTEGRATION SETTINGS & TESTING
// ----------------------------------------------------
exports.getIntegration = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  let integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken");

  if (!integration) {
    integration = await WhatsAppIntegration.create({
      academyId,
      mode: "manual",
      updatedBy: req.user._id,
    });
  }

  // Mask access token for security
  const safeData = integration.toObject();
  if (safeData.accessToken) {
    safeData.hasAccessToken = true;
    safeData.accessToken = safeData.accessToken.slice(0, 6) + "..." + safeData.accessToken.slice(-4);
  } else {
    safeData.hasAccessToken = false;
  }

  res.status(200).json({ success: true, data: safeData });
});

exports.saveIntegration = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const {
    mode = "manual",
    phoneNumberId = "",
    businessAccountId = "",
    accessToken,
    webhookVerifyToken = "",
    senderPhoneNumber = "",
  } = req.body;

  let integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken");
  if (!integration) {
    integration = new WhatsAppIntegration({ academyId });
  }

  integration.mode = mode;
  integration.provider = mode === "cloud_api" ? "meta_cloud_api" : "none";
  integration.phoneNumberId = phoneNumberId.trim();
  integration.businessAccountId = businessAccountId.trim();
  integration.webhookVerifyToken = webhookVerifyToken.trim();
  integration.senderPhoneNumber = senderPhoneNumber.trim();

  // Only update access token if a non-masked token is provided
  if (accessToken && !accessToken.includes("...")) {
    integration.accessToken = accessToken.trim();
  }

  if (mode === "manual") {
    integration.connectionStatus = "connected"; // Manual mode is always ready
    integration.lastError = "";
  } else if (!integration.phoneNumberId || !integration.accessToken) {
    integration.connectionStatus = "not_configured";
  }

  integration.updatedBy = req.user._id;
  await integration.save();

  await logReminderAudit(academyId, req.user._id, "INTEGRATION_UPDATE", null, { mode });

  res.status(200).json({
    success: true,
    message: "WhatsApp integration settings saved.",
    data: {
      mode: integration.mode,
      connectionStatus: integration.connectionStatus,
      phoneNumberId: integration.phoneNumberId,
      senderPhoneNumber: integration.senderPhoneNumber,
    },
  });
});

exports.testIntegrationConnection = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken");

  if (!integration || integration.mode !== "cloud_api") {
    return res.status(200).json({
      success: true,
      data: {
        mode: "manual",
        connectionStatus: "connected",
        message: "Manual WhatsApp mode is active and requires no external API credentials.",
      },
    });
  }

  if (!integration.phoneNumberId || !integration.accessToken) {
    return res.status(400).json({
      success: false,
      message: "Please configure Phone Number ID and Access Token before testing.",
    });
  }

  // Ping Meta Graph API endpoint for this phone number ID
  const testUrl = `https://graph.facebook.com/v21.0/${integration.phoneNumberId}`;
  try {
    const metaRes = await fetch(testUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
      },
    });

    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      const errMsg = metaData?.error?.message || "Invalid Meta credentials";
      integration.connectionStatus = "failed";
      integration.lastError = errMsg;
      integration.lastConnectionTestAt = new Date();
      await integration.save();

      return res.status(400).json({
        success: false,
        message: `Connection failed: ${errMsg}`,
        error: metaData?.error,
      });
    }

    integration.connectionStatus = "connected";
    integration.senderPhoneNumber = metaData?.display_phone_number || integration.senderPhoneNumber;
    integration.lastConnectionTestAt = new Date();
    integration.lastError = "";
    await integration.save();

    res.status(200).json({
      success: true,
      message: "Successfully connected to Meta WhatsApp Business Cloud API!",
      data: {
        verifiedName: metaData?.verified_name,
        displayPhoneNumber: metaData?.display_phone_number,
        qualityRating: metaData?.quality_rating,
        status: "connected",
      },
    });
  } catch (err) {
    integration.connectionStatus = "failed";
    integration.lastError = err.message;
    await integration.save();

    res.status(502).json({
      success: false,
      message: `Network or connection error while contacting Meta: ${err.message}`,
    });
  }
});

exports.disconnectIntegration = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const integration = await WhatsAppIntegration.findOne({ academyId });

  if (integration) {
    integration.mode = "manual";
    integration.provider = "none";
    integration.phoneNumberId = "";
    integration.accessToken = "";
    integration.connectionStatus = "connected";
    integration.lastError = "";
    integration.updatedBy = req.user._id;
    await integration.save();
  }

  await logReminderAudit(academyId, req.user._id, "INTEGRATION_DISCONNECT");

  res.status(200).json({
    success: true,
    message: "WhatsApp Cloud API disconnected. System reverted to Click-to-Chat manual mode.",
  });
});

// ----------------------------------------------------
// 8. SCHEDULED REMINDERS
// ----------------------------------------------------
exports.listScheduled = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const scheduled = await FeeReminder.find({
    academyId,
    status: "scheduled",
  })
    .populate("studentId", "fullName email phone")
    .populate("feeId")
    .populate("createdBy", "fullName")
    .sort({ scheduledAt: 1 });

  res.status(200).json({ success: true, count: scheduled.length, data: scheduled });
});

exports.scheduleReminder = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const { studentFeeId, installmentId, scheduledAt, templateId, customMessage, recipientRole = "student" } = req.body;

  if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
    return res.status(400).json({ success: false, message: "Please select a valid future date and time." });
  }

  const fee = await StudentFee.findOne({ _id: studentFeeId, academyId, isDeleted: false })
    .populate("student", "fullName phone email")
    .populate("batch", "name")
    .populate("course", "title");

  if (!fee || fee.balanceAmount <= 0) {
    return res.status(400).json({ success: false, message: "Valid unpaid fee account is required." });
  }

  const academyDoc = await Academy.findById(academyId).select("name phone supportPhone");
  const academyName = academyDoc?.name || "MyAcademy";
  const supportPhone = academyDoc?.supportPhone || academyDoc?.phone || "";

  const recipient = await resolveRecipientContact(fee.student, fee.studentProfile, recipientRole === "parent");
  const phoneValidation = normalizePhoneNumber(recipient.phone);

  if (!phoneValidation.isValid) {
    return res.status(400).json({ success: false, message: `Invalid phone number: ${phoneValidation.reason}` });
  }

  let templateDoc = null;
  let rawTemplate = customMessage || "";
  if (!rawTemplate && templateId && mongoose.Types.ObjectId.isValid(templateId)) {
    templateDoc = await ReminderTemplate.findOne({ _id: templateId, academyId, isActive: true });
    if (templateDoc) rawTemplate = templateDoc.messageBody;
  }
  if (!rawTemplate) {
    rawTemplate = `Dear {{parentName}}, reminder from {{academyName}} for {{studentName}}. Fee amount: ₹{{pendingAmount}} due on {{dueDate}}.`;
  }

  const renderedMessage = renderTemplateMessage(rawTemplate, {
    academyName,
    studentName: fee.student.fullName,
    parentName: recipient.name,
    className: fee.batch?.name || fee.course?.title || "Class",
    feeAmount: String(fee.totalPayable),
    paidAmount: String(fee.paidAmount),
    pendingAmount: String(fee.balanceAmount),
    dueDate: "Scheduled Due",
    installmentName: "Scheduled Reminder",
    supportPhone,
  });

  const scheduledReminder = await FeeReminder.create({
    academyId,
    studentId: fee.student._id,
    studentProfileId: fee.studentProfile,
    feeId: fee._id,
    installmentId: installmentId || null,
    recipient: {
      name: recipient.name,
      phone: phoneValidation.normalizedPhone,
      role: recipient.role,
    },
    amountDue: fee.balanceAmount,
    dueDate: new Date(scheduledAt),
    channel: "whatsapp_cloud_api",
    reminderType: "scheduled",
    reminderRule: "one_time_scheduled",
    templateId: templateDoc?._id || null,
    renderedMessage,
    status: "scheduled",
    scheduledAt: new Date(scheduledAt),
    createdBy: req.user._id,
  });

  await logReminderAudit(academyId, req.user._id, "REMINDER_SCHEDULED", scheduledReminder._id, {
    scheduledAt,
  });

  res.status(201).json({
    success: true,
    message: "One-time reminder scheduled successfully.",
    data: scheduledReminder,
  });
});

exports.triggerAutomaticRun = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const result = await processAcademyReminders(academyId);

  await logReminderAudit(academyId, req.user._id, "AUTOMATIC_DISPATCH_TRIGGERED", null, result);

  res.status(200).json({
    success: true,
    message: "Automated fee reminder evaluation completed.",
    data: result,
  });
});

// ----------------------------------------------------
// 9. WEBHOOKS (META CLOUD API)
// ----------------------------------------------------
exports.verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Verify against global or any tenant verifyToken
  const globalToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "myacademy_verify_token";

  if (mode === "subscribe" && (token === globalToken || token)) {
    console.log("Meta webhook subscription verified successfully.");
    return res.status(200).send(challenge);
  }

  res.status(403).send("Verification token mismatch.");
};

exports.handleWebhookEvent = async (req, res) => {
  try {
    const body = req.body;

    if (body.object === "whatsapp_business_account" && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value && Array.isArray(value.statuses)) {
            for (const statusObj of value.statuses) {
              const providerMessageId = statusObj.id; // e.g. wamid.HBg...
              const status = statusObj.status; // 'sent', 'delivered', 'read', 'failed'
              const timestamp = statusObj.timestamp ? new Date(parseInt(statusObj.timestamp, 10) * 1000) : new Date();

              const updateFields = {};
              if (status === "delivered") {
                updateFields.status = "delivered";
                updateFields.deliveredAt = timestamp;
              } else if (status === "read") {
                updateFields.status = "read";
                updateFields.readAt = timestamp;
              } else if (status === "failed") {
                updateFields.status = "failed";
                updateFields.failedAt = timestamp;
                const errDetail = statusObj.errors?.[0]?.message || statusObj.errors?.[0]?.title || "Provider reported failure";
                updateFields.failureReason = errDetail;
              }

              if (Object.keys(updateFields).length > 0) {
                await FeeReminder.findOneAndUpdate(
                  { providerMessageId },
                  { $set: updateFields }
                );
              }
            }
          }
        }
      }
    }

    // Acknowledge receipt quickly to Meta with 200 OK
    res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(200).send("EVENT_RECEIVED"); // Always send 200 so Meta doesn't retry endlessly
  }
};
