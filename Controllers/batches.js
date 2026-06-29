const Batch = require("../Modals/Batches");
const Student  = require("../Modals/Student");
const Course = require("../Modals/Courses");
const asyncHandler = require("../Utils/asyncHandler");
const createBatch = asyncHandler(async (req, res) => {
  const course = await Course.findOne({
   _id: req.params.courseId,
   academyId:req.academy._id,
     isDeleted:false
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found.",
    });
  }

  const batch = await Batch.create({
    ...req.body,
    course: course._id,
    createdBy:req.user._id,
    academyId:req.academy._id
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
    academyId:req.academy._id,
      isDeleted:false
  })
  if (!course) {
  return res.status(404).json({
    success: false,
    message: "Course not found.",
  });
}
  
  const batches = await Batch.find({
    course:course._id,
    academyId:req.academy._id,
      isDeleted:false
  })
    .populate("students")
    .populate("course","title")
    .sort("-createdAt");

  res.status(200).json({
    success: true,
    count: batches.length,
    batches,
  });
});
const getBatchById = asyncHandler(async (req, res) => {
  const batch = await Batch.findOne({
    _id:req.params.batchId,
    academyId:req.academy._id,
      isDeleted:false
  })
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
 const batch = await Batch.findOneAndUpdate(
  {
    _id: req.params.batchId,
    academyId: req.academy._id,
      isDeleted:false
  },
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
  const batch = await Batch.findOneAndUpdate(
    {
      _id: req.params.batchId,
      academyId: req.academy._id,
      isDeleted: false,
    },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user._id,
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

  await Course.findOneAndUpdate(
    {
      _id: batch.course,
      academyId: req.academy._id,
      isDeleted: false,
    },
    {
      $pull: {
        batches: batch._id,
      },
    }
  );

  return res.status(200).json({
    success: true,
    message: "Batch deleted successfully.",
  });
});

const addStudentToBatch = asyncHandler(
  async (req, res) => {
    const { studentId } = req.body;

    const batch = await Batch.findOne({
      _id:req.params.batchId,
      academyId:req.academy._id,
        isDeleted:false
  });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    const student = await Student.findOne({
     _id: studentId,
     academyId:req.academy._id,
       isDeleted:false
  });
// also updated student count in couse 









    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

  const alreadyAdded = batch.students.some(
  id => id.equals(studentId)
);

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
    const batch = await Batch.findOne({
      _id:req.params.batchId,
      academyId:req.academy._id,
        isDeleted:false
  }).populate(
  "students",
  "fullName email phone profileImage"
);

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
    const batch = await Batch.findOne({
      _id:req.params.batchId,
      academyId:req.academy._id,
        isDeleted:false
  });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

 const student = await Student.findOne({
  _id: req.params.studentId,
  academyId: req.academy._id,
    isDeleted:false
});

if (!student) {
  return res.status(404).json({
    success: false,
    message: "Student not found.",
  });
}

batch.students.pull(student._id);

    await batch.save();

    res.status(200).json({
      success: true,
      message:
        "Student removed from batch successfully.",
    });
  });

module.exports={createBatch,updateBatch,deleteBatch,getBatchById,getBatches,addStudentToBatch,removeStudentFromBatch,getBatchStudents}