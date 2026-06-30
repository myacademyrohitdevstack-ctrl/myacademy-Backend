const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
    },

    profileCompleted: {
      type: Boolean,
      default: false,
    },
    admissionDate: {
      type: Date,
      default: Date.now,
    },

    dateOfBirth: Date,

    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },



    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
    },

    guardian: {
      fatherName: String,
      motherName: String,
      guardianName: String,
      relationship: String,
      phone: String,
      email: String,
    },

    emergencyContact: {
      name: String,
      phone: String,
      relation: String,
    },

    profilePhoto: String,

    languageLevel: {
      type: String,
      enum: [
        "Beginner",
        "Elementary",
        "Intermediate",
        "Upper Intermediate",
        "Advanced",
      ],
      default: "Beginner",
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "suspended"],
      default: "active",
    },

    notes: String,
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


module.exports = mongoose.model("Student", studentSchema);