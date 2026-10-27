const mongoose=require("mongoose")

const academySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
    },

    supportPhone: {
      type: String,
      default: "",
    },

    logo: {
      type: String,
      default: "",
    },

    tagline: {
      type: String,
      default: "",
      trim: true,
    },

    website: {
      type: String,
      default: "",
      trim: true,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    deliveryMode: {
      type: String,
      enum: ["online", "offline", "hybrid"],
      default: "offline",
    },

    timezone: {
      type: String,
      default: "Asia/Kolkata",
      trim: true,
    },

    address: {
      type: String,
      default: "",
      trim: true,
    },

    city: {
      type: String,
      default: "",
      trim: true,
    },

    state: {
      type: String,
      default: "",
      trim: true,
    },

    pincode: {
      type: String,
      default: "",
      trim: true,
    },

    country: {
      type: String,
      default: "India",
      trim: true,
    },

    taxNumber: {
      type: String,
      default: "",
      trim: true,
    },

    currency: {
      type: String,
      default: "₹",
      trim: true,
    },

    receiptPrefix: {
      type: String,
      default: "REC",
      trim: true,
    },

    receiptNotes: {
      type: String,
      default: "Thank you for your payment. This is an official computer-generated receipt.",
      trim: true,
    },

    signatoryName: {
      type: String,
      default: "",
      trim: true,
    },

    signatoryTitle: {
      type: String,
      default: "Authorized Signatory",
      trim: true,
    },

    signature: {
      type: String,
      default: "",
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    
    },

    plan: {
      type: String,
      enum: ["free", "basic", "premium"],
      default: "free",
    },

   status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'suspended', 'rejected', 'on_hold'],
      default: 'pending',
    },

    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'on_hold'],
      default: 'pending',
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

    suspensionReason: {
      type: String,
      default: null,
      trim: true,
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
  },
  {
    timestamps: true,
  }
);

module.exports= mongoose.model("Academy", academySchema);