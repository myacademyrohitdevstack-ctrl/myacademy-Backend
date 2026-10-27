const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["present", "absent", "leave"],
      required: true,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },

    markedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const attendanceAuditSchema = new mongoose.Schema(
  {
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    modifiedAt: {
      type: Date,
      default: Date.now,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    previousStatus: String,
    newStatus: String,
    reason: {
      type: String,
      default: "",
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

    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      default: null,
    },

    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
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

    auditHistory: {
      type: [attendanceAuditSchema],
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

// Prevent duplicate attendance for same session
attendanceSchema.index(
  {
    session: 1,
  },
  {
    unique: true,
    sparse: true,
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
    sparse: true,
  }
);

module.exports =
  mongoose.models.Attendance ||
  mongoose.model("Attendance", attendanceSchema);
