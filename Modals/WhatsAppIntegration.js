const mongoose = require("mongoose");

const whatsAppIntegrationSchema = new mongoose.Schema(
  {
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
      unique: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["manual", "direct_whatsapp", "cloud_api", "custom_api", "platform_api", "myacademy_api"],
      default: "direct_whatsapp",
    },
    provider: {
      type: String,
      enum: ["none", "meta_cloud_api", "myacademy_managed"],
      default: "none",
    },
    // Meta Cloud API Credentials
    phoneNumberId: {
      type: String,
      trim: true,
      default: "",
    },
    businessAccountId: {
      type: String,
      trim: true,
      default: "",
    },
    accessToken: {
      type: String,
      trim: true,
      default: "",
      select: false, // Never expose in general queries
    },
    webhookVerifyToken: {
      type: String,
      trim: true,
      default: "",
    },
    appSecret: {
      type: String,
      trim: true,
      default: "",
      select: false,
    },
    senderPhoneNumber: {
      type: String,
      trim: true,
      default: "",
    },
    connectionStatus: {
      type: String,
      enum: ["not_configured", "connected", "failed", "disconnected"],
      default: "not_configured",
      index: true,
    },
    lastConnectionTestAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
    },
    optOutPhoneNumbers: {
      type: [String],
      default: [],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.WhatsAppIntegration ||
  mongoose.model("WhatsAppIntegration", whatsAppIntegrationSchema);
