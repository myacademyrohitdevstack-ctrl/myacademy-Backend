const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const Attendance = require("../Modals/Attendence");
const Batch = require("../Modals/Batches");
const User = require("../Modals/User");
const Student = require("../Modals/Student");
const ClassSession = require("../Modals/ClassSession");
const AttendanceAuditLog = require("../Modals/AttendanceAuditLog");
const { normalizeDate, formatDateKey } = require("../Utils/dateUtils");

/**
 * @desc    Mark attendance (session-based or legacy batch-date based)
 * @route   POST /api/attendence/mark
 * @access  Teacher / Admin / Staff
 */
const markAttendance = asyncHandler(async (req, res) => {
  const { batch, date, records, session: rawSession, sessionId: rawSessionId } = req.body;

  const targetSessionId = rawSession || rawSessionId;
  let sessionDoc = null;
  let targetBatchId = batch;
  let attendanceDate = date ? normalizeDate(date) : null;

  if (targetSessionId) {
    sessionDoc = await ClassSession.findOne({
      _id: targetSessionId,
      academyId: req.academy._id,
      isDeleted: false,
    });

    if (!sessionDoc) {
      return res.status(404).json({
        success: false,
        message: "Session not found in this academy.",
      });
    }

    if (sessionDoc.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Attendance marking is disabled because this class session was cancelled.",
      });
    }

    if (sessionDoc.attendanceMarked) {
      return res.status(400).json({
        success: false,
        message: "Attendance has already been recorded for this session.",
      });
    }

    targetBatchId = sessionDoc.batch;
    attendanceDate = sessionDoc.date;

    // Teacher authorization: assigned teacher or substitute teacher
    if (req.user.role === "teacher") {
      const isAssigned =
        String(sessionDoc.teacher) === String(req.user._id) ||
        String(sessionDoc.substituteTeacher) === String(req.user._id);

      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to mark attendance for this session.",
        });
      }
    }
  }

  // Validate batch
  const batchDoc = await Batch.findOne({
    _id: targetBatchId,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!batchDoc) {
    return res.status(400).json({
      success: false,
      message: "Batch not found in this academy.",
    });
  }

  if (
    !sessionDoc &&
    req.user.role === "teacher" &&
    !batchDoc.trainers.some((trainer) => trainer.toString() === req.user._id.toString())
  ) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to mark attendance for this batch.",
    });
  }

  if (!attendanceDate) {
    return res.status(400).json({
      success: false,
      message: "Valid attendance date or session is required.",
    });
  }

  // Check if attendance already exists
  const existQuery = {
    batch: targetBatchId,
    academyId: req.academy._id,
    isDeleted: false,
  };
  if (sessionDoc) {
    existQuery.session = sessionDoc._id;
  } else {
    existQuery.date = attendanceDate;
  }

  const alreadyExists = await Attendance.findOne(existQuery);
  if (alreadyExists) {
    return res.status(400).json({
      success: false,
      message: "Attendance has already been marked for this session/batch on this date.",
    });
  }

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Attendance records are required.",
    });
  }

  const studentIds = records.map((r) => r.student);

  // Validate that students belong to this academy and are not deleted
  const validStudents = await User.find({
    _id: { $in: studentIds },
    academyId: req.academy._id,
    isDeleted: false,
  });

  const validStudentIds = validStudents.map((s) => s._id.toString());
  const invalidStudents = studentIds.filter(
    (id) => !validStudentIds.includes(id.toString())
  );

  if (invalidStudents.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Some students do not belong to this academy.",
    });
  }

  // Check student enrolment date (students enrolled AFTER session date should not be marked absent)
  const studentsProfiles = await Student.find({
    user: { $in: studentIds },
    academyId: req.academy._id,
    isDeleted: false,
  });
  const studentAdmissionMap = new Map();
  studentsProfiles.forEach((st) => {
    studentAdmissionMap.set(String(st.user), st.admissionDate);
  });

  const sanitizedRecords = records.map((r) => {
    const admissionDate = studentAdmissionMap.get(String(r.student));
    // If student was admitted strictly after this date, they are not eligible for false absences
    if (admissionDate && normalizeDate(admissionDate) > attendanceDate && r.status === "absent") {
      return {
        student: r.student,
        status: "leave",
        remarks: "Not enrolled on class date (pre-admission)",
        markedAt: new Date(),
      };
    }
    return {
      student: r.student,
      status: r.status,
      remarks: r.remarks || "",
      markedAt: new Date(),
    };
  });

  const attendance = await Attendance.create({
    batch: targetBatchId,
    session: sessionDoc ? sessionDoc._id : null,
    date: attendanceDate,
    records: sanitizedRecords,
    markedBy: req.user._id,
    academyId: req.academy._id,
  });

  if (sessionDoc) {
    sessionDoc.attendanceMarked = true;
    sessionDoc.attendance = attendance._id;
    sessionDoc.status = "completed";
    await sessionDoc.save();
  }

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "MARK_ATTENDANCE",
    targetType: "Attendance",
    targetId: attendance._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      batch: targetBatchId,
      session: sessionDoc ? sessionDoc._id : null,
      date: attendanceDate,
      totalStudents: sanitizedRecords.length,
      present: sanitizedRecords.filter((r) => r.status === "present").length,
      absent: sanitizedRecords.filter((r) => r.status === "absent").length,
      leave: sanitizedRecords.filter((r) => r.status === "leave").length,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Attendance marked successfully.",
    attendance,
  });
});

/**
 * @desc    Update attendance with audit tracking
 * @route   PUT /api/attendence/:attendanceId
 * @access  Teacher / Admin / Staff
 */
const updateAttendance = asyncHandler(async (req, res) => {
  const { attendanceId } = req.params;
  const { records, reason = "Attendance correction" } = req.body;

  if (!records?.length) {
    return res.status(400).json({
      success: false,
      message: "Attendance records are required.",
    });
  }

  const attendance = await Attendance.findOne({
    _id: attendanceId,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance not found.",
    });
  }

  const oldRecordsMap = new Map();
  attendance.records.forEach((r) => {
    oldRecordsMap.set(String(r.student), r.status);
  });

  const auditEntries = [];

  records.forEach((newRec) => {
    const studentIdStr = String(newRec.student);
    const oldStatus = oldRecordsMap.get(studentIdStr);
    if (oldStatus && oldStatus !== newRec.status) {
      auditEntries.push({
        modifiedBy: req.user._id,
        modifiedAt: new Date(),
        student: newRec.student,
        previousStatus: oldStatus,
        newStatus: newRec.status,
        reason: reason.trim(),
      });
    }
  });

  attendance.records = records.map((r) => ({
    student: r.student,
    status: r.status,
    remarks: r.remarks || "",
    markedAt: new Date(),
  }));
  attendance.markedBy = req.user._id;

  if (auditEntries.length > 0) {
    attendance.auditHistory.push(...auditEntries);
  }

  await attendance.save();

  if (auditEntries.length > 0) {
    await AttendanceAuditLog.create({
      academyId: req.academy._id,
      action: "UPDATE_ATTENDANCE",
      targetType: "Attendance",
      targetId: attendance._id,
      actor: req.user._id,
      actorRole: req.user.role,
      details: {
        changesCount: auditEntries.length,
        reason,
        changes: auditEntries.map((a) => ({
          student: a.student,
          from: a.previousStatus,
          to: a.newStatus,
        })),
      },
    });
  }

  return res.status(200).json({
    success: true,
    message: "Attendance updated successfully.",
    attendance,
    changesRecorded: auditEntries.length,
  });
});

/**
 * @desc    Get attendance by batch and date
 * @route   GET /api/attendence?batch=&date=
 * @access  Teacher / Admin / Staff / Student / Parent
 */
const getAttendance = asyncHandler(async (req, res) => {
  const { batch, date, session } = req.query;

  const query = {
    academyId: req.academy._id,
    isDeleted: false,
  };

  if (session) {
    query.session = session;
  } else if (batch && date) {
    const attendanceDate = normalizeDate(date);
    query.batch = batch;
    query.date = attendanceDate;
  } else {
    return res.status(400).json({
      success: false,
      message: "Either session or both batch and date are required.",
    });
  }

  const attendance = await Attendance.findOne(query)
    .populate("batch", "name schedule")
    .populate("session")
    .populate("records.student", "fullName email phone profileImage")
    .populate("markedBy", "fullName email");

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance not found.",
    });
  }

  return res.status(200).json({
    success: true,
    attendance,
  });
});

/**
 * @desc    Get batch attendance history
 * @route   GET /api/attendence/batch/:batchId
 * @access  Teacher / Admin / Staff
 */
const getBatchAttendanceHistory = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const batchDoc = await Batch.findOne({
    _id: batchId,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!batchDoc) {
    return res.status(400).json({
      success: false,
      message: "Batch not found in this academy.",
    });
  }

  const attendance = await Attendance.find({
    academyId: req.academy._id,
    batch: batchId,
    isDeleted: false,
  })
    .populate("session", "title startTime endTime status")
    .populate("markedBy", "fullName")
    .sort({ date: -1 });

  return res.status(200).json({
    success: true,
    total: attendance.length,
    attendance,
  });
});

/**
 * @desc    Get student attendance report with percentage
 * @route   GET /api/attendence/student/:studentId
 * @access  Teacher / Admin / Staff / Student / Parent
 */
const getStudentAttendance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  // Student role guard: student can only view their own attendance
  if (req.user.role === "student" && String(req.user._id) !== String(studentId)) {
    return res.status(403).json({
      success: false,
      message: "Access forbidden: You can only view your own attendance records.",
    });
  }

  const studentDoc = await Student.findOne({
    $or: [{ user: studentId }, { _id: studentId }],
    academyId: req.academy._id,
    isDeleted: false,
  });

  const studentExists = await User.findOne({
    $or: [{ _id: studentId }, { _id: studentDoc?.user }],
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!studentExists && !studentDoc) {
    return res.status(400).json({
      success: false,
      message: "Student not found in this academy.",
    });
  }

  const matchedIds = [
    studentId,
    studentDoc?._id,
    studentDoc?.user,
    studentExists?._id,
  ].filter(Boolean);

  const attendance = await Attendance.find({
    "records.student": { $in: matchedIds },
    academyId: req.academy._id,
    isDeleted: false,
  })
    .populate("batch", "name")
    .populate("session", "title startTime endTime isExtraSession isMakeUp status")
    .sort({ date: -1 });

  const report = attendance.map((item) => {
    const studentRecord = item.records.find((record) =>
      matchedIds.some((id) => String(id) === String(record.student))
    );

    return {
      attendanceId: item._id,
      batch: item.batch,
      batchName: item.batch?.name || "Classroom Session",
      session: item.session,
      date: item.date,
      status: studentRecord?.status || null,
      remarks: studentRecord?.remarks || "",
    };
  });

  const totalClasses = report.length;
  const present = report.filter((item) => item.status === "present").length;
  const leave = report.filter((item) => item.status === "leave").length;
  const absent = report.filter((item) => item.status === "absent").length;

  // Attendance rate: approved leave does not penalize the student denominator
  const effectiveClasses = totalClasses - leave;
  const attendancePercentage =
    effectiveClasses > 0
      ? Number(((present / effectiveClasses) * 100).toFixed(2))
      : totalClasses > 0
      ? Number(((present / totalClasses) * 100).toFixed(2))
      : 0;

  return res.status(200).json({
    success: true,
    summary: {
      totalClasses,
      present,
      leave,
      absent,
      attendancePercentage,
    },
    report,
  });
});

/**
 * @desc    Delete attendance (soft-delete)
 * @route   DELETE /api/attendence/:attendanceId
 * @access  Admin / Authorized Staff
 */
const deleteAttendance = asyncHandler(async (req, res) => {
  const { attendanceId } = req.params;

  const attendance = await Attendance.findOneAndUpdate(
    {
      _id: attendanceId,
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
    }
  );

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance not found.",
    });
  }

  // If linked to a session, reset the session's attendanceMarked flag
  if (attendance.session) {
    await ClassSession.findByIdAndUpdate(attendance.session, {
      attendanceMarked: false,
      attendance: null,
      status: "scheduled",
    });
  }

  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "DELETE_ATTENDANCE",
    targetType: "Attendance",
    targetId: attendance._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: { batch: attendance.batch, date: attendance.date },
  });

  return res.status(200).json({
    success: true,
    message: "Attendance deleted successfully.",
  });
});

/**
 * @desc    Get attendance dashboard stats
 * @route   GET /api/attendence/:batchId/dashboard
 * @access  Teacher / Admin / Staff
 */
const getAttendanceDashboard = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const batchDoc = await Batch.findOne({
    _id: batchId,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!batchDoc) {
    return res.status(400).json({
      success: false,
      message: "Batch not found in this academy.",
    });
  }

  const attendance = await Attendance.find({
    academyId: req.academy._id,
    batch: batchId,
    isDeleted: false,
  })
    .populate("markedBy", "fullName")
    .sort({ date: -1 });

  let totalClasses = attendance.length;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  const attendanceHistory = [];
  let recentAbsentees = [];

  attendance.forEach((item) => {
    const presentCount = item.records.filter((r) => r.status === "present").length;
    const absentCount = item.records.filter((r) => r.status === "absent").length;
    const leaveCount = item.records.filter((r) => r.status === "leave").length;

    const percentage =
      item.records.length === 0
        ? 0
        : Math.round((presentCount / item.records.length) * 100);

    totalPresent += presentCount;
    totalAbsent += absentCount;
    totalLeave += leaveCount;

    attendanceHistory.push({
      _id: item._id,
      date: item.date,
      presentCount,
      absentCount,
      leaveCount,
      percentage,
      markedBy: item.markedBy,
    });

    item.records.forEach((record) => {
      if (record.status === "absent") {
        recentAbsentees.push({
          student: record.student,
          date: item.date,
        });
      }
    });
  });

  recentAbsentees = recentAbsentees.slice(0, 5);

  const averageAttendance =
    totalClasses === 0
      ? 0
      : Math.round((totalPresent / (totalPresent + totalAbsent || 1)) * 100);

  const today = normalizeDate(new Date());

  const todayAttendance = attendance.find((item) => {
    const d = normalizeDate(item.date);
    return d && d.getTime() === today.getTime();
  });

  const todayPresent = todayAttendance
    ? todayAttendance.records.filter((r) => r.status === "present").length
    : 0;

  const todayAbsent = todayAttendance
    ? todayAttendance.records.filter((r) => r.status === "absent").length
    : 0;

  return res.status(200).json({
    success: true,
    stats: {
      totalClasses,
      averageAttendance,
      todayPresent,
      todayAbsent,
      totalPresent,
      totalAbsent,
      totalLeave,
    },
    insights: {
      highestAttendance:
        attendanceHistory.length > 0
          ? attendanceHistory.reduce((a, b) => (a.percentage > b.percentage ? a : b))
          : null,
      lowestAttendance:
        attendanceHistory.length > 0
          ? attendanceHistory.reduce((a, b) => (a.percentage < b.percentage ? a : b))
          : null,
      lastUpdated: attendance.length > 0 ? attendance[0].updatedAt : null,
    },
    attendanceHistory,
    recentAbsentees,
  });
});

/**
 * @desc    Get attendance by ID
 * @route   GET /api/attendence/:attendanceId/ById
 * @access  Teacher / Admin / Staff
 */
const getAttendanceById = asyncHandler(async (req, res) => {
  const { attendanceId } = req.params;

  if (!attendanceId || !mongoose.isValidObjectId(attendanceId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing attendance ID.",
    });
  }

  const attendance = await Attendance.findOne({
    _id: attendanceId,
    academyId: req.academy._id,
    isDeleted: false,
  })
    .populate("batch", "name")
    .populate("session")
    .populate("records.student", "fullName email phone profileImage")
    .populate("markedBy", "fullName email");

  if (!attendance) {
    return res.status(404).json({
      success: false,
      message: "Attendance not found.",
    });
  }

  const totalStudents = attendance.records.length;
  const present = attendance.records.filter((r) => r.status === "present").length;
  const absent = attendance.records.filter((r) => r.status === "absent").length;
  const leave = attendance.records.filter((r) => r.status === "leave").length;

  const percentage =
    totalStudents === 0 ? 0 : Number(((present / totalStudents) * 100).toFixed(2));

  return res.status(200).json({
    success: true,
    attendance: {
      _id: attendance._id,
      batch: attendance.batch,
      session: attendance.session,
      date: attendance.date,
      markedBy: attendance.markedBy,
      createdAt: attendance.createdAt,
      updatedAt: attendance.updatedAt,
      stats: {
        totalStudents,
        present,
        absent,
        leave,
        percentage,
      },
      records: attendance.records,
      auditHistory: attendance.auditHistory,
    },
  });
});

/**
 * @desc    Comprehensive attendance report across academy
 * @route   GET /api/attendence/reports/summary
 * @access  Admin / Staff
 */
const getAttendanceReports = asyncHandler(async (req, res) => {
  const { startDate, endDate, batchId } = req.query;

  const query = {
    academyId: req.academy._id,
    isDeleted: false,
  };

  if (batchId) query.batch = batchId;
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = normalizeDate(startDate);
    if (endDate) query.date.$lte = normalizeDate(endDate);
  }

  const [attendances, totalSessions, cancelledSessions, pendingSessions, makeUpDue] =
    await Promise.all([
      Attendance.find(query).populate("batch", "name").sort({ date: -1 }),
      ClassSession.countDocuments({ academyId: req.academy._id, isDeleted: false }),
      ClassSession.countDocuments({
        academyId: req.academy._id,
        status: "cancelled",
        isDeleted: false,
      }),
      ClassSession.countDocuments({
        academyId: req.academy._id,
        date: { $lte: normalizeDate(new Date()) },
        attendanceMarked: false,
        status: { $nin: ["cancelled", "rescheduled"] },
        isDeleted: false,
      }),
      ClassSession.countDocuments({
        academyId: req.academy._id,
        makeUpRequired: true,
        makeUpStatus: "pending",
        isDeleted: false,
      }),
    ]);

  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;

  attendances.forEach((att) => {
    att.records.forEach((r) => {
      if (r.status === "present") totalPresent++;
      else if (r.status === "absent") totalAbsent++;
      else if (r.status === "leave") totalLeave++;
    });
  });

  const totalRecords = totalPresent + totalAbsent + totalLeave;
  const overallRate =
    totalPresent + totalAbsent > 0
      ? Number(((totalPresent / (totalPresent + totalAbsent)) * 100).toFixed(2))
      : 0;

  return res.status(200).json({
    success: true,
    metrics: {
      totalRollCallsMarked: attendances.length,
      totalSessions,
      cancelledSessions,
      pendingSessions,
      makeUpDue,
      totalPresent,
      totalAbsent,
      totalLeave,
      totalRecords,
      overallRate,
    },
    attendances: attendances.slice(0, 100),
  });
});

/**
 * @desc    Get attendance audit history
 * @route   GET /api/attendence/audit-logs
 * @access  Admin / Staff
 */
const getAttendanceAuditLogs = asyncHandler(async (req, res) => {
  const { action, limit = 50 } = req.query;

  const query = {
    academyId: req.academy._id,
  };

  if (action) query.action = action;

  const logs = await AttendanceAuditLog.find(query)
    .populate("actor", "fullName email role")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10) || 50);

  return res.status(200).json({
    success: true,
    count: logs.length,
    logs,
  });
});

module.exports = {
  markAttendance,
  updateAttendance,
  getAttendance,
  getBatchAttendanceHistory,
  getStudentAttendance,
  deleteAttendance,
  getAttendanceDashboard,
  getAttendanceById,
  getAttendanceReports,
  getAttendanceAuditLogs,
};
