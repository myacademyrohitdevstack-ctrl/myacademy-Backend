const mongoose = require("mongoose");

const teacherLeaveActionSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      required: true,
    },
    action: {
      type: String,
      enum: ["cancelled", "rescheduled", "substitute", "pending"],
      default: "pending",
    },
    substituteTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    newDate: {
      type: Date,
      default: null,
    },
    newStartTime: {
      type: String,
      default: "",
    },
    newEndTime: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const teacherLeaveSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      index: true,
    },

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
      index: true,
    },

    endDate: {
      type: Date,
      required: true,
      index: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["planned", "emergency", "sick", "casual", "other"],
      default: "planned",
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewRemarks: {
      type: String,
      default: "",
      trim: true,
    },

    affectedSessions: {
      type: [teacherLeaveActionSchema],
      default: [],
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

teacherLeaveSchema.index({ academyId: 1, teacher: 1, startDate: 1, endDate: 1 });

module.exports =
  mongoose.models.TeacherLeave ||
  mongoose.model("TeacherLeave", teacherLeaveSchema);
