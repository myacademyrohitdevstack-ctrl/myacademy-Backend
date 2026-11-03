const mongoose = require("mongoose");

const User = require("../Modals/User");
const Teacher = require("../Modals/Teacher");
const Batch = require("../Modals/Batches");
const ClassLink = require("../Modals/ClassLink");
const Course = require("../Modals/Courses");
const Attendance = require("../Modals/Attendence");
const Announcement = require("../Modals/Announcement");
const asyncHandler = require("../Utils/asyncHandler");

// Fields stored in the User model
const USER_FIELDS = ["fullName", "phone"];

// Fields stored in the Teacher model
const TEACHER_FIELDS = [
  "city",
  "gender",
  "dateOfBirth",
  "subject",
  "experience",
  "qualification",
  "studentLevel",
  "mode",
  "bio",
  "availability",
  "timeSlot",
  "headline",
  "hourlyRate",
];

/**
 * Strict allowlist serializer for public tutor profiles.
 * Sensitive data (email, phone, internal notes, passwords) is never returned.
 */
function serializePublicTeacher(teacher) {
  if (!teacher) return null;
  const user = teacher.user || {};
  const allowed =
    Array.isArray(teacher.allowedPublicFields) && teacher.allowedPublicFields.length > 0
      ? teacher.allowedPublicFields
      : [
          "fullName",
          "city",
          "subject",
          "experience",
          "qualification",
          "studentLevel",
          "mode",
          "bio",
          "availability",
          "timeSlot",
          "profileImage",
          "headline",
          "hourlyRate",
          "rating",
          "reviewsCount",
        ];

  const fullData = {
    id: teacher._id,
    fullName: user.fullName || "Academy Tutor",
    profileImage: user.profileImage?.url || null,
    city: teacher.city || "",
    subject: teacher.subject || "",
    experience: teacher.experience || "",
    qualification: teacher.qualification || "",
    studentLevel: teacher.studentLevel || "",
    mode: teacher.mode || "",
    bio: teacher.bio || "",
    availability: teacher.availability || [],
    timeSlot: teacher.timeSlot || [],
    headline: teacher.headline || "",
    hourlyRate: teacher.hourlyRate || { min: 0, max: 0, currency: "INR" },
    rating: teacher.rating || 5.0,
    reviewsCount: teacher.reviewsCount || 0,
    coursesCount: (teacher.courses || []).length,
  };

  const serialized = { id: fullData.id };
  for (const field of allowed) {
    if (fullData[field] !== undefined) {
      serialized[field] = fullData[field];
    }
  }

  return serialized;
}

// GET: Logged-in teacher's profile
const getMyProfile = asyncHandler(async (req, res) => {
  let teacher = await Teacher.findOne({
    user: req.user._id,
    isDeleted: false,
  }).populate(
    "user",
    "fullName email phone profileImage role status approvalStatus"
  );

  if (!teacher) {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const TutorApplication = require("../Modals/TutorApplication");
    const existingApp = await TutorApplication.findOne({
      $or: [
        { user: req.user._id },
        { email: (user.email || "").toLowerCase() },
      ],
      isDeleted: false,
    });

    teacher = await Teacher.create({
      user: req.user._id,
      subject: existingApp?.subject || "",
      experience: existingApp?.experience || "",
      qualification: existingApp?.qualification || "",
      studentLevel: existingApp?.studentLevel || "",
      mode: existingApp?.mode || "Online Classes",
      availability: existingApp?.availability || [],
      timeSlot: existingApp?.timeSlot || [],
      city: existingApp?.city || "",
      bio: existingApp?.bio || "",
      headline: existingApp?.subject ? `${existingApp.subject} Instructor` : "",
      profileCompleted: Boolean(existingApp),
      isPublished: false,
    });

    if (existingApp && !existingApp.teacher) {
      existingApp.teacher = teacher._id;
      if (!existingApp.user) existingApp.user = req.user._id;
      await existingApp.save();
    }

    teacher = await Teacher.findById(teacher._id).populate(
      "user",
      "fullName email phone profileImage role status approvalStatus"
    );
  }

  return res.status(200).json({
    success: true,
    teacher,
  });
});

// PATCH: Update logged-in teacher's profile
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const body = req.body;

  // Normalize aliases from different forms (e.g. become-a-tutor vs teacher-panel)
  if (body.teachingMode && !body.mode) body.mode = body.teachingMode;
  if (body.qualifications && !body.qualification) body.qualification = body.qualifications;
  if (body.level && !body.studentLevel) body.studentLevel = body.level;
  if (body.name && !body.fullName) body.fullName = body.name;

  const userUpdates = {};
  const teacherUpdates = {};

  // Whitelist allowed fields to prevent arbitrary updates
  for (const [key, value] of Object.entries(body)) {
    if (USER_FIELDS.includes(key)) {
      userUpdates[key] = value;
    } else if (TEACHER_FIELDS.includes(key)) {
      teacherUpdates[key] = value;
    }
  }

  if (body.city && !teacherUpdates.city) {
    teacherUpdates.city = body.city;
  }

  if (
    Object.keys(userUpdates).length === 0 &&
    Object.keys(teacherUpdates).length === 0
  ) {
    return res.status(400).json({
      success: false,
      message: "No valid profile fields provided.",
    });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const user = await User.findOne({
      _id: userId,
      isDeleted: false,
    }).session(session);

    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    let teacher = await Teacher.findOne({
      user: userId,
      isDeleted: false,
    }).session(session);

    const TutorApplication = require("../Modals/TutorApplication");
    const linkedApp = await TutorApplication.findOne({
      $or: [
        { user: userId },
        ...(teacher ? [{ teacher: teacher._id }] : []),
        { email: (user.email || "").toLowerCase() },
      ],
      isDeleted: false,
    }).session(session);

    if (!teacher) {
      // Auto-create teacher document if missing
      const createdTeacher = await Teacher.create(
        [
          {
            user: userId,
            subject: teacherUpdates.subject || linkedApp?.subject || "",
            experience: teacherUpdates.experience || linkedApp?.experience || "",
            qualification: teacherUpdates.qualification || linkedApp?.qualification || "",
            studentLevel: teacherUpdates.studentLevel || linkedApp?.studentLevel || "",
            mode: teacherUpdates.mode || linkedApp?.mode || "Online Classes",
            availability: teacherUpdates.availability || linkedApp?.availability || [],
            timeSlot: teacherUpdates.timeSlot || linkedApp?.timeSlot || [],
            city: teacherUpdates.city || linkedApp?.city || "",
            gender: teacherUpdates.gender || "",
            bio: teacherUpdates.bio || linkedApp?.bio || "",
            headline: teacherUpdates.headline || `${teacherUpdates.subject || "Academic"} Instructor`,
            profileCompleted: true,
            isPublished: false,
          },
        ],
        { session }
      );
      teacher = createdTeacher[0];
    } else {
      teacherUpdates.profileCompleted = true;
      if (Object.keys(teacherUpdates).length > 0) {
        await Teacher.updateOne(
          {
            _id: teacher._id,
          },
          {
            $set: teacherUpdates,
          },
          {
            session,
            runValidators: true,
          }
        );
      }
    }

    if (Object.keys(userUpdates).length > 0) {
      await User.updateOne(
        {
          _id: userId,
          isDeleted: false,
        },
        {
          $set: userUpdates,
        },
        {
          session,
          runValidators: true,
        }
      );
    }

    // Synchronize to the linked lead (TutorApplication) so lead & teacher match 1:1
    if (linkedApp) {
      if (userUpdates.fullName) linkedApp.fullName = userUpdates.fullName.trim();
      if (userUpdates.phone) linkedApp.phone = userUpdates.phone.trim();
      if (teacherUpdates.city !== undefined) linkedApp.city = teacherUpdates.city;
      if (teacherUpdates.subject) linkedApp.subject = teacherUpdates.subject;
      if (teacherUpdates.experience !== undefined) linkedApp.experience = teacherUpdates.experience;
      if (teacherUpdates.qualification !== undefined) linkedApp.qualification = teacherUpdates.qualification;
      if (teacherUpdates.studentLevel !== undefined) linkedApp.studentLevel = teacherUpdates.studentLevel;
      if (teacherUpdates.mode !== undefined) linkedApp.mode = teacherUpdates.mode;
      if (teacherUpdates.availability !== undefined) linkedApp.availability = teacherUpdates.availability;
      if (teacherUpdates.timeSlot !== undefined) linkedApp.timeSlot = teacherUpdates.timeSlot;
      if (teacherUpdates.bio !== undefined) linkedApp.bio = teacherUpdates.bio;
      if (!linkedApp.user) linkedApp.user = userId;
      if (!linkedApp.teacher) linkedApp.teacher = teacher._id;
      await linkedApp.save({ session });
    }

    await session.commitTransaction();

    // Fetch fresh data after the transaction succeeds
    const [updatedUser, updatedTeacher] = await Promise.all([
      User.findOne({
        _id: userId,
        isDeleted: false,
      }).select("fullName email phone profileImage role status"),

      Teacher.findOne({
        user: userId,
        isDeleted: false,
      }).select(
        "city gender dateOfBirth subject experience qualification studentLevel mode bio availability timeSlot profileCompleted courses isPublished headline hourlyRate rating reviewsCount"
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: "Teacher profile updated successfully.",
      data: {
        user: updatedUser,
        profile: updatedTeacher,
      },
      teacher: updatedTeacher,
    });
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw err;
  } finally {
    await session.endSession();
  }
});

// GET: Teacher details by User ID (admin only)
const getTeacherById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID.",
    });
  }

  const teacher = await Teacher.findOne({
    user: id,
    isDeleted: false,
  }).populate(
    "user",
    "fullName email phone profileImage role status approvalStatus"
  );

  if (!teacher) {
    return res.status(404).json({
      success: false,
      message: "Teacher profile not found.",
    });
  }

  return res.status(200).json({
    success: true,
    teacher,
  });
});

// GET: Courses assigned to the logged-in teacher
const getTeacherCourses = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({
    user: req.user._id,
    isDeleted: false,
  }).populate("courses");

  const batches = await Batch.find({
    trainers: req.user._id,
    isDeleted: false,
  }).populate("course");

  const courseMap = new Map();
  if (teacher && teacher.courses) {
    teacher.courses.forEach((c) => {
      if (c && c._id) courseMap.set(c._id.toString(), c);
    });
  }
  batches.forEach((b) => {
    if (b.course && b.course._id && !courseMap.has(b.course._id.toString())) {
      courseMap.set(b.course._id.toString(), b.course);
    }
  });

  const courses = Array.from(courseMap.values());

  return res.status(200).json({
    success: true,
    count: courses.length,
    courses,
  });
});

/**
 * GET /api/teacher/public
 * Public tutor directory (strict security: approved, published, active only).
 */
const getPublicTutors = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    search = "",
    subject,
    mode,
    city,
    sort = "rating",
  } = req.query;

  const currentPage = Math.max(Number(page), 1);
  const perPage = Math.min(Math.max(Number(limit), 1), 50);
  const skip = (currentPage - 1) * perPage;

  const filter = {
    isDeleted: false,
    isPublished: true,
  };

  if (subject && subject !== "all") {
    filter.subject = { $regex: subject, $options: "i" };
  }

  if (mode && mode !== "all") {
    filter.mode = { $regex: mode, $options: "i" };
  }

  if (city && city !== "all") {
    filter.city = { $regex: city, $options: "i" };
  }

  const sortOption = sort === "newest" ? { createdAt: -1 } : { rating: -1, reviewsCount: -1 };

  const teachers = await Teacher.find(filter)
    .populate({
      path: "user",
      match: { isDeleted: false, status: "active", approvalStatus: "approved" },
      select: "fullName profileImage status approvalStatus",
    })
    .sort(sortOption)
    .lean();

  let eligible = teachers.filter((t) => t.user && t.user._id);

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    eligible = eligible.filter((t) => {
      const name = (t.user?.fullName || "").toLowerCase();
      const subj = (t.subject || "").toLowerCase();
      const cty = (t.city || "").toLowerCase();
      const bio = (t.bio || "").toLowerCase();
      return name.includes(s) || subj.includes(s) || cty.includes(s) || bio.includes(s);
    });
  }

  const total = eligible.length;
  const paginated = eligible.slice(skip, skip + perPage);
  const tutors = paginated.map(serializePublicTeacher);

  return res.status(200).json({
    success: true,
    tutors,
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage),
      hasNextPage: currentPage * perPage < total,
      hasPreviousPage: currentPage > 1,
    },
  });
});

/**
 * GET /api/teacher/public/:id
 * Public single tutor profile by teacher ID.
 */
const getPublicTutorById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid tutor ID." });
  }

  const teacher = await Teacher.findOne({
    _id: id,
    isDeleted: false,
    isPublished: true,
  })
    .populate({
      path: "user",
      match: { isDeleted: false, status: "active", approvalStatus: "approved" },
      select: "fullName profileImage status approvalStatus",
    })
    .lean();

  if (!teacher || !teacher.user) {
    return res.status(404).json({
      success: false,
      message: "Tutor profile not found or is currently not publicly available.",
    });
  }

  return res.status(200).json({
    success: true,
    tutor: serializePublicTeacher(teacher),
  });
});


// GET: Batches assigned to the logged-in teacher
const getTeacherBatches = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
    trainers: req.user._id,
    isDeleted: false,
  })
    .populate("course", "title slug category level duration thumbnail")
    .populate("students", "fullName email")
    .sort("-createdAt");

  return res.status(200).json({
    success: true,
    count: batches.length,
    batches,
  });
});

// GET: Scheduled / upcoming live classes for batches assigned to the teacher
const getTeacherClasses = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
    trainers: req.user._id,
    isDeleted: false,
  }).select("_id name schedule meetingPlatform");

  const batchIds = batches.map((b) => b._id);

  const classes = await ClassLink.find({
    batch: { $in: batchIds },
    isDeleted: false,
  })
    .populate("batch", "name schedule meetingPlatform")
    .populate("createdBy", "fullName")
    .sort({ meetingDate: 1 });

  return res.status(200).json({
    success: true,
    count: classes.length,
    classes,
  });
});

// GET: Enrolled students across batches assigned to the teacher (protect sensitive info)
const getTeacherStudents = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
    trainers: req.user._id,
    isDeleted: false,
  })
    .populate("course", "title slug")
    .populate("students", "fullName email profileImage createdAt");

  const studentMap = new Map();

  batches.forEach((batch) => {
    (batch.students || []).forEach((student) => {
      if (student && student._id) {
        const studentId = student._id.toString();
        const batchInfo = {
          _id: batch._id,
          name: batch.name,
          course: batch.course?.title || "Language Course",
        };

        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            _id: student._id,
            id: student._id,
            fullName: student.fullName,
            email: student.email,
            profileImage: student.profileImage,
            joinedAt: student.createdAt,
            batches: [batchInfo],
          });
        } else {
          studentMap.get(studentId).batches.push(batchInfo);
        }
      }
    });
  });

  const students = Array.from(studentMap.values());

  return res.status(200).json({
    success: true,
    count: students.length,
    students,
  });
});

// GET: Summary metrics for logged-in teacher dashboard
const getTeacherStats = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
    trainers: req.user._id,
    isDeleted: false,
  }).select("_id students course");

  const batchIds = batches.map((b) => b._id);

  const studentIdSet = new Set();
  batches.forEach((b) => {
    (b.students || []).forEach((s) => {
      if (s) studentIdSet.add(s.toString());
    });
  });

  const classesCount = await ClassLink.countDocuments({
    batch: { $in: batchIds },
    isDeleted: false,
  });

  const courseIdSet = new Set(
    batches.map((b) => b.course?.toString()).filter(Boolean)
  );

  return res.status(200).json({
    success: true,
    stats: {
      batches: batches.length,
      classes: classesCount,
      students: studentIdSet.size,
      courses: courseIdSet.size,
    },
  });
});

// GET: Dashboard statistics for the logged-in teacher
const getTeacherDashboardStats = asyncHandler(async (req, res) => {
  const academyId = req.academy?._id || req.user?.academyId;
  const teacherId = req.user._id;

  const batches = await Batch.find({
    ...(academyId ? { academyId } : {}),
    trainers: teacherId,
    isDeleted: false,
  }).select("_id students status course");

  const batchIds = batches.map((b) => b._id);

  const studentIds = [
    ...new Set(
      batches.flatMap((batch) =>
        (batch.students || []).map((id) => id.toString())
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
        $in: [...new Set(batches.map((b) => b.course).filter(Boolean))],
      },
      isDeleted: false,
    }),

    Batch.countDocuments({
      _id: { $in: batchIds },
      status: "active",
      isDeleted: false,
    }),

    Attendance.countDocuments({
      ...(academyId ? { academyId } : {}),
      batch: { $in: batchIds },
      isDeleted: false,
    }),

    Attendance.find({
      ...(academyId ? { academyId } : {}),
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

// GET: Recent enrollments for batches assigned to logged-in teacher
const getTeacherRecentEnrollments = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const academyId = req.academy?._id || req.user?.academyId;

  const batches = await Batch.find({
    ...(academyId ? { academyId } : {}),
    trainers: teacherId,
    isDeleted: false,
  })
    .populate("course", "title")
    .populate(
      "students",
      "fullName email phone status approvalStatus createdAt"
    );

  const enrollmentMap = new Map();

  batches.forEach((batch) => {
    (batch.students || []).forEach((student) => {
      if (student && student._id && !enrollmentMap.has(student._id.toString())) {
        const courseTitle = batch.course?.title || "General Cohort";
        enrollmentMap.set(student._id.toString(), {
          _id: student._id,
          id: student._id,
          name: student.fullName,
          email: student.email,
          batch: batch.name,
          course: {
            title: courseTitle,
          },
          student: {
            _id: student._id,
            fullName: student.fullName,
            email: student.email,
            phone: student.phone,
            status: student.status,
            approvalStatus: student.approvalStatus,
          },
          status: student.approvalStatus || student.status || "active",
          enrolledAt: student.createdAt,
          createdAt: student.createdAt,
        });
      }
    });
  });

  let enrollments = [...enrollmentMap.values()].sort(
    (a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt)
  );

  if (enrollments.length === 0 && academyId) {
    const recentAcademyStudents = await User.find({
      academyId,
      role: "student",
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("fullName email phone status approvalStatus createdAt");

    if (recentAcademyStudents.length > 0) {
      const allBatches = await Batch.find({
        academyId,
        isDeleted: false,
      })
        .populate("course", "title")
        .select("name course students");

      const studentBatchMap = new Map();
      allBatches.forEach((batch) => {
        (batch.students || []).forEach((stId) => {
          const idStr = (stId._id || stId).toString();
          if (!studentBatchMap.has(idStr)) {
            studentBatchMap.set(idStr, {
              batch: batch.name,
              courseTitle: batch.course?.title || "General Cohort",
            });
          }
        });
      });

      enrollments = recentAcademyStudents.map((student) => {
        const batchInfo = studentBatchMap.get(student._id.toString());
        const courseTitle = batchInfo?.courseTitle || "General Admission";
        const batchName = batchInfo?.batch || "Unassigned";

        return {
          _id: student._id,
          id: student._id,
          name: student.fullName,
          email: student.email,
          batch: batchName,
          course: {
            title: courseTitle,
          },
          student: {
            _id: student._id,
            fullName: student.fullName,
            email: student.email,
            phone: student.phone,
            status: student.status,
            approvalStatus: student.approvalStatus,
          },
          status: student.approvalStatus || student.status || "active",
          enrolledAt: student.createdAt,
          createdAt: student.createdAt,
        };
      });
    }
  }

  res.status(200).json({
    success: true,
    count: enrollments.length,
    enrollments: enrollments.slice(0, 10),
  });
});

// GET: Announcements for batches assigned to logged-in teacher
const getTeacherAnnouncements = asyncHandler(async (req, res) => {
  const academyId = req.academy?._id || req.user?.academyId;
  const batchIds = await Batch.find({
    ...(academyId ? { academyId } : {}),
    trainers: req.user._id,
    isDeleted: false,
  }).distinct("_id");

  const announcements = await Announcement.find({
    ...(academyId ? { academyId } : {}),
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

module.exports = {
  getMyProfile,
  updateProfile,
  getTeacherById,
  getTeacherCourses,
  getTeacherBatches,
  getTeacherClasses,
  getTeacherStudents,
  getTeacherStats,
  getTeacherDashboardStats,
  getTeacherRecentEnrollments,
  getTeacherAnnouncements,
  getPublicTutors,
  getPublicTutorById,
  serializePublicTeacher,
};
