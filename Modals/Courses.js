const mongoose=require('mongoose')

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
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
    isDeleted: {
  type: Boolean,
  default: false,
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
  },
  { timestamps: true }
);

module.exports= mongoose.model("Course", courseSchema);