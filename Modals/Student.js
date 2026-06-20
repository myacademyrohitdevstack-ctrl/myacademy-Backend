const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    profileCompleted: {
      type: Boolean,
      default: false,
    },

    enrolledCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],

    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      default: null,
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema);