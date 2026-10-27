const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const TeacherLeave = require("../Modals/TeacherLeave");
const ClassSession = require("../Modals/ClassSession");
const AttendanceAuditLog = require("../Modals/AttendanceAuditLog");
const {
  DEFAULT_TIMEZONE,
  normalizeDate,
  formatDateKey,
  parseTimeToMinutes,
  doTimesOverlap,
} = require("../Utils/dateUtils");

/**
 * @desc    Request teacher leave
 * @route   POST /api/teacher-leave
 * @access  Teacher
 */
const requestTeacherLeave = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason, type = "planned" } = req.body;

  if (!startDate || !endDate || !reason) {
    return res.status(400).json({
      success: false,
      message: "startDate, endDate, and reason are required.",
    });
  }

  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  if (start > end) {
    return res.status(400).json({
      success: false,
      message: "startDate cannot be after endDate.",
    });
  }

  // Check for duplicate or overlapping pending/approved leave
  const existing = await TeacherLeave.findOne({
    academyId: req.academy._id,
    teacher: req.user._id,
    status: { $in: ["pending", "approved"] },
    isDeleted: false,
    startDate: { $lte: end },
    endDate: { $gte: start },
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: `You already have a ${existing.status} leave request spanning this period (${formatDateKey(
        existing.startDate
      )} to ${formatDateKey(existing.endDate)}).`,
    });
  }

  const leave = await TeacherLeave.create({
    academyId: req.academy._id,
    teacher: req.user._id,
    startDate: start,
    endDate: end,
    reason: reason.trim(),
    type,
    status: "pending",
  });

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "APPROVE_TEACHER_LEAVE",
    targetType: "TeacherLeave",
    targetId: leave._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      action: "SUBMIT_REQUEST",
      startDate: start,
      endDate: end,
      reason,
      type,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Teacher leave request submitted successfully. Awaiting administrator review.",
    leave,
  });
});

/**
 * @desc    Get teacher leaves
 * @route   GET /api/teacher-leave
 * @access  Admin / Teacher / Staff
 */
const getTeacherLeaves = asyncHandler(async (req, res) => {
  const { status, teacherId } = req.query;

  const query = {
    academyId: req.academy._id,
    isDeleted: false,
  };

  if (status) query.status = status;

  if (req.user.role === "teacher") {
    query.teacher = req.user._id;
  } else if (teacherId) {
    query.teacher = teacherId;
  }

  const leaves = await TeacherLeave.find(query)
    .populate("teacher", "fullName email phone")
    .populate("reviewedBy", "fullName email")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: leaves.length,
    leaves,
  });
});

/**
 * @desc    Preview future sessions affected by a teacher leave date range
 * @route   GET /api/teacher-leave/preview-affected
 * @access  Admin / Teacher / Staff
 */
const previewAffectedSessions = asyncHandler(async (req, res) => {
  const { teacherId: queryTeacherId, startDate, endDate } = req.query;

  const teacherId = req.user.role === "teacher" ? req.user._id : queryTeacherId;

  if (!teacherId || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "teacherId, startDate, and endDate are required.",
    });
  }

  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  const affectedSessions = await ClassSession.find({
    academyId: req.academy._id,
    $or: [{ teacher: teacherId }, { substituteTeacher: teacherId }],
    date: { $gte: start, $lte: end },
    status: { $nin: ["cancelled", "rescheduled"] },
    isDeleted: false,
  })
    .populate("batch", "name students")
    .sort({ date: 1, startTime: 1 });

  return res.status(200).json({
    success: true,
    count: affectedSessions.length,
    affectedSessions,
  });
});

/**
 * @desc    Review teacher leave request (Approve or Reject with actions for affected sessions)
 * @route   PUT /api/teacher-leave/:id/review
 * @access  Admin / Authorized Staff
 */
const reviewTeacherLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reviewRemarks = "", sessionActions = [] } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be either 'approved' or 'rejected'.",
    });
  }

  const leave = await TeacherLeave.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  }).populate("teacher", "fullName email");

  if (!leave) {
    return res.status(404).json({
      success: false,
      message: "Leave request not found.",
    });
  }

  // Prohibit approving own leave if reviewer is the teacher
  if (String(leave.teacher._id) === String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: "Teachers are not permitted to review or approve their own leave requests.",
    });
  }

  leave.status = status;
  leave.reviewedBy = req.user._id;
  leave.reviewedAt = new Date();
  leave.reviewRemarks = reviewRemarks.trim();

  if (status === "approved") {
    // Process session actions
    const recordedActions = [];

    for (const act of sessionActions) {
      if (!act.sessionId) continue;

      const session = await ClassSession.findOne({
        _id: act.sessionId,
        academyId: req.academy._id,
        status: { $nin: ["cancelled", "rescheduled"] },
        attendanceMarked: false,
        isDeleted: false,
      });

      if (!session) continue;

      if (act.action === "cancelled") {
        session.status = "cancelled";
        session.cancellationReason = `Teacher Leave Approved: ${leave.reason}`;
        session.cancelledBy = req.user._id;
        session.cancelledAt = new Date();
        session.makeUpRequired = true;
        session.makeUpStatus = "pending";
        await session.save();

        recordedActions.push({
          session: session._id,
          action: "cancelled",
        });
      } else if (act.action === "substitute" && act.substituteTeacherId) {
        session.substituteTeacher = act.substituteTeacherId;
        await session.save();

        recordedActions.push({
          session: session._id,
          action: "substitute",
          substituteTeacher: act.substituteTeacherId,
        });
      } else if (act.action === "rescheduled" && act.newDate && act.newStartTime && act.newEndTime) {
        const targetDate = normalizeDate(act.newDate);
        const replacementSession = await ClassSession.create({
          academyId: req.academy._id,
          batch: session.batch,
          teacher: act.newTeacher || session.teacher,
          date: targetDate,
          startTime: act.newStartTime,
          endTime: act.newEndTime,
          title: `${session.title || "Class"} (Rescheduled due to Leave)`,
          room: session.room,
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

        session.status = "rescheduled";
        session.rescheduledToSession = replacementSession._id;
        session.cancellationReason = `Rescheduled due to Teacher Leave`;
        session.cancelledBy = req.user._id;
        session.cancelledAt = new Date();
        await session.save();

        recordedActions.push({
          session: session._id,
          action: "rescheduled",
          newDate: targetDate,
          newStartTime: act.newStartTime,
          newEndTime: act.newEndTime,
        });
      } else {
        // Pending
        recordedActions.push({
          session: session._id,
          action: "pending",
        });
      }
    }

    leave.affectedSessions = recordedActions;
  }

  await leave.save();

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: status === "approved" ? "APPROVE_TEACHER_LEAVE" : "REJECT_TEACHER_LEAVE",
    targetType: "TeacherLeave",
    targetId: leave._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      status,
      reviewRemarks,
      actionsCount: leave.affectedSessions.length,
    },
  });

  return res.status(200).json({
    success: true,
    message: `Teacher leave ${status} successfully.`,
    leave,
  });
});

/**
 * @desc    Cancel a leave request
 * @route   PATCH /api/teacher-leave/:id/cancel
 * @access  Teacher / Admin
 */
const cancelTeacherLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const leave = await TeacherLeave.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!leave) {
    return res.status(404).json({
      success: false,
      message: "Leave request not found.",
    });
  }

  if (req.user.role === "teacher" && String(leave.teacher) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: "You can only cancel your own leave requests.",
    });
  }

  leave.status = "cancelled";
  await leave.save();

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "CANCEL_TEACHER_LEAVE",
    targetType: "TeacherLeave",
    targetId: leave._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: { action: "CANCEL_LEAVE" },
  });

  return res.status(200).json({
    success: true,
    message: "Teacher leave request cancelled.",
    leave,
  });
});

module.exports = {
  requestTeacherLeave,
  getTeacherLeaves,
  previewAffectedSessions,
  reviewTeacherLeave,
  cancelTeacherLeave,
};
