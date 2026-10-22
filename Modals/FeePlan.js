const mongoose = require("mongoose");

const installmentTemplateSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  dueDateOffsetDays: { type: Number, default: 0, min: 0 },
  dueDate: { type: Date, default: null },
}, { _id: false });

const feePlanSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: "Academy", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, default: "" },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
  batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", default: null },
  currency: { type: String, default: "INR", uppercase: true, enum: ["INR"] },
  totalAmount: { type: Number, required: true, min: 0 },
  frequency: { type: String, enum: ["one-time", "weekly", "monthly", "bi-monthly", "quarterly", "custom"], default: "monthly" },
  installments: { type: Number, required: true, min: 1, max: 60 },
  lateFeeAmount: { type: Number, default: 0, min: 0 },
  lateFeeGraceDays: { type: Number, default: 0, min: 0 },
  installmentTemplate: { type: [installmentTemplateSchema], default: [] },
  status: { type: String, enum: ["active", "inactive", "archived"], default: "active", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

feePlanSchema.index({ academyId: 1, name: 1, isDeleted: 1 });
module.exports = mongoose.models.FeePlan || mongoose.model("FeePlan", feePlanSchema);
