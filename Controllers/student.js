

const User  = require("../Modals/User");
const mongoose=require('mongoose')
const Student  = require("../Modals/Student");
const asyncHandler = require("../Utils/asyncHandler");
const flatten = require("../Utils/flattenobject");
const Batches = require("../Modals/Batches");
const Note = require("../Modals/Note");
const ClassLink = require("../Modals/ClassLink");
const Announcement = require("../Modals/Announcement");
const Attendance = require("../Modals/Attendence");

const USER_FIELDS = [
  "fullName",
  "email",
  "phone",
];
 const getMyProfile = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    user: req.user._id,
    academyId:req.academy._id,
      isDeleted:false
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
      await User.findOneAndUpdate({
       _id: userId,
         isDeleted:false,
       academyId:req.academy._id
      },{ $set: userUpdates },
        {
          session,
          runValidators: true,
        }
      );
    }

    if (Object.keys(studentUpdates).length) {
      await Student.findOneAndUpdate(
        { user: userId,
          academyId:req.academy._id,
            isDeleted:false
         },
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
      User.findOne({
        _id:userId,
        academyId:req.academy._id,
          isDeleted:false
      }).select(
        "fullName email phone profileImage role"
      ),
      Student.findOne({
         user: userId, 
        academyId:req.academy._id,
          isDeleted:false
        }).select(
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
  const student = await Student.findOne({
    _id:req.params.id,
     academyId:req.academy._id,
       isDeleted:false
  })
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
      academyId:req.academy._id,
        isDeleted:false
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
    academyId:req.academy._id,
      isDeleted:false
  });

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found",
    });
  }

  const notes = await Note.find({
    batch: batchId,
    academyId:req.academy._id,
      isDeleted:false
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
    academyId:req.academy._id,
      isDeleted:false
  });

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found",
    });
  }

  const classLinks = await ClassLink.find({
    batch: batchId,
    academyId:req.academy._id,
      isDeleted:false
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
    academyId:req.academy._id,
    students: req.user._id,
      isDeleted:false
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
  academyId:req.academy._id,
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
  academyId:req.academy._id,
    isDeleted:false
}).select("_id course");

const batchIds = batches.map((b) => b._id);

const courseIds = [
  ...new Set(
    batches.map((b) => b.course?.toString())
  ),
];

   const announcements = await Announcement.find({
  isDeleted: false,
  academyId:req.academy._id,
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
  academyId:req.academy._id,
    isDeleted:false
});

const batchIds = batches.map((b) => b._id);

   const classes = await ClassLink.find({
  isDeleted: false,
  batch:{$in:batchIds},
  academyId:req.academy._id,
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




const getLoggedStudentStatics =
  asyncHandler(async (req, res) => {

    const studentId = req.user._id;

    const batchList = await Batches.find({
      students: studentId,
      academyId:req.academy._id,
        isDeleted:false
    }).select("_id course");

    const batchIds = batchList.map((b) => b._id);

    const courseIds = [
      ...new Set(
        batchList
          .map((b) => b.course?.toString())
          .filter(Boolean)
      ),
    ];

    const [
      classesCount,
      notesCount,
      pdfsCount,
    ] = await Promise.all([
      ClassLink.countDocuments({
        batch: { $in: batchIds },
          isDeleted:false,
        academyId:req.academy._id,
      }),

      Note.countDocuments({
        batch: { $in: batchIds },
          isDeleted:false,
        academyId:req.academy._id
      }),

      Note.countDocuments({
        batch: { $in: batchIds },
          isDeleted:false,
        fileType: "pdf",
        academyId:req.academy._id
      }),
    ]);

    res.status(200).json({
      success: true,
      statics: {
        batches: batchList.length,
        courses: courseIds.length,
        classes: classesCount,
        notes: notesCount,
        pdfs: pdfsCount,
      },
    })
  })


const getStudentAttendanceDashboard = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const attendance = await Attendance.find({
    "records.student": studentId,
    academyId:req.academy._id,
      isDeleted:false
  })
    .select("date records")
    .sort({ date: -1 });

  let present = 0;
  let absent = 0;

  const recentAttendance = [];

  attendance.forEach((item) => {
    const record = item.records.find(
      (r) => r.student.toString() === studentId.toString()
    );

    if (!record) return;

    if (record.status === "present") {
      present++;
    } else {
      absent++;
    }

    recentAttendance.push({
      attendanceId: item._id,
      date: item.date,
      status: record.status,
    });
  });

  const totalClasses = present + absent;

  const attendancePercentage =
    totalClasses === 0
      ? 0
      : Math.round((present / totalClasses) * 100);

  const requiredAttendance = 75;

  const eligible =
    attendancePercentage >= requiredAttendance;

  // Current Present Streak
  let currentStreak = 0;

  for (const item of recentAttendance) {
    if (item.status === "present") {
      currentStreak++;
    } else {
      break;
    }
  }

  const lastAbsent = recentAttendance.find(
    (item) => item.status === "absent"
  );

  return res.status(200).json({
    success: true,

    stats: {
      attendancePercentage,
      present,
      absent,
      totalClasses,
    },

    progress: {
      requiredAttendance,
      eligible,
    },

    recentAttendance: recentAttendance.slice(0, 10),

    insights: {
      currentStreak,
      lastAbsent: lastAbsent?.date || null,
    },
  });
});


module.exports={getMyProfile,getStudentAttendanceDashboard,getLoggedStudentAllClasses,getLoggedStudentStatics,getStudentAnnouncements,updateProfile,getStudentById,getLoggedStudentAllAnnouncements,getStudentBatches,getStudentNotes,getStudentClassLinks,getStudentBatchById}