const mongoose=require('mongoose')

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
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
    url:String,
    publicId:String
},

    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student",
    },

    status: {
      type: String,
      enum: ["pending", "active", "blocked"],
      default: "active",
    },
    status: {
  type: String,
  enum: ["active", "blocked"],
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
   
    isDeleted: {
      type: Boolean,
      default: false,
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

 User = mongoose.model("User", userSchema);
module.exports = User;