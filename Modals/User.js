
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    // Academy membership is optional only for platform Super Admins.
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: function () {
        return this.platformRole !== "super_admin";
      },
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    profileImage: {
      url: String,
      publicId: String,
    },

    // Platform-wide permissions.
    platformRole: {
      type: String,
      enum: ["user", "super_admin"],
      default: "user",
      index: true,
    },

    // Role within an academy.
    role: {
      type: String,
      enum: ["student", "teacher", "admin", "parent"],
      default: "student",
    },

    status: {
      type: String,
      enum: ["pending", "active", "blocked"],
      default: "active",
    },

    blockedAt: {
      type: Date,
      default: null,
    },

    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    blockReason: {
      type: String,
      default: null,
      trim: true,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    lastLogin: {
      type: Date,
    },

    refreshToken: {
      type: String,
      default: "",
      select: false,
    },

    passwordChangedAt: {
      type: Date,
    },

    loginProvider: {
      type: String,
      enum: ["email", "google"],
      default: "email",
    },

    // Soft delete.
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

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
