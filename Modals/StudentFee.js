const mongoose = require("mongoose");

const installmentSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  dueDate: { type: Date, required: true },
  paidAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["pending", "partial", "paid", "waived"], default: "pending" },
  lateFeeAmount: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: "" },
}, { timestamps: true });

const studentFeeSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: "Academy", required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  studentProfile: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
  batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", default: null },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
  feePlan: { type: mongoose.Schema.Types.ObjectId, ref: "FeePlan", default: null },
  feePlanNameSnapshot: { type: String, default: "" },
  currency: { type: String, default: "INR", enum: ["INR"] },
  baseAmount: { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  scholarshipAmount: { type: Number, default: 0, min: 0 },
  additionalCharges: { type: Number, default: 0, min: 0 },
  totalPayable: { type: Number, required: true, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  balanceAmount: { type: Number, required: true, min: 0 },
  installments: { type: [installmentSchema], default: [] },
  status: { type: String, enum: ["pending", "partial", "paid", "overdue", "cancelled"], default: "pending", index: true },
  assignedAt: { type: Date, default: Date.now },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  notes: { type: String, default: "" },
  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

studentFeeSchema.index({ academyId: 1, student: 1, status: 1 });
studentFeeSchema.index({ academyId: 1, "installments.dueDate": 1, status: 1 });
module.exports = mongoose.models.StudentFee || mongoose.model("StudentFee", studentFeeSchema);
