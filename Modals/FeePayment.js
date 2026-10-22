
const mongoose = require("mongoose");

// One payment can be allocated to multiple installments.
const allocationSchema = new mongoose.Schema(
  {
    installmentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    label: {
      type: String,
      trim: true,
      default: "",
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
  },
  { _id: false }
);

const feePaymentSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    studentFee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentFee",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      default: null,
    },
    receiptNo: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    allocations: {
      type: [allocationSchema],
      default: [],
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    mode: {
      type: String,
      required: true,
      enum: [
        "UPI",
        "Cash",
        "Card",
        "Net Banking",
        "Cheque",
        "Bank Transfer",
        "Other",
      ],
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: "",
    },
    paidAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      enum: ["completed", "reversed"],
      default: "completed",
      index: true,
    },
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reversalReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

feePaymentSchema.index(
  { academyId: 1, receiptNo: 1 },
  { unique: true }
);
feePaymentSchema.index({ academyId: 1, paidAt: -1 });
feePaymentSchema.index({ academyId: 1, student: 1, paidAt: -1 });
feePaymentSchema.index({ academyId: 1, referenceNumber: 1 });

module.exports =
  mongoose.models.FeePayment ||
  mongoose.model("FeePayment", feePaymentSchema);
