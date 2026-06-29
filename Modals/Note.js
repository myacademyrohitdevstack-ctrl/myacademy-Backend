const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
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
type: {
  type: String,
  enum: [
    "pdf",
    "ppt",
    "doc",
    "image",
    "video",
    "other"
  ],
  default: "pdf",
},
visibility: {
  type: String,
  enum: ["public", "private"],
  default: "public",
},
noteNumber: {
  type: Number,
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
    description: {
      type: String,
      default: "",
    },

    file: {
      publicId: {
        type: String,
        required: true,
      },
      url: {
        type: String,
        required: true,
      },

      originalName: String,

      size: Number,
      mimeType:String
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
noteSchema.index({
  batch: 1,
  createdAt: -1,
});

noteSchema.index({
  course: 1,
});

module.exports = mongoose.model("Note", noteSchema);