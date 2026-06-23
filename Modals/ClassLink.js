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
durationMinutes: {
  type: Number,
  default: 60,
},
status: {
  type: String,
  enum: [
    "scheduled",
    "live",
    "completed",
    "cancelled"
  ],
  default: "scheduled",
},
recordingUrl: {
  type: String,
  default: "",
},
recordingThumbnail: {
  type: String,
  default: "",
},
platform: {
  type: String,
  enum: [
    "zoom",
    "google-meet",
    "teams",
    "custom"
  ],
  default: "zoom",
},
attendanceEnabled: {
  type: Boolean,
  default: false,
},
notes: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "Note",
}],
classNumber: {
  type: Number,
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
classLinkSchema.index({
  batch: 1,
  meetingDate: 1,
});

classLinkSchema.index({
  status: 1,
});
module.exports = mongoose.model(
  "ClassLink",
  classLinkSchema
);