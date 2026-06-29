const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    targetType: {
      type: String,
      enum: [
        "system", // everyone
        "course", // specific course
        "batch", // specific batch
      ],
      required: true,
      default: "system",
    },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },

    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      default: null,
    },

    priority: {
      type: String,
      enum: [
        "low",
        "normal",
        "high",
        "urgent",
      ],
      default: "normal",
    },

   

    publishAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    isPinned: {
      type: Boolean,
      default: false,
    },

    isPublished: {
      type: Boolean,
      default: true,
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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

announcementSchema.index({
  targetType: 1,
});

announcementSchema.index({
  course: 1,
});

announcementSchema.index({
  batch: 1,
});

announcementSchema.index({
  publishAt: -1,
});

module.exports = mongoose.model(
  "Announcement",
  announcementSchema
);