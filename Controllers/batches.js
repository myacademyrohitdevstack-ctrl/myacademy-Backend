const Batch = require("../Modals/Batches");

const Course = require("../Modals/Courses");
const asyncHandler = require("../Utils/asyncHandler");
const createBatch = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found.",
    });
  }

  const batch = await Batch.create({
    ...req.body,
    course: course._id,
  });

  course.batches.push(batch._id);
  await course.save();

  res.status(201).json({
    success: true,
    message: "Batch created successfully.",
    batch,
  });
});
const getBatches = asyncHandler(async (req, res) => {

  const course = await Course.findOne({
    slug: req.params.slug,
  })
  console.log(course)
  const batches = await Batch.find({
    course:course._id
  })
    .populate("students")
    .populate("course","title")
    .sort("-createdAt");
console.log(batches)
  res.status(200).json({
    success: true,
    count: batches.length,
    batches,
  });
});
const getBatchById = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.batchId)
    .populate("course")
    .populate("students")
    .populate("trainers")

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found.",
    });
  }

  res.status(200).json({
    success: true,
    batch,
  });
});
const updateBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findByIdAndUpdate(
    req.params.batchId,
    {
      $set: req.body,
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Batch updated successfully.",
    batch,
  });
});
const deleteBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findByIdAndDelete(
    req.params.batchId
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found.",
    });
  }

  await Course.findByIdAndUpdate(batch.course, {
    $pull: {
      batches: batch._id,
    },
  });

  res.status(200).json({
    success: true,
    message: "Batch deleted successfully.",
  });
});

const addStudentToBatch = asyncHandler(
  async (req, res) => {
    const { studentId } = req.body;

    const batch = await Batch.findById(
      req.params.batchId
    );

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    const student = await Student.findById(
      studentId
    );
// also updated student count in couse 









    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    const alreadyAdded =
      batch.students.includes(studentId);

    if (alreadyAdded) {
      return res.status(400).json({
        success: false,
        message:
          "Student already exists in this batch.",
      });
    }

    batch.students.push(studentId);

    await batch.save();

    res.status(200).json({
      success: true,
      message:
        "Student added to batch successfully.",
    });
  }
);
const getBatchStudents = asyncHandler(
  async (req, res) => {
    const batch = await Batch.findById(
      req.params.batchId
    ).populate({
      path: "students",
      populate: {
        path: "user",
        select:
          "fullName email phone profileImage",
      },
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    res.status(200).json({
      success: true,
      count: batch.students.length,
      students: batch.students,
    });
  }
);
const removeStudentFromBatch =
  asyncHandler(async (req, res) => {
    const batch = await Batch.findById(
      req.params.batchId
    );

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    batch.students.pull(
      req.params.studentId
    );

    await batch.save();

    res.status(200).json({
      success: true,
      message:
        "Student removed from batch successfully.",
    });
  });

module.exports={createBatch,updateBatch,deleteBatch,getBatchById,getBatches,addStudentToBatch,removeStudentFromBatch,getBatchStudents}