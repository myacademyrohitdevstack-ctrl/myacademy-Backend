const Course = require("../Modals/Courses");
const asyncHandler = require("../Utils/asyncHandler");
const slugify = require("slugify");
const generateUniqueSlug = require("../Utils/generateUniqueSlug");
const uploadToCloudinary = require("../Utils/Cloudinary");
const createCourse = asyncHandler(
  async (req, res) => {
    let thumbnail = {
      public_id: "",
      url: "",
    };

    if (req.file) {
      const result =
        await uploadToCloudinary(
           req.file.buffer,
          "courses"
        );

      thumbnail = {
        public_id: result.public_id,
        url: result.secure_url,
      };
    }

    const slug =
      await generateUniqueSlug(
        req.body.title
      );

    const course = await Course.create({
      title: req.body.title,
      slug,
      description: req.body.description,
      shortDescription:
        req.body.shortDescription,
      price: req.body.price,
      durationInMonths:
        req.body.durationInMonths,
      level: req.body.level,
      status: req.body.status,

      thumbnail,

      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message:"Course Added Successfully",
      course,
    });
  }
);



const getCourses = asyncHandler(async (req, res) => {
 const courses = await Course.find({
  isDeleted: false,
}).populate("createdBy", "fullName email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: courses.length,
    courses,
  });
});
const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId)
    .populate("createdBy", "fullName email")
    .populate("batches");

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found.",
    });
  }

  res.status(200).json({
    success: true,
    course,
  });
});
const updateCourse = asyncHandler(async (req, res) => {
  const updateData = {
  ...req.body,
};

if (req.body.title) {
  updateData.slug = await generateUniqueSlug(
          req.body.title,
          req.params.courseId
        );}

const course = await Course.findByIdAndUpdate(
  req.params.courseId,
  {
    $set: updateData,
  },
  {
    new: true,
    runValidators: true,
  }
);
 

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Course updated successfully.",
    course,
  });
});
const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndDelete(
    req.params.courseId
  );

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Course deleted successfully.",
  });
});
const publishCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndUpdate(
    req.params.courseId,
    {
      status: "published",
    },
    {
      new: true,
    }
  );

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Course published successfully.",
    course,
  });
});
const archiveCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndUpdate(
    req.params.courseId,
    {
      status: "archived",
    },
    {
      new: true,
    }
  );

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Course archived successfully.",
    course,
  });
});
module.exports = {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  publishCourse,
  archiveCourse,
};