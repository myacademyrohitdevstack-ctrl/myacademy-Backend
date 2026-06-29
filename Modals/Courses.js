const mongoose=require('mongoose')

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    academyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Academy",
      required: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
    },

    description: {
      type: String,
      required: true,
    },

 thumbnail: {
  public_id: {
    type: String,
    default: "",
  },
  url: {
    type: String,
    default: "",
  },
},

    price: {
      type: Number,
      default: 0,
    },
   durationInMonths: {
  type: Number,
},
shortDescription: {
  type: String,
  maxlength: 200,
},

    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
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

    batches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
  type: String,
  trim: true,
},
language: {
  type: String,
  default: "English",
},
enrollmentOpen: {
  type: Boolean,
  default: true,
},
tags: [{
  type: String,
  trim: true,
}],
seoTitle: String,
seoDescription: String,
  },
  
  { timestamps: true }
);
courseSchema.index({
  status: 1,
});

courseSchema.index({
  slug: 1,
});
module.exports= mongoose.model("Course", courseSchema);