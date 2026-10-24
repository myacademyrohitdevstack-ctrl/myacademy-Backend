
const Student = require("../Modals/Student");
const Teacher = require("../Modals/Teacher");
const sendEmail = require("../Utils/sendEmail");
const asyncHandler = require("../Utils/asyncHandler");
const User = require("../Modals/User");
const ClassLink = require("../Modals/ClassLink");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const Announcement = require("../Modals/Announcement");

const Course = require("../Modals/Courses");
const Batch = require("../Modals/Batches");
const Attendance = require("../Modals/Attendence");
const mongoose = require("mongoose");
const getTeacherDashboardStats = asyncHandler(async (req, res) => {
  const academyId = req.academy._id;
  const teacherId = req.user._id;

  // Teacher batches
  const batches = await Batch.find({
    academyId,
    trainers: teacherId,
    isDeleted: false,
  }).select("_id students status course");

  const batchIds = batches.map(b => b._id);

  const studentIds = [
    ...new Set(
      batches.flatMap(batch =>
        batch.students.map(id => id.toString())
      )
    ),
  ];

  const [
    totalStudents,
    approvedStudents,
    pendingStudents,
    blockedStudents,
    totalCourses,
    activeBatches,
    totalAttendanceSessions,
    recentAttendanceSessions,
  ] = await Promise.all([
    User.countDocuments({
      _id: { $in: studentIds },
      role: "student",
      isDeleted: false,
    }),

    User.countDocuments({
      _id: { $in: studentIds },
      approvalStatus: "approved",
      isDeleted: false,
    }),

    User.countDocuments({
      _id: { $in: studentIds },
      approvalStatus: "pending",
      isDeleted: false,
    }),

    User.countDocuments({
      _id: { $in: studentIds },
      status: "blocked",
      isDeleted: false,
    }),

    Course.countDocuments({
      _id: {
        $in: [...new Set(batches.map(b => b.course))],
      },
      isDeleted: false,
    }),

    Batch.countDocuments({
      _id: { $in: batchIds },
      status: "active",
      isDeleted: false,
    }),

    Attendance.countDocuments({
      academyId,
      batch: { $in: batchIds },
      isDeleted: false,
    }),

    Attendance.find({
      academyId,
      batch: { $in: batchIds },
      isDeleted: false,
    })
      .populate("batch", "name")
      .sort({ date: -1 })
      .limit(6),
  ]);

  res.status(200).json({
    success: true,
    stats: {
      totalStudents,
      approvedStudents,
      pendingStudents,
      blockedStudents,
      totalCourses,
      totalBatches: batchIds.length,
      activeBatches,
      totalAttendanceSessions,
      recentAttendanceSessions,
    },
  });
});

const getTeacherRecentEnrollments = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
    academyId: req.academy._id,
    trainers: req.user._id,
    isDeleted: false,
  })
    .populate("course", "title")
    .populate(
      "students",
      "fullName email status approvalStatus createdAt"
    );

  const enrollmentMap = new Map();

  batches.forEach((batch) => {
    batch.students.forEach((student) => {
      if (!enrollmentMap.has(student._id.toString())) {
        enrollmentMap.set(student._id.toString(), {
          id: student._id,
          name: student.fullName,
          batch: batch.name,
          course: batch.course?.title || "N/A",
          status: student.approvalStatus,
          enrolledAt: student.createdAt,
        });
      }
    });
  });

  const enrollments = [...enrollmentMap.values()].sort(
    (a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt)
  );

  res.status(200).json({
    success: true,
    count: enrollments.length,
    enrollments: enrollments.slice(0, 10),
  });
});

const getTeacherClasses = asyncHandler(async (req, res) => {

  const batchIds = await Batch.find({
    academyId: req.academy._id,
    trainers: req.user._id,
    isDeleted: false,
  }).distinct("_id");

  const classes = await ClassLink.find({
    academyId: req.academy._id,
    batch: { $in: batchIds },
    isDeleted: false,
  })
    .sort({ meetingDate: -1 })
    .limit(5);

  res.status(200).json({
    success: true,
    classes,
  });
});
const getTeacherAnnouncements = asyncHandler(async (req, res) => {

  const batchIds = await Batch.find({
    academyId: req.academy._id,
    trainers: req.user._id,
    isDeleted: false,
  }).distinct("_id");

  const announcements = await Announcement.find({
    academyId: req.academy._id,
    batch: { $in: batchIds },
    isDeleted: false,
  })
    .sort({
      pinned: -1,
      createdAt: -1,
    })
    .limit(5);

  res.status(200).json({
    success: true,
    announcements,
  });
});

const getTeacherCourses = asyncHandler(async (req, res) => {
  // Get unique course IDs from the teacher's batches
  const courseIds = await Batch.find({
    academyId: req.academy._id,
    trainers: req.user._id,
    isDeleted: false,
  }).distinct("course");

  const courses = await Course.find({
    _id: { $in: courseIds },
    academyId: req.academy._id,
    isDeleted: false,
  })
    .populate("createdBy", "fullName email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: courses.length,
    courses,
  });
});

module.exports={
    getTeacherDashboardStats,getTeacherRecentEnrollments,getTeacherClasses,getTeacherAnnouncements,getTeacherCourses
}