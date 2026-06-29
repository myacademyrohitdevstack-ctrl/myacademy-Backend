const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    academyId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Academy",
  required: true,
},
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["present", "absent"],
      required: true,
    },

    markedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
    },

    records: {
      type: [attendanceRecordSchema],
      default: [],
    },

    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
      // Soft Delete
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

// Prevent duplicate attendance for same batch on same day
attendanceSchema.index(
  {
    batch: 1,
    date: 1,
  },
  {
    unique: true,
  }
);

module.exports =
  mongoose.models.Attendance ||
  mongoose.model(
    "Attendance",
    attendanceSchema
  );