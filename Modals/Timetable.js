const mongoose = require("mongoose");

const timetableSchema = new mongoose.Schema(
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

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    daysOfWeek: {
      type: [Number],
      required: true,
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length > 0 && val.every((d) => d >= 0 && d <= 6);
        },
        message: "daysOfWeek must contain valid day indices from 0 (Sunday) to 6 (Saturday).",
      },
    },

    // Friendly names: ["monday", "wednesday", "friday"]
    days: {
      type: [String],
      default: [],
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

    effectiveStartDate: {
      type: Date,
      required: true,
    },

    effectiveEndDate: {
      type: Date,
      default: null,
    },

    timezone: {
      type: String,
      default: "Asia/Kolkata",
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

    nonTeachingDays: {
      type: [Date],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    lastGeneratedThrough: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

timetableSchema.index({ academyId: 1, batch: 1, isActive: 1 });
timetableSchema.index({ academyId: 1, teacher: 1, isActive: 1 });

module.exports =
  mongoose.models.Timetable || mongoose.model("Timetable", timetableSchema);
