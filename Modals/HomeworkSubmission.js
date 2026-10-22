const mongoose = require("mongoose");

const homeworkSubmissionSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },
    homeworkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Homework",
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
    content: {
      type: String,
      trim: true,
      default: "",
    },
    attachments: [
      {
        title: { type: String, default: "" },
        url: { type: String, required: true },
      },
    ],
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["submitted", "graded", "late"],
      default: "submitted",
    },
    pointsAwarded: {
      type: Number,
      default: null,
    },
    grade: {
      type: String,
      default: "",
    },
    feedback: {
      type: String,
      default: "",
    },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    gradedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

homeworkSubmissionSchema.index({ academyId: 1, homeworkId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.models.HomeworkSubmission || mongoose.model("HomeworkSubmission", homeworkSubmissionSchema);
