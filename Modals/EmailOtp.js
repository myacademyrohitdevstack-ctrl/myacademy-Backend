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
    },
      resendCount: {
      type: Number,
      default: 0,
    },
       lastSentAt: {
      type: Date,
      default: Date.now,
    }
  },
  {
    timestamps: true,
  }
);
// Automatically delete expired OTP documents
emailOtpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);
EmailOtp=mongoose.model("EmailOtp", emailOtpSchema);
module.exports=EmailOtp
  