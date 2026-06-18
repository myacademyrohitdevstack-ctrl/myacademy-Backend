const mongoose=require('mongoose')

const emailOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    otp: {
      type: String,
      required: true,
      select: false,
    },

    purpose: {
      type: String,
      enum: ["register", "login", "forgot-password"],
      default: "register",
    },

    verified: {
      type: Boolean,
      default: false,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL Index
    },
  },
  {
    timestamps: true,
  }
);
EmailOtp=mongoose.model("EmailOtp", emailOtpSchema);
module.exports=EmailOtp
  