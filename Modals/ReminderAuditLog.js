const mongoose = require("mongoose");

const reminderAuditLogSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "SETTINGS_UPDATE",
        "INTEGRATION_UPDATE",
        "INTEGRATION_DISCONNECT",
        "TEMPLATE_CREATE",
        "TEMPLATE_UPDATE",
        "TEMPLATE_DELETE",
        "MANUAL_REMINDER_CREATED",
        "MANUAL_REMINDER_CONFIRMED",
        "BULK_REMINDERS_DISPATCHED",
        "REMINDER_SCHEDULED",
        "REMINDER_CANCELLED",
        "REMINDER_RETRIED",
        "AUTOMATIC_DISPATCH_TRIGGERED",
      ],
      index: true,
    },
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeReminder",
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

reminderAuditLogSchema.index({ academyId: 1, createdAt: -1 });

module.exports =
  mongoose.models.ReminderAuditLog ||
  mongoose.model("ReminderAuditLog", reminderAuditLogSchema);
