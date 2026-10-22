const mongoose = require("mongoose");

const reminderRuleSchema = new mongoose.Schema(
  {
    ruleId: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    daysOffset: {
      type: Number,
      required: true, // -3 means 3 days before due date, 0 on due date, 3 means 3 days after due date
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReminderTemplate",
      default: null,
    },
  },
  { _id: false }
);

const reminderSettingsSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      unique: true,
      index: true,
    },
    automaticRemindersEnabled: {
      type: Boolean,
      default: false,
    },
    isPaused: {
      type: Boolean,
      default: false,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    allowedSendingHours: {
      start: {
        type: String,
        default: "09:00",
      },
      end: {
        type: String,
        default: "20:00",
      },
    },
    rules: {
      type: [reminderRuleSchema],
      default: [
        {
          ruleId: "before_3",
          label: "3 Days Before Due Date",
          daysOffset: -3,
          isActive: true,
          templateId: null,
        },
        {
          ruleId: "before_1",
          label: "1 Day Before Due Date",
          daysOffset: -1,
          isActive: true,
          templateId: null,
        },
        {
          ruleId: "due_date",
          label: "On Due Date",
          daysOffset: 0,
          isActive: true,
          templateId: null,
        },
        {
          ruleId: "after_3",
          label: "3 Days After Due Date (Overdue)",
          daysOffset: 3,
          isActive: true,
          templateId: null,
        },
        {
          ruleId: "after_7",
          label: "7 Days After Due Date (Overdue)",
          daysOffset: 7,
          isActive: true,
          templateId: null,
        },
      ],
    },
    overdueRemindersEnabled: {
      type: Boolean,
      default: true,
    },
    maximumRemindersPerInstallment: {
      type: Number,
      default: 3,
      min: 1,
      max: 10,
    },
    minimumReminderIntervalDays: {
      type: Number,
      default: 2,
      min: 1,
      max: 30,
    },
    excludeOptedOut: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.ReminderSettings ||
  mongoose.model("ReminderSettings", reminderSettingsSchema);
