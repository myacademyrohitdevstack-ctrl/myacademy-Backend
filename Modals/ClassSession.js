const mongoose = require("mongoose");

const classSessionSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },

    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
      index: true,
    },

    timetable: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Timetable",
      default: null,
      index: true,
    },

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    substituteTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    startTime: {
      type: String,
      required: true,
      trim: true,
    },

    endTime: {
      type: String,
      required: true,
      trim: true,
    },

    title: {
      type: String,
      default: "Regular Class",
      trim: true,
    },

    room: {
      type: String,
      default: "",
      trim: true,
    },

    meetingPlatform: {
      type: String,
      enum: ["zoom", "google-meet", "teams", "offline", "other"],
      default: "offline",
    },

    meetingLink: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed", "cancelled", "rescheduled"],
      default: "scheduled",
      index: true,
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    rescheduledToSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      default: null,
    },

    originalSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      default: null,
    },

    isMakeUp: {
      type: Boolean,
      default: false,
    },

    makeUpRequired: {
      type: Boolean,
      default: false,
    },

    makeUpStatus: {
      type: String,
      enum: ["none", "pending", "scheduled", "completed"],
      default: "none",
      index: true,
    },

    attendanceMarked: {
      type: Boolean,
      default: false,
      index: true,
    },

    attendance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      default: null,
    },

    isExtraSession: {
      type: Boolean,
      default: false,
    },

    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

classSessionSchema.index({ academyId: 1, batch: 1, date: 1, status: 1 });
classSessionSchema.index({ academyId: 1, teacher: 1, date: 1, status: 1 });
classSessionSchema.index({ academyId: 1, substituteTeacher: 1, date: 1, status: 1 });

module.exports =
  mongoose.models.ClassSession || mongoose.model("ClassSession", classSessionSchema);
