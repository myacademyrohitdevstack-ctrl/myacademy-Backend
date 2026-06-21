const mongoose = require("mongoose");

const classLinkSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    meetingLink: {
      type: String,
      required: true,
      trim: true,
    },

    meetingDate: {
      type: Date,
      required: true,
    },

    description: {
      type: String,
      default: "",
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

module.exports = mongoose.model(
  "ClassLink",
  classLinkSchema
);