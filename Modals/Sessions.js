
const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Optional for platform-level Super Admin sessions.
    // Regular academy users must have an academyId,
    // validated in the authentication flow.
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      default: undefined,
    },

    refreshTokenHash: {
      type: String,
      required: true,
      select: false,
      unique: true,
    },

    device: {
      type: String,
      default: "Unknown Device",
    },

    browser: {
      type: String,
      default: "Unknown Browser",
    },

    os: {
      type: String,
      default: "Unknown OS",
    },

    ip: {
      type: String,
      default: "",
    },

    userAgent: {
      type: String,
      default: "",
    },

    lastActive: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Automatically delete expired sessions.
sessionSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
  }
);

module.exports = mongoose.model("Session", sessionSchema);
