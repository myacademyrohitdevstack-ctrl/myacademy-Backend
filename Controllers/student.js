

const User  = require("../Modals/User");
const mongoose=require('mongoose')
const Student  = require("../Modals/Student");
const asyncHandler = require("../Utils/asyncHandler");
const flatten = require("../Utils/flattenobject");
const Batches = require("../Modals/Batches");
const Note = require("../Modals/Note");
const ClassLink = require("../Modals/ClassLink");
const Announcement = require("../Modals/Announcement");

const USER_FIELDS = [
  "fullName",
  "email",
  "phone",
];
 const getMyProfile = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    user: req.user._id,
  }).populate(
    "user",
    "fullName email profileImage role approvalStatus"
  );

  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found.",
    });
  }

  res.json({
    success: true,
    student,
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const userId = req.user._id;
    const body = req.body;

    const userUpdates = {};
    const studentUpdates = {};

    for (const [key, value] of Object.entries(body)) {
      if (USER_FIELDS.includes(key)) {
        userUpdates[key] = value;
      } else {
        studentUpdates[key] = value;
      }
    }
  
    if (Object.keys(userUpdates).length) {
      await User.findByIdAndUpdate(
        userId,
        { $set: userUpdates },
        {
          session,
          runValidators: true,
        }
      );
    }

    if (Object.keys(studentUpdates).length) {
      await Student.findOneAndUpdate(
        { user: userId },
        {
          $set: flatten(studentUpdates),
        },
        {
          session,
          runValidators: true,
        }
      );
    }

    await session.commitTransaction();

    const [updatedUser, updatedStudent] = await Promise.all([
      User.findById(userId).select(
        "fullName email phone profileImage role"
      ),
      Student.findOne({ user: userId }).select(
        "dateOfBirth gender languageLevel address guardian emergencyContact"
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        user: updatedUser,
        profile: updatedStudent,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});
 const getStudentById = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate("user");

  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found.",
    });
  }

  res.json({
    success: true,
    student,
  });
});
const getStudentBatches = asyncHandler(
  async (req, res) => {
    const batches = await Batches.find({
      students: req.params.studentId,
    })
      .populate("course")
      .populate("trainers")
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      count: batches.length,
      batches,
    });
  }
);
const getStudentNotes = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const batch = await Batches.findOne({
    _id: batchId,
    students: req.user._id,
  });

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found",
    });
  }

  const notes = await Note.find({
    batch: batchId,
  })
    .populate("createdBy", "fullName")
    .sort("-createdAt");

  res.status(200).json({
    success: true,
    count: notes.length,
    notes,
  });
});

const getStudentClassLinks = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const batch = await Batches.findOne({
    _id: batchId,
    students: req.user._id,
  });

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found",
    });
  }

  const classLinks = await ClassLink.find({
    batch: batchId,
  })
    .populate("createdBy", "fullName")
    .sort({ meetingDate: 1 });

  res.status(200).json({
    success: true,
    count: classLinks.length,
    classLinks,
  });
});
const getStudentBatchById = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const batch = await Batches.findOne({
    _id: batchId,
    students: req.user._id,
  }).populate("course","title")
  .populate("trainers","fullName")

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found",
    });
  }


  res.status(200).json({
    success: true,
    batch,
  });
});

const getStudentAnnouncements =
  asyncHandler(async (req, res) => {
   const announcements = await Announcement.find({
  isDeleted: false,
  isPublished:true,
  $or: [
    {
      targetType: "system",
    },
    {
      targetType: "batch",
      batch: { $in: req.params.batchId },
    },
    {
      targetType: "course",
      course: { $in: req.params.courseId },
    },
  ],
})
.sort({
  pinned: -1,
  createdAt: -1,
});

    res.status(200).json({
      success: true,
      count: announcements.length,
      announcements,
    });
  });
const getLoggedStudentAllAnnouncements =
  asyncHandler(async (req, res) => {
    const batches = await Batches.find({
  students: req.user._id,
}).select("_id course");
console.log(batches)
const batchIds = batches.map((b) => b._id);

const courseIds = [
  ...new Set(
    batches.map((b) => b.course?.toString())
  ),
];

   const announcements = await Announcement.find({
  isDeleted: false,
  isPublished:true,
  $or: [
    {
      targetType: "system",
    },
    {
      targetType: "batch",
      batch: { $in: batchIds },
    },
    {
      targetType: "course",
      course: { $in: courseIds },
    },
  ],
})
.sort({
  pinned: -1,
  createdAt: -1,
});

    res.status(200).json({
      success: true,
      count: announcements.length,
      announcements,
    });
  });
const getLoggedStudentAllClasses =
  asyncHandler(async (req, res) => {
    const batches = await Batches.find({
  students: req.user._id,
});

const batchIds = batches.map((b) => b._id);

   const classes = await ClassLink.find({
  isDeleted: false,
  batch:{$in:batchIds},
 meetingDate: { $gte: new Date() },
})
.sort({
meetingDate:-1
}).limit(3);

    res.status(200).json({
      success: true,
      count: classes.length,
      classes,
    });
  });

// export const getAllStudents = asyncHandler(async (req, res) => {
//   const students = await Student.find()
//     .populate("user", "fullName email profileImage")
//     .sort("-createdAt");

//   res.json({
//     success: true,
//     count: students.length,
//     students,
//   });
// });
module.exports={getMyProfile,getLoggedStudentAllClasses,getStudentAnnouncements,updateProfile,getStudentById,getLoggedStudentAllAnnouncements,getStudentBatches,getStudentNotes,getStudentClassLinks,getStudentBatchById}