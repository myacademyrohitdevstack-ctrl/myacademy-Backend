const mongoose = require("mongoose");

const reminderTemplateSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    category: {
      type: String,
      enum: ["due_soon", "due_today", "overdue", "custom", "general"],
      default: "due_soon",
      index: true,
    },
    messageBody: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    providerTemplateName: {
      type: String,
      trim: true,
      default: "",
    },
    language: {
      type: String,
      default: "en",
    },
    approvalStatus: {
      type: String,
      enum: ["draft", "approved", "rejected", "pending_approval"],
      default: "approved", // In manual mode, all templates are ready; in cloud API, maps to Meta status
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

reminderTemplateSchema.index({ academyId: 1, name: 1 });
reminderTemplateSchema.index({ academyId: 1, category: 1, isActive: 1 });

module.exports =
  mongoose.models.ReminderTemplate ||
  mongoose.model("ReminderTemplate", reminderTemplateSchema);
