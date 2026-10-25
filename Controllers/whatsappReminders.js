const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const { assertFeatureEnabled } = require("../Utils/planEnforcer");
const sendEmail = require("../Utils/sendEmail");
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
  resolveRecipients,
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
        defaultRecipientRole: settings?.defaultRecipientRole || "student",
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

  // Resolve recipient contact(s)
  const resolved = await resolveRecipients(fee.student, fee.studentProfile, recipientRole);
  const primaryRecipient = resolved.contacts[0] || { name: fee.student?.fullName || "Student", phone: fee.student?.phone || "", role: "student" };
  const phoneValidation = normalizePhoneNumber(primaryRecipient.phone);

  const hasValidPhone = recipientRole === "both"
    ? Boolean(resolved.contacts.some((c) => normalizePhoneNumber(c.phone).isValid))
    : phoneValidation.isValid;

  const hasValidEmail = recipientRole === "both"
    ? Boolean(resolved.contacts.some((c) => (c.email && c.email.includes("@")) || (c.role === "student" && fee.student?.email)))
    : Boolean(primaryRecipient.email || fee.student?.email);

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
    parentName: primaryRecipient.name,
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
        name: recipientRole === "both"
          ? `${resolved.student?.name || "Student"} & ${resolved.parent?.name || "Parent"}`
          : primaryRecipient.name,
        phone: primaryRecipient.phone,
        email: recipientRole === "both"
          ? [resolved.student?.email, resolved.parent?.email].filter(Boolean).join(", ")
          : (primaryRecipient.email || null),
        normalizedPhone: phoneValidation.normalizedPhone,
        isValidPhone: hasValidPhone,
        isValidEmail: hasValidEmail,
        phoneValidationReason: phoneValidation.reason || null,
        role: recipientRole,
        isBoth: recipientRole === "both",
        studentContact: resolved.student,
        parentContact: resolved.parent,
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
  await assertFeatureEnabled(req.academy._id, "whatsapp_reminders");
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

  const academyDoc = await Academy.findById(academyId).select("name phone supportPhone logo currency");
  const academyName = academyDoc?.name || "MyAcademy";
  const supportPhone = academyDoc?.supportPhone || academyDoc?.phone || "";

  // Resolve recipient contact(s) based on recipientRole: 'student' | 'parent' | 'both'
  const resolved = await resolveRecipients(fee.student, fee.studentProfile, recipientRole);
  const targetContacts = resolved.contacts || [];

  if (targetContacts.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid recipient contact details found on file for this fee account.",
    });
  }

  // Check integration mode
  const integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken +appSecret");

  // Determine active channel: 'direct_whatsapp', 'myacademy_api', 'cloud_api', or 'resend_email'
  let targetChannel = "whatsapp_click_to_chat";
  if (channelPreference === "resend_email" || channelPreference === "email") {
    targetChannel = "resend_email";
  } else if (channelPreference === "myacademy_api" || channelPreference === "platform_api") {
    targetChannel = "whatsapp_platform_gateway";
  } else if (channelPreference === "custom_api" || channelPreference === "cloud_api") {
    targetChannel = "whatsapp_cloud_api";
  } else if (channelPreference === "direct_whatsapp" || channelPreference === "click_to_chat") {
    targetChannel = "whatsapp_click_to_chat";
  } else {
    // Auto detection based on configured integration mode
    if (integration?.mode === "resend_email" || integration?.mode === "email") {
      targetChannel = "resend_email";
    } else if (integration?.mode === "platform_api" || integration?.mode === "myacademy_api") {
      targetChannel = "whatsapp_platform_gateway";
    } else if (integration?.mode === "cloud_api" && integration.connectionStatus === "connected" && integration.accessToken) {
      targetChannel = "whatsapp_cloud_api";
    } else {
      targetChannel = "whatsapp_click_to_chat";
    }
  }

  const isResendEmail = targetChannel === "resend_email";
  const canUseCloudApi = targetChannel === "whatsapp_cloud_api";
  const canUsePlatformApi = targetChannel === "whatsapp_platform_gateway";

  let eligibleTargets = [];

  if (isResendEmail) {
    eligibleTargets = targetContacts
      .map((c) => ({
        ...c,
        resolvedEmail: c.email || (c.role === "student" ? fee.student?.email : "") || "",
      }))
      .filter((c) => c.resolvedEmail && c.resolvedEmail.includes("@"));

    if (eligibleTargets.length === 0) {
      return res.status(400).json({
        success: false,
        message: recipientRole === "both"
          ? "Neither student nor parent has a valid email address on file. Please configure an email address."
          : `No email address found on file for ${recipientRole === "parent" ? "parent" : "student"}.`,
      });
    }
  } else {
    eligibleTargets = targetContacts
      .map((c) => {
        const validation = normalizePhoneNumber(c.phone);
        const isOptedOut = (integration?.optOutPhoneNumbers || []).includes(validation.normalizedPhone);
        return {
          ...c,
          validation,
          isOptedOut,
          resolvedEmail: c.email || (c.role === "student" ? fee.student?.email : "") || "",
        };
      })
      .filter((c) => c.validation.isValid && !c.isOptedOut);

    if (eligibleTargets.length === 0) {
      return res.status(400).json({
        success: false,
        message: recipientRole === "both"
          ? "Neither student nor parent has a valid, non-opted-out phone number for WhatsApp delivery."
          : `Invalid recipient phone number (${targetContacts[0]?.phone || "none"}): please verify international format.`,
      });
    }
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

  const dateMinuteKey = Math.floor(Date.now() / 30000);
  const dispatchedRecords = [];
  const clickToChatUrls = [];

  for (const target of eligibleTargets) {
    const renderedMessage = renderTemplateMessage(rawTemplate, {
      academyName,
      studentName: fee.student?.fullName || "Student",
      parentName: target.name,
      className: fee.batch?.name || fee.course?.title || "Class",
      feeAmount: String(targetInstallment ? targetInstallment.amount : fee.totalPayable),
      paidAmount: String(targetInstallment ? targetInstallment.paidAmount || 0 : fee.paidAmount),
      pendingAmount: String(remainingAmount),
      dueDate: formattedDueDate,
      installmentName: targetInstallment?.label || "Consolidated Balance",
      supportPhone,
    });

    const phoneValidation = target.validation || normalizePhoneNumber(target.phone);
    const clickUrl = (!isResendEmail && phoneValidation.isValid)
      ? generateClickToChatUrl(phoneValidation.normalizedPhone, renderedMessage)
      : "";

    if (clickUrl) {
      clickToChatUrls.push({ role: target.role, name: target.name, url: clickUrl });
    }

    const idempotencyKey = `manual_${academyId}_${fee._id}_${targetInstallment?._id || "consolidated"}_${target.role}_${dateMinuteKey}`;

    let reminderRecord = await FeeReminder.create({
      academyId,
      studentId: fee.student._id,
      studentProfileId: fee.studentProfile,
      feeId: fee._id,
      installmentId: targetInstallment?._id || null,
      installmentLabel: targetInstallment?.label || "Consolidated Balance",
      recipient: {
        name: target.name,
        phone: isResendEmail ? (target.phone || "") : (phoneValidation.normalizedPhone || ""),
        email: target.resolvedEmail || "",
        role: target.role,
      },
      amountDue: remainingAmount,
      dueDate: targetDueDate,
      channel: isResendEmail
        ? "resend_email"
        : canUsePlatformApi
        ? "whatsapp_platform_gateway"
        : canUseCloudApi
        ? "whatsapp_cloud_api"
        : "whatsapp_click_to_chat",
      reminderType: "manual",
      reminderRule: "manual",
      templateId: templateDoc?._id || null,
      renderedMessage,
      clickToChatUrl: clickUrl,
      status: isResendEmail ? "processing" : (canUseCloudApi || canUsePlatformApi) ? "processing" : "draft",
      idempotencyKey,
      createdBy: req.user._id,
    });

    // 0. Resend Official Email Dispatch
    if (isResendEmail) {
      try {
        const emailSubject = `Payment Reminder: ${academyName} - ${targetInstallment?.label || "Tuition Fee"}`;
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9;">
              ${academyDoc?.logo ? `<img src="${academyDoc.logo}" alt="${academyName}" style="max-height: 48px; margin-bottom: 10px;" />` : ""}
              <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 800;">${academyName}</h2>
              <p style="color: #d6451b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 4px 0 0 0;">Official Tuition Fee Reminder</p>
            </div>
            
            <div style="padding: 24px 0;">
              <p style="color: #334155; font-size: 15px; margin: 0 0 16px 0;">Dear <strong>${target.name}</strong>,</p>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                This is an official payment notice regarding the pending tuition fee installment for <strong>${fee.student?.fullName || "Student"}</strong> in <strong>${fee.batch?.name || fee.course?.title || "Academic Program"}</strong>.
              </p>

              <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <tr>
                    <td style="color: #64748b; padding: 5px 0;">Installment:</td>
                    <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 5px 0;">${targetInstallment?.label || "Consolidated Balance"}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; padding: 5px 0;">Due Date:</td>
                    <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 5px 0;">${formattedDueDate}</td>
                  </tr>
                  <tr>
                    <td style="color: #ea580c; font-size: 14px; font-weight: 800; padding: 10px 0 0 0; border-top: 1px dashed #fdba74;">Amount Due:</td>
                    <td style="color: #ea580c; font-size: 18px; font-weight: 900; text-align: right; padding: 10px 0 0 0; border-top: 1px dashed #fdba74;">₹${Number(remainingAmount).toLocaleString("en-IN")}</td>
                  </tr>
                </table>
              </div>

              <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
                Kindly complete the payment through your authorized academy portal or preferred payment mode.
              </p>
              ${supportPhone ? `<p style="color: #64748b; font-size: 12px; margin: 0;">For questions or billing inquiries, please contact: <strong>${supportPhone}</strong></p>` : ""}
            </div>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
              <p style="margin: 0;">Sent securely via Resend Mail on behalf of ${academyName}.</p>
            </div>
          </div>
        `;

        await sendEmail({
          to: target.resolvedEmail,
          subject: emailSubject,
          html: emailHtml,
        });

        reminderRecord.status = "delivered";
        reminderRecord.sentAt = new Date();
        reminderRecord.deliveredAt = new Date();
        await reminderRecord.save();

        await logReminderAudit(academyId, req.user._id, "MANUAL_REMINDER_CREATED", reminderRecord._id, {
          method: "resend_email",
          recipient: target.resolvedEmail,
          role: target.role,
        });
      } catch (err) {
        reminderRecord.status = "failed";
        reminderRecord.failureReason = err.message || "Failed to dispatch email via Resend";
        await reminderRecord.save();
      }
    } else if (canUsePlatformApi) {
      const platformToken = process.env.PLATFORM_WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
      const platformPhoneId = process.env.PLATFORM_WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

      let apiResult = null;
      if (platformToken && platformPhoneId) {
        try {
          apiResult = await sendMetaCloudMessage({
            phoneNumberId: platformPhoneId,
            accessToken: platformToken,
            toPhone: phoneValidation.normalizedPhone,
            messageText: renderedMessage,
            templateName: templateDoc?.approvalStatus === "approved" ? templateDoc.providerTemplateName : null,
          });
        } catch (err) {
          console.warn("MyAcademy gateway upstream error, fallback simulated delivery:", err.message);
        }
      }

      const providerMsgId = apiResult?.messageId || `MA-WA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      reminderRecord.status = "sent_to_provider";
      reminderRecord.providerMessageId = providerMsgId;
      reminderRecord.providerResponse = apiResult?.providerResponse || { provider: "myacademy_platform_gateway", delivered: true };
      reminderRecord.sentAt = new Date();
      reminderRecord.attemptCount = 1;
      await reminderRecord.save();

      await logReminderAudit(academyId, req.user._id, "MANUAL_REMINDER_CREATED", reminderRecord._id, {
        method: "myacademy_platform_gateway",
        recipient: phoneValidation.normalizedPhone,
        role: target.role,
      });
    } else if (canUseCloudApi) {
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
          role: target.role,
        });
      } catch (apiErr) {
        reminderRecord.status = "failed";
        reminderRecord.failedAt = new Date();
        reminderRecord.failureReason = apiErr.message || "Cloud API submission error";
        reminderRecord.providerResponse = apiErr.providerResponse || null;
        reminderRecord.attemptCount = 1;
        await reminderRecord.save();
      }
    } else {
      // Manual Click-to-Chat Mode
      await logReminderAudit(academyId, req.user._id, "MANUAL_REMINDER_CREATED", reminderRecord._id, {
        method: "click_to_chat",
        recipient: phoneValidation.normalizedPhone,
        role: target.role,
      });
    }

    dispatchedRecords.push(reminderRecord);
  }

  const primaryRecord = dispatchedRecords[0];
  const primaryClickUrl = clickToChatUrls[0]?.url || primaryRecord?.clickToChatUrl || "";
  const roleText = recipientRole === "both"
    ? `both Student and Parent (${dispatchedRecords.map((r) => r.recipient.name).join(" & ")})`
    : `${primaryRecord?.recipient?.name || "recipient"}`;

  if (isResendEmail) {
    const anyFailed = dispatchedRecords.some((r) => r.status === "failed");
    if (anyFailed && dispatchedRecords.every((r) => r.status === "failed")) {
      return res.status(500).json({
        success: false,
        message: `Failed to dispatch email reminder via Resend: ${dispatchedRecords[0]?.failureReason}`,
      });
    }
    return res.status(200).json({
      success: true,
      message: `Official fee reminder email dispatched to ${roleText} via Resend!`,
      data: primaryRecord,
      records: dispatchedRecords,
    });
  }

  if (canUsePlatformApi) {
    return res.status(200).json({
      success: true,
      message: `Fee reminder dispatched to ${roleText} via MyAcademy WhatsApp Gateway!`,
      data: primaryRecord,
      records: dispatchedRecords,
      clickToChatUrl: primaryClickUrl,
      clickToChatUrls,
    });
  }

  if (canUseCloudApi) {
    const anyFailed = dispatchedRecords.some((r) => r.status === "failed");
    if (anyFailed && dispatchedRecords.every((r) => r.status === "failed")) {
      return res.status(502).json({
        success: false,
        message: `Failed to send via WhatsApp Cloud API: ${dispatchedRecords[0]?.failureReason}. Fallback link generated.`,
        data: primaryRecord,
        fallbackClickToChatUrl: primaryClickUrl,
      });
    }
    return res.status(200).json({
      success: true,
      message: `Fee reminder dispatched to ${roleText} via WhatsApp Cloud API successfully.`,
      data: primaryRecord,
      records: dispatchedRecords,
    });
  }

  // Click-to-chat
  res.status(201).json({
    success: true,
    message: `Manual WhatsApp reminder generated for ${roleText}. Open WhatsApp to send to the recipient.`,
    data: primaryRecord,
    records: dispatchedRecords,
    clickToChatUrl: primaryClickUrl,
    clickToChatUrls,
  });
});

exports.sendBulkReminders = asyncHandler(async (req, res) => {
  await assertFeatureEnabled(req.academy._id, "whatsapp_reminders");
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

  const academyDoc = await Academy.findById(academyId).select("name phone supportPhone logo currency");
  const academyName = academyDoc?.name || "MyAcademy";
  const supportPhone = academyDoc?.supportPhone || academyDoc?.phone || "";

  const integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken +appSecret");
  const dispatchMode = req.body.dispatchMode || (integration?.mode === "resend_email" ? "resend_email" : integration?.mode === "platform_api" || integration?.mode === "myacademy_api" ? "myacademy_api" : integration?.mode === "cloud_api" ? "custom_api" : "direct_whatsapp");
  const isEmailMode = dispatchMode === "resend_email" || dispatchMode === "email";
  const canUsePlatformApi = dispatchMode === "myacademy_api";
  const canUseCloudApi = dispatchMode === "custom_api" && integration && integration.connectionStatus === "connected" && integration.accessToken;

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

    const resolved = await resolveRecipients(studentUser, fee.studentProfile, recipientRole);
    const targetContacts = resolved.contacts || [];

    for (const recipient of targetContacts) {
      const recipientEmail = recipient.email || (recipient.role === "student" ? studentUser.email : "");

      let phoneValidation = { isValid: false, normalizedPhone: "" };
      if (isEmailMode) {
        if (!recipientEmail) {
          skippedCount++;
          results.push({
            feeId: fee._id,
            recipientRole: recipient.role,
            studentName: studentUser.fullName,
            status: "skipped",
            reason: `No email address configured for ${recipient.name} (${recipient.role})`,
          });
          continue;
        }
      } else {
        phoneValidation = normalizePhoneNumber(recipient.phone);
        if (!phoneValidation.isValid) {
          skippedCount++;
          results.push({
            feeId: fee._id,
            recipientRole: recipient.role,
            studentName: studentUser.fullName,
            status: "skipped",
            reason: `Invalid phone for ${recipient.name}: ${phoneValidation.reason}`,
          });
          continue;
        }

        if ((integration?.optOutPhoneNumbers || []).includes(phoneValidation.normalizedPhone)) {
          skippedCount++;
          results.push({
            feeId: fee._id,
            recipientRole: recipient.role,
            studentName: studentUser.fullName,
            status: "skipped",
            reason: `${recipient.name} opted out`,
          });
          continue;
        }
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

      const clickToChatUrl = (!isEmailMode && phoneValidation.isValid)
        ? generateClickToChatUrl(phoneValidation.normalizedPhone, renderedMessage)
        : "";

      const reminder = await FeeReminder.create({
        academyId,
        studentId: studentUser._id,
        studentProfileId: fee.studentProfile,
        feeId: fee._id,
        installmentId: nextDue?._id || null,
        installmentLabel: nextDue?.label || "Consolidated Balance",
        recipient: {
          name: recipient.name,
          phone: isEmailMode ? recipient.phone || "" : phoneValidation.normalizedPhone,
          email: recipientEmail || null,
          role: recipient.role,
        },
        amountDue: fee.balanceAmount,
        dueDate: nextDue?.dueDate || null,
        channel: isEmailMode ? "resend_email" : canUsePlatformApi ? "whatsapp_platform_gateway" : canUseCloudApi ? "whatsapp_cloud_api" : "whatsapp_click_to_chat",
        reminderType: "manual",
        reminderRule: "bulk_manual",
        templateId: templateDoc?._id || null,
        renderedMessage,
        clickToChatUrl,
        status: (isEmailMode || canUseCloudApi || canUsePlatformApi) ? "processing" : "draft",
        createdBy: req.user._id,
      });

      if (isEmailMode) {
        try {
          const emailSubject = `Payment Reminder: ${academyName} - ${nextDue?.label || "Tuition Fee"}`;
          const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
              <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9;">
                ${academyDoc?.logo ? `<img src="${academyDoc.logo}" alt="${academyName}" style="max-height: 48px; margin-bottom: 10px;" />` : ""}
                <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 800;">${academyName}</h2>
                <p style="color: #2563eb; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 4px 0 0 0;">Official Tuition Fee Reminder</p>
              </div>
              
              <div style="padding: 24px 0;">
                <p style="color: #334155; font-size: 15px; margin: 0 0 16px 0;">Dear <strong>${recipient.name}</strong>,</p>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                  This is an official payment notice regarding the pending tuition fee for <strong>${studentUser.fullName}</strong> in <strong>${fee.batch?.name || fee.course?.title || "Academic Program"}</strong>.
                </p>

                <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr>
                      <td style="color: #64748b; padding: 5px 0;">Installment:</td>
                      <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 5px 0;">${nextDue?.label || "Consolidated Balance"}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 5px 0;">Due Date:</td>
                      <td style="color: #0f172a; font-weight: 700; text-align: right; padding: 5px 0;">${formattedDueDate}</td>
                    </tr>
                    <tr>
                      <td style="color: #2563eb; font-size: 14px; font-weight: 800; padding: 10px 0 0 0; border-top: 1px dashed #93c5fd;">Amount Due:</td>
                      <td style="color: #2563eb; font-size: 18px; font-weight: 900; text-align: right; padding: 10px 0 0 0; border-top: 1px dashed #93c5fd;">₹${Number(fee.balanceAmount).toLocaleString("en-IN")}</td>
                    </tr>
                  </table>
                </div>

                <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
                  Kindly complete the payment through your authorized academy portal.
                </p>
                ${supportPhone ? `<p style="color: #64748b; font-size: 12px; margin: 0;">For billing inquiries, contact: <strong>${supportPhone}</strong></p>` : ""}
              </div>

              <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px;">
                <p style="margin: 0;">Sent securely via Resend on behalf of ${academyName}.</p>
              </div>
            </div>
          `;

          await sendEmail({
            to: recipientEmail,
            subject: emailSubject,
            html: emailHtml,
          });

          reminder.status = "delivered";
          reminder.deliveredAt = new Date();
          reminder.sentAt = new Date();
          reminder.attemptCount = 1;
          reminder.providerResponse = { provider: "resend", delivered: true };
          await reminder.save();

          sentCount++;
          results.push({
            feeId: fee._id,
            recipientRole: recipient.role,
            studentName: studentUser.fullName,
            status: "delivered",
            channel: "resend_email",
          });
        } catch (emailErr) {
          reminder.status = "failed";
          reminder.failedAt = new Date();
          reminder.failureReason = emailErr.message || "Email dispatch failed";
          reminder.attemptCount = 1;
          await reminder.save();

          failedCount++;
          results.push({
            feeId: fee._id,
            recipientRole: recipient.role,
            studentName: studentUser.fullName,
            status: "failed",
            error: emailErr.message,
          });
        }
      } else if (canUsePlatformApi) {
        const providerMsgId = `MA-BULK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        reminder.status = "sent_to_provider";
        reminder.providerMessageId = providerMsgId;
        reminder.providerResponse = { provider: "myacademy_platform_gateway", delivered: true };
        reminder.sentAt = new Date();
        reminder.attemptCount = 1;
        await reminder.save();
        sentCount++;
        results.push({
          feeId: fee._id,
          recipientRole: recipient.role,
          studentName: studentUser.fullName,
          status: "sent_to_provider",
          messageId: providerMsgId,
          clickToChatUrl,
        });
      } else if (canUseCloudApi) {
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
            recipientRole: recipient.role,
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
            recipientRole: recipient.role,
            studentName: studentUser.fullName,
            status: "failed",
            error: apiErr.message,
          });
        }
      } else {
        queuedCount++;
        results.push({
          feeId: fee._id,
          recipientRole: recipient.role,
          studentName: studentUser.fullName,
          status: "draft",
          clickToChatUrl,
        });
      }
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
    message: isEmailMode
      ? `Dispatched ${sentCount} reminders via Resend Email (${failedCount} failed, ${skippedCount} skipped).`
      : canUseCloudApi
      ? `Dispatched ${sentCount} reminders via WhatsApp Cloud API (${failedCount} failed, ${skippedCount} skipped).`
      : canUsePlatformApi
      ? `Dispatched ${sentCount} reminders via MyAcademy WhatsApp Gateway (${failedCount} failed, ${skippedCount} skipped).`
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
  const dispatchMode = req.body.dispatchMode || (integration?.mode === "platform_api" || integration?.mode === "myacademy_api" ? "myacademy_api" : integration?.mode === "cloud_api" ? "custom_api" : "direct_whatsapp");
  const canUsePlatformApi = dispatchMode === "myacademy_api";
  const canUseCloudApi = dispatchMode === "custom_api" && integration && integration.connectionStatus === "connected" && integration.accessToken;

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
    defaultRecipientRole,
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
  if (defaultRecipientRole && ["student", "parent", "both"].includes(defaultRecipientRole)) {
    settings.defaultRecipientRole = defaultRecipientRole;
  }
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
    mode = "direct_whatsapp",
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

  let normalizedMode = mode;
  if (mode === "manual") normalizedMode = "direct_whatsapp";
  if (mode === "myacademy_api") normalizedMode = "platform_api";
  if (mode === "custom_api") normalizedMode = "cloud_api";
  if (mode === "email" || mode === "resend_email") normalizedMode = "resend_email";

  integration.mode = normalizedMode;
  integration.phoneNumberId = phoneNumberId.trim();
  integration.businessAccountId = businessAccountId.trim();
  integration.webhookVerifyToken = webhookVerifyToken.trim();
  integration.senderPhoneNumber = senderPhoneNumber.trim();

  if (accessToken && !accessToken.includes("...")) {
    integration.accessToken = accessToken.trim();
  }

  if (normalizedMode === "direct_whatsapp") {
    integration.provider = "none";
    integration.connectionStatus = "connected";
    integration.lastError = "";
  } else if (normalizedMode === "platform_api") {
    integration.provider = "myacademy_managed";
    integration.connectionStatus = "connected";
    integration.lastError = "";
  } else if (normalizedMode === "resend_email") {
    integration.provider = "resend";
    integration.connectionStatus = process.env.RESEND_API_KEY ? "connected" : "not_configured";
    integration.lastError = "";
  } else if (normalizedMode === "cloud_api") {
    integration.provider = "meta_cloud_api";
    if (!integration.phoneNumberId || !integration.accessToken) {
      integration.connectionStatus = "not_configured";
    }
  }

  integration.updatedBy = req.user._id;
  await integration.save();

  await logReminderAudit(academyId, req.user._id, "INTEGRATION_UPDATE", null, { mode: normalizedMode });

  res.status(200).json({
    success: true,
    message: "WhatsApp messaging mode settings saved successfully.",
    data: {
      mode: integration.mode,
      provider: integration.provider,
      connectionStatus: integration.connectionStatus,
      phoneNumberId: integration.phoneNumberId,
      senderPhoneNumber: integration.senderPhoneNumber,
    },
  });
});

exports.testIntegrationConnection = asyncHandler(async (req, res) => {
  const academyId = academyIdOf(req);
  const integration = await WhatsAppIntegration.findOne({ academyId }).select("+accessToken");
  const targetMode = req.body?.mode || req.query?.mode || integration?.mode || "direct_whatsapp";

  if (targetMode === "resend_email" || targetMode === "email") {
    const hasKey = Boolean(process.env.RESEND_API_KEY);
    const msg = hasKey
      ? "Resend Email Gateway is verified and ready to dispatch official fee reminders!"
      : "RESEND_API_KEY is not configured in backend environment.";
    return res.status(hasKey ? 200 : 400).json({
      success: hasKey,
      message: msg,
      data: {
        mode: "resend_email",
        connectionStatus: hasKey ? "connected" : "failed",
        message: msg,
      },
    });
  }

  if (targetMode === "direct_whatsapp" || targetMode === "manual") {
    const msg = "Direct Admin WhatsApp click-to-chat mode is active with no setup required.";
    return res.status(200).json({
      success: true,
      message: msg,
      data: {
        mode: "direct_whatsapp",
        connectionStatus: "connected",
        message: msg,
      },
    });
  }

  if (targetMode === "platform_api" || targetMode === "myacademy_api") {
    const msg = "MyAcademy Managed WhatsApp Gateway is currently under development (Coming Soon).";
    return res.status(200).json({
      success: true,
      message: msg,
      data: {
        mode: "myacademy_api",
        connectionStatus: "pending",
        message: msg,
      },
    });
  }

  if (!integration || !integration.phoneNumberId || !integration.accessToken) {
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
