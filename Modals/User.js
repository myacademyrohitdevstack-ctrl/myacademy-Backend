
const mongoose = require("mongoose");
const { VALID_PERMISSIONS_LIST } = require("../Utils/permissions");

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
      enum: ["student", "teacher", "admin", "parent", "academy_staff"],
      default: "student",
    },

    // Optional title/designation for academy_staff (e.g., 'Operations Lead', 'Accountant')
    staffTitle: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },

    // Explicit scoped permissions for academy_staff
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: function (perms) {
          if (!Array.isArray(perms)) return false;
          return perms.every((p) => VALID_PERMISSIONS_LIST.includes(p));
        },
        message: (props) => `Invalid staff permission encountered in: ${props.value}`,
      },
    },

    // Reference to the academy owner who invited/assigned this staff member
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
      enum: ["pending", "approved", "rejected", "on_hold"],
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

    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },

    holdReason: {
      type: String,
      default: null,
      trim: true,
    },

    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },

    readAnnouncements: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Announcement",
      },
    ],

    lastNotificationReadAt: {
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
