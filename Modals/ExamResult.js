const mongoose = require("mongoose");

const examResultSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
      index: true,
    },
    marksObtained: {
      type: Number,
      required: true,
      min: 0,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
    },
    percentage: {
      type: Number,
      required: true,
    },
    grade: {
      type: String,
      default: "F",
    },
    isPassed: {
      type: Boolean,
      required: true,
      default: false,
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

examResultSchema.index({ academyId: 1, examId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.models.ExamResult || mongoose.model("ExamResult", examResultSchema);
