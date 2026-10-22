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