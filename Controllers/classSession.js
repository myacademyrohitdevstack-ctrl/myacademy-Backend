const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const ClassSession = require("../Modals/ClassSession");
const Batch = require("../Modals/Batches");
const User = require("../Modals/User");
const Attendance = require("../Modals/Attendence");
const AttendanceAuditLog = require("../Modals/AttendanceAuditLog");
const {
  DEFAULT_TIMEZONE,
  normalizeDate,
  formatDateKey,
  parseTimeToMinutes,
  doTimesOverlap,
} = require("../Utils/dateUtils");
const { generateSessionsForAcademy } = require("../Utils/sessionGenerator");

/**
 * @desc    Get scheduled sessions for an academy with filters
 * @route   GET /api/sessions
 * @access  Admin / Teacher / Staff
 */
const getAcademySessions = asyncHandler(async (req, res) => {
  const {
    batch,
    teacher,
    status,
    startDate,
    endDate,
    attendanceMarked,
    isExtraSession,
  } = req.query;

  const query = {
    academyId: req.academy._id,
    isDeleted: false,
  };

  if (batch) query.batch = batch;
  if (status) query.status = status;
  if (attendanceMarked !== undefined) {
    query.attendanceMarked = attendanceMarked === "true";
  }
  if (isExtraSession !== undefined) {
    query.isExtraSession = isExtraSession === "true";
  }

  // Teacher role scoping
  if (req.user.role === "teacher") {
    query.$or = [{ teacher: req.user._id }, { substituteTeacher: req.user._id }];
  } else if (teacher) {
    query.$or = [{ teacher }, { substituteTeacher: teacher }];
  }

  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = normalizeDate(startDate);
    if (endDate) query.date.$lte = normalizeDate(endDate);
  }

  const sessions = await ClassSession.find(query)
    .populate("batch", "name schedule")
    .populate("teacher", "fullName email")
    .populate("substituteTeacher", "fullName email")
    .sort({ date: 1, startTime: 1 })
    .limit(300);

  return res.status(200).json({
    success: true,
    count: sessions.length,
    sessions,
  });
});

/**
 * @desc    Get session by ID with eligible enrolled students
 * @route   GET /api/sessions/:id
 * @access  Admin / Teacher / Staff / Student
 */
const getSessionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await ClassSession.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  })
    .populate({
      path: "batch",
      populate: {
        path: "students",
        select: "fullName email phone profileImage status approvalStatus createdAt",
      },
    })
    .populate("teacher", "fullName email phone")
    .populate("substituteTeacher", "fullName email phone")
    .populate("attendance")
    .populate("originalSession")
    .populate("rescheduledToSession");

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Session not found.",
    });
  }

  // Teacher role authorization
  if (req.user.role === "teacher") {
    const isAssigned =
      String(session.teacher?._id) === String(req.user._id) ||
      String(session.substituteTeacher?._id) === String(req.user._id);

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this session.",
      });
    }
  }

  // Student role authorization: student must belong to batch
  if (req.user.role === "student") {
    const isEnrolled = (session.batch?.students || []).some(
      (s) => String(s._id || s) === String(req.user._id)
    );
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this session's batch.",
      });
    }
  }

  return res.status(200).json({
    success: true,
    session,
  });
});

/**
 * @desc    Get today's scheduled sessions for the logged-in teacher
 * @route   GET /api/sessions/teacher/today
 * @access  Teacher
 */
const getTeacherTodaySessions = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const today = normalizeDate(new Date());

  const sessions = await ClassSession.find({
    academyId: req.academy._id,
    $or: [{ teacher: teacherId }, { substituteTeacher: teacherId }],
    date: today,
    isDeleted: false,
  })
    .populate("batch", "name schedule students")
    .populate("teacher", "fullName email")
    .populate("substituteTeacher", "fullName email")
    .sort({ startTime: 1 });

  return res.status(200).json({
    success: true,
    count: sessions.length,
    date: today,
    sessions,
  });
});

/**
 * @desc    Get upcoming scheduled sessions for teacher
 * @route   GET /api/sessions/teacher/upcoming
 * @access  Teacher
 */
const getTeacherUpcomingSessions = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const today = normalizeDate(new Date());

  const sessions = await ClassSession.find({
    academyId: req.academy._id,
    $or: [{ teacher: teacherId }, { substituteTeacher: teacherId }],
    date: { $gt: today },
    status: { $in: ["scheduled", "in_progress"] },
    isDeleted: false,
  })
    .populate("batch", "name schedule")
    .populate("teacher", "fullName email")
    .populate("substituteTeacher", "fullName email")
    .sort({ date: 1, startTime: 1 })
    .limit(10);

  return res.status(200).json({
    success: true,
    count: sessions.length,
    sessions,
  });
});

/**
 * @desc    Get sessions awaiting attendance (past sessions where status !== cancelled and attendanceMarked === false)
 * @route   GET /api/sessions/teacher/pending-attendance
 * @access  Teacher / Admin
 */
const getPendingAttendanceSessions = asyncHandler(async (req, res) => {
  const today = normalizeDate(new Date());

  const query = {
    academyId: req.academy._id,
    date: { $lte: today },
    attendanceMarked: false,
    status: { $nin: ["cancelled", "rescheduled"] },
    isDeleted: false,
  };

  if (req.user.role === "teacher") {
    query.$or = [{ teacher: req.user._id }, { substituteTeacher: req.user._id }];
  }

  const sessions = await ClassSession.find(query)
    .populate("batch", "name schedule students")
    .populate("teacher", "fullName email")
    .populate("substituteTeacher", "fullName email")
    .sort({ date: -1, startTime: -1 })
    .limit(50);

  return res.status(200).json({
    success: true,
    count: sessions.length,
    sessions,
  });
});

/**
 * @desc    Create a one-time extra class session
 * @route   POST /api/sessions/extra
 * @access  Admin / Authorized Staff / Teacher
 */
const createExtraSession = asyncHandler(async (req, res) => {
  const {
    batch,
    teacher,
    date,
    startTime,
    endTime,
    title = "Extra Session",
    room = "",
    meetingPlatform = "offline",
    meetingLink = "",
  } = req.body;

  if (!batch || !teacher || !date || !startTime || !endTime) {
    return res.status(400).json({
      success: false,
      message: "Batch, teacher, date, startTime, and endTime are required.",
    });
  }

  if (parseTimeToMinutes(startTime) >= parseTimeToMinutes(endTime)) {
    return res.status(400).json({
      success: false,
      message: "startTime must be earlier than endTime.",
    });
  }

  const batchDoc = await Batch.findOne({
    _id: batch,
    academyId: req.academy._id,
    isDeleted: false,
  });
  if (!batchDoc) {
    return res.status(404).json({
      success: false,
      message: "Batch not found in this academy.",
    });
  }

  const sessionDate = normalizeDate(date);

  // Check if teacher has overlapping session on this date
  const conflictingTeacherSession = await ClassSession.findOne({
    academyId: req.academy._id,
    date: sessionDate,
    status: { $nin: ["cancelled", "rescheduled"] },
    isDeleted: false,
    $or: [{ teacher }, { substituteTeacher: teacher }],
  });

  if (conflictingTeacherSession && doTimesOverlap(startTime, endTime, conflictingTeacherSession.startTime, conflictingTeacherSession.endTime)) {
    return res.status(409).json({
      success: false,
      message: `Teacher already has a session scheduled at ${conflictingTeacherSession.startTime}-${conflictingTeacherSession.endTime} on this date.`,
    });
  }

  // Idempotency key for extra session
  const dateKey = formatDateKey(sessionDate);
  const idempotencyKey = `extra_${batch}_${teacher}_${dateKey}_${startTime.replace(":", "")}`;

  const session = await ClassSession.create({
    academyId: req.academy._id,
    batch,
    teacher,
    date: sessionDate,
    startTime,
    endTime,
    title,
    room,
    meetingPlatform,
    meetingLink,
    status: "scheduled",
    isExtraSession: true,
    isMakeUp: false,
    makeUpRequired: false,
    makeUpStatus: "none",
    attendanceMarked: false,
    idempotencyKey,
    createdBy: req.user._id,
  });

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "EXTRA_SESSION_CREATED",
    targetType: "ClassSession",
    targetId: session._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      batch,
      teacher,
      date: sessionDate,
      startTime,
      endTime,
      title,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Extra session created successfully.",
    session,
  });
});

/**
 * @desc    Cancel a session
 * @route   POST /api/sessions/:id/cancel
 * @access  Admin / Teacher
 */
const cancelSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, makeUpRequired = false } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "Cancellation reason is required.",
    });
  }

  const session = await ClassSession.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Session not found.",
    });
  }

  if (session.attendanceMarked) {
    return res.status(400).json({
      success: false,
      message: "Cannot cancel a session for which attendance has already been recorded.",
    });
  }

  if (session.status === "cancelled") {
    return res.status(400).json({
      success: false,
      message: "Session is already cancelled.",
    });
  }

  // Teacher authorization
  if (req.user.role === "teacher") {
    const isAssigned =
      String(session.teacher) === String(req.user._id) ||
      String(session.substituteTeacher) === String(req.user._id);
    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to cancel this session.",
      });
    }
  }

  session.status = "cancelled";
  session.cancellationReason = reason.trim();
  session.cancelledBy = req.user._id;
  session.cancelledAt = new Date();
  session.makeUpRequired = Boolean(makeUpRequired);
  session.makeUpStatus = makeUpRequired ? "pending" : "none";

  await session.save();

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "CANCEL_SESSION",
    targetType: "ClassSession",
    targetId: session._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      reason: session.cancellationReason,
      makeUpRequired,
    },
  });

  return res.status(200).json({
    success: true,
    message: "Session cancelled successfully. Students will NOT be marked absent.",
    session,
  });
});

/**
 * @desc    Reschedule a session (creates a replacement session linked to the original)
 * @route   POST /api/sessions/:id/reschedule
 * @access  Admin / Teacher
 */
const rescheduleSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newDate, newStartTime, newEndTime, newTeacher, room } = req.body;

  if (!newDate || !newStartTime || !newEndTime) {
    return res.status(400).json({
      success: false,
      message: "newDate, newStartTime, and newEndTime are required.",
    });
  }

  if (parseTimeToMinutes(newStartTime) >= parseTimeToMinutes(newEndTime)) {
    return res.status(400).json({
      success: false,
      message: "newStartTime must be earlier than newEndTime.",
    });
  }

  const session = await ClassSession.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Session not found.",
    });
  }

  if (session.attendanceMarked) {
    return res.status(400).json({
      success: false,
      message: "Cannot reschedule a session that already has recorded attendance.",
    });
  }

  const assignedTeacher = newTeacher || session.teacher;
  const targetDate = normalizeDate(newDate);

  // Check teacher conflict on new date/time
  const conflictingSession = await ClassSession.findOne({
    _id: { $ne: session._id },
    academyId: req.academy._id,
    date: targetDate,
    status: { $nin: ["cancelled", "rescheduled"] },
    isDeleted: false,
    $or: [{ teacher: assignedTeacher }, { substituteTeacher: assignedTeacher }],
  });

  if (
    conflictingSession &&
    doTimesOverlap(newStartTime, newEndTime, conflictingSession.startTime, conflictingSession.endTime)
  ) {
    return res.status(409).json({
      success: false,
      message: `Teacher has another active session at ${conflictingSession.startTime}-${conflictingSession.endTime} on the rescheduled date.`,
    });
  }

  // Create replacement session
  const replacementSession = await ClassSession.create({
    academyId: req.academy._id,
    batch: session.batch,
    teacher: assignedTeacher,
    date: targetDate,
    startTime: newStartTime,
    endTime: newEndTime,
    title: `${session.title || "Class"} (Rescheduled)`,
    room: room !== undefined ? room : session.room,
    meetingPlatform: session.meetingPlatform,
    meetingLink: session.meetingLink,
    status: "scheduled",
    originalSession: session._id,
    isMakeUp: true,
    makeUpRequired: false,
    makeUpStatus: "scheduled",
    attendanceMarked: false,
    createdBy: req.user._id,
  });

  // Mark original session as rescheduled
  session.status = "rescheduled";
  session.rescheduledToSession = replacementSession._id;
  session.makeUpStatus = "scheduled";
  session.cancellationReason = `Rescheduled to ${formatDateKey(targetDate)} ${newStartTime}-${newEndTime}`;
  session.cancelledBy = req.user._id;
  session.cancelledAt = new Date();
  await session.save();

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "RESCHEDULE_SESSION",
    targetType: "ClassSession",
    targetId: session._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      originalSessionId: session._id,
      replacementSessionId: replacementSession._id,
      newDate: targetDate,
      newStartTime,
      newEndTime,
    },
  });

  return res.status(200).json({
    success: true,
    message: "Session rescheduled successfully.",
    originalSession: session,
    replacementSession,
  });
});

/**
 * @desc    Assign a substitute teacher to a session
 * @route   POST /api/sessions/:id/substitute
 * @access  Admin / Authorized Staff
 */
const assignSubstituteTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { substituteTeacherId } = req.body;

  if (!substituteTeacherId) {
    return res.status(400).json({
      success: false,
      message: "substituteTeacherId is required.",
    });
  }

  const session = await ClassSession.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Session not found.",
    });
  }

  const substituteUser = await User.findOne({
    _id: substituteTeacherId,
    academyId: req.academy._id,
    role: "teacher",
    isDeleted: false,
  });

  if (!substituteUser) {
    return res.status(404).json({
      success: false,
      message: "Substitute teacher not found in this academy.",
    });
  }

  // Check if substitute teacher is already busy at that time
  const conflict = await ClassSession.findOne({
    _id: { $ne: session._id },
    academyId: req.academy._id,
    date: session.date,
    status: { $nin: ["cancelled", "rescheduled"] },
    isDeleted: false,
    $or: [{ teacher: substituteTeacherId }, { substituteTeacher: substituteTeacherId }],
  });

  if (conflict && doTimesOverlap(session.startTime, session.endTime, conflict.startTime, conflict.endTime)) {
    return res.status(409).json({
      success: false,
      message: `Substitute teacher ${substituteUser.fullName} already has a session at ${conflict.startTime}-${conflict.endTime} on this date.`,
    });
  }

  session.substituteTeacher = substituteTeacherId;
  await session.save();

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "SUBSTITUTE_TEACHER",
    targetType: "ClassSession",
    targetId: session._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      originalTeacher: session.teacher,
      substituteTeacher: substituteTeacherId,
    },
  });

  return res.status(200).json({
    success: true,
    message: `Substitute teacher ${substituteUser.fullName} assigned successfully.`,
    session,
  });
});

/**
 * @desc    Get make-up classes due
 * @route   GET /api/sessions/make-up-due
 * @access  Admin / Teacher
 */
const getMakeUpDueSessions = asyncHandler(async (req, res) => {
  const query = {
    academyId: req.academy._id,
    makeUpRequired: true,
    makeUpStatus: "pending",
    isDeleted: false,
  };

  if (req.user.role === "teacher") {
    query.$or = [{ teacher: req.user._id }, { substituteTeacher: req.user._id }];
  }

  const sessions = await ClassSession.find(query)
    .populate("batch", "name")
    .populate("teacher", "fullName email")
    .sort({ date: -1 });

  return res.status(200).json({
    success: true,
    count: sessions.length,
    sessions,
  });
});

/**
 * @desc    Manually trigger session generation (rolling 30 days)
 * @route   POST /api/sessions/generate
 * @access  Admin / Authorized Staff
 */
const triggerSessionGeneration = asyncHandler(async (req, res) => {
  const result = await generateSessionsForAcademy(req.academy._id, 30);
  return res.status(200).json({
    success: true,
    message: `Session generation completed. Created ${result.totalCreated} new sessions, skipped ${result.totalSkipped} existing.`,
    ...result,
  });
});

module.exports = {
  getAcademySessions,
  getSessionById,
  getTeacherTodaySessions,
  getTeacherUpcomingSessions,
  getPendingAttendanceSessions,
  createExtraSession,
  cancelSession,
  rescheduleSession,
  assignSubstituteTeacher,
  getMakeUpDueSessions,
  triggerSessionGeneration,
};
