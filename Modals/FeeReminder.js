const mongoose = require("mongoose");

const feeReminderSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    feeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentFee",
      required: true,
      index: true,
    },
    installmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    installmentLabel: {
      type: String,
      default: "Consolidated Balance",
    },
    recipient: {
      name: { type: String, required: true },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      role: { type: String, enum: ["student", "parent"], default: "student" },
    },
    amountDue: {
      type: Number,
      required: true,
      min: 0,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    channel: {
      type: String,
      enum: ["whatsapp_click_to_chat", "whatsapp_cloud_api", "whatsapp_platform_gateway", "resend_email", "email"],
      default: "whatsapp_click_to_chat",
    },
    reminderType: {
      type: String,
      enum: ["manual", "automatic", "scheduled"],
      default: "manual",
      index: true,
    },
    reminderRule: {
      type: String,
      default: "manual",
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReminderTemplate",
      default: null,
    },
    renderedMessage: {
      type: String,
      required: true,
    },
    clickToChatUrl: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "queued",
        "processing",
        "sent_to_provider",
        "delivered",
        "read",
        "failed",
        "cancelled",
        "skipped",
        "manually_confirmed",
      ],
      default: "draft",
      index: true,
    },
    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    nextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
    providerMessageId: {
      type: String,
      default: null,
      index: true,
    },
    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
    manuallyConfirmedAt: {
      type: Date,
      default: null,
    },
    manuallyConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    idempotencyKey: {
      type: String,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Compound indexes for fast tenant filtering, duplicates, and scheduler lookups
feeReminderSchema.index({ academyId: 1, status: 1, createdAt: -1 });
feeReminderSchema.index({ academyId: 1, studentId: 1, createdAt: -1 });
feeReminderSchema.index({ academyId: 1, feeId: 1, installmentId: 1, reminderRule: 1 });
feeReminderSchema.index({ academyId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports =
  mongoose.models.FeeReminder ||
  mongoose.model("FeeReminder", feeReminderSchema);
