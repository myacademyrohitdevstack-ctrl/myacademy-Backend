const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
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

    // attachment: {
    //   publicId: {
    //     type: String,
    //     default: "",
    //   },
    //   url: {
    //     type: String,
    //     default: "",
    //   },
    //   fileName: {
    //     type: String,
    //     default: "",
    //   },
    // },

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

    isDeleted: {
      type: Boolean,
      default: false,
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