const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    maxStudents: {
      type: Number,
      default: 50,
    },
    description: {
  type: String,
  default: "",
},
schedule: {
  days: {
    type: [String],
    default: [],
  },

  startTime: {
    type: String,
    default: "",
  },

  endTime: {
    type: String,
    default: "",
  },
},
meetingPlatform: {
  type: String,
  enum: ["zoom", "google-meet", "offline", "other"],
  default: "zoom",
},
enrollmentOpen: {
  type: Boolean,
  default: true,
},
createdBy: {
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

    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    trainers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    status: {
      type: String,
      enum: ["upcoming", "active", "completed", "cancelled"],
      default: "upcoming",
    },
  },
  {
    timestamps: true,
  },
 
);
 batchSchema.index({
  course: 1,
});

batchSchema.index({
  status: 1,
});

module.exports = mongoose.model("Batch", batchSchema);