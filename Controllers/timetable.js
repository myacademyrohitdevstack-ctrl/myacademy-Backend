const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const Timetable = require("../Modals/Timetable");
const Batch = require("../Modals/Batches");
const User = require("../Modals/User");
const ClassSession = require("../Modals/ClassSession");
const AttendanceAuditLog = require("../Modals/AttendanceAuditLog");
const {
  checkSchedulingConflict,
  generateSessionsForTimetable,
} = require("../Utils/sessionGenerator");
const {
  DEFAULT_TIMEZONE,
  normalizeDate,
  parseTimeToMinutes,
  DAY_NAME_TO_INDEX,
} = require("../Utils/dateUtils");

/**
 * Normalizes day representations to [0..6] indices.
 */
function normalizeDaysOfWeek(daysInput = []) {
  const result = new Set();
  for (const item of daysInput) {
    if (typeof item === "number" && item >= 0 && item <= 6) {
      result.add(item);
    } else if (typeof item === "string") {
      const idx = DAY_NAME_TO_INDEX[item.toLowerCase().trim()];
      if (idx !== undefined) {
        result.add(idx);
      }
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

/**
 * @desc    Create a recurring timetable
 * @route   POST /api/timetables
 * @access  Admin / Authorized Staff
 */
const createTimetable = asyncHandler(async (req, res) => {
  const {
    batch,
    teacher,
    daysOfWeek: rawDays,
    days,
    startTime,
    endTime,
    effectiveStartDate,
    effectiveEndDate,
    timezone = DEFAULT_TIMEZONE,
    room = "",
    meetingPlatform = "offline",
    meetingLink = "",
    nonTeachingDays = [],
  } = req.body;

  if (!batch || !teacher || !startTime || !endTime || !effectiveStartDate) {
    return res.status(400).json({
      success: false,
      message: "Batch, teacher, startTime, endTime, and effectiveStartDate are required.",
    });
  }

  // Validate start and end time
  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);
  if (startMins >= endMins) {
    return res.status(400).json({
      success: false,
      message: "startTime must be earlier than endTime.",
    });
  }

  // Validate dates
  const startDate = normalizeDate(effectiveStartDate, timezone);
  const endDate = effectiveEndDate ? normalizeDate(effectiveEndDate, timezone) : null;
  if (endDate && startDate > endDate) {
    return res.status(400).json({
      success: false,
      message: "effectiveStartDate cannot be after effectiveEndDate.",
    });
  }

  // Validate batch in this academy
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

  // Validate teacher in this academy
  const teacherDoc = await User.findOne({
    _id: teacher,
    academyId: req.academy._id,
    role: "teacher",
    isDeleted: false,
  });
  if (!teacherDoc) {
    return res.status(404).json({
      success: false,
      message: "Teacher not found or is not registered as a teacher in this academy.",
    });
  }

  const daysOfWeek = normalizeDaysOfWeek(rawDays || days || []);
  if (daysOfWeek.length === 0) {
    return res.status(400).json({
      success: false,
      message: "At least one valid day of the week must be selected.",
    });
  }

  // Check conflicts
  const conflictCheck = await checkSchedulingConflict({
    academyId: req.academy._id,
    batchId: batch,
    teacherId: teacher,
    daysOfWeek,
    startTime,
    endTime,
    startDate,
    endDate,
  });

  if (conflictCheck.hasConflict) {
    return res.status(409).json({
      success: false,
      message: "Scheduling conflict detected.",
      conflicts: conflictCheck.conflicts,
    });
  }

  // Create Timetable
  const timetable = await Timetable.create({
    academyId: req.academy._id,
    batch,
    teacher,
    daysOfWeek,
    days: (days || []).map((d) => String(d).toLowerCase().trim()),
    startTime,
    endTime,
    effectiveStartDate: startDate,
    effectiveEndDate: endDate,
    timezone,
    room,
    meetingPlatform,
    meetingLink,
    nonTeachingDays: (nonTeachingDays || []).map((d) => normalizeDate(d, timezone)),
    isActive: true,
    createdBy: req.user._id,
  });

  // Automatically generate rolling scheduled sessions (30 days ahead)
  const genResult = await generateSessionsForTimetable(timetable._id, 30);

  // Audit log
  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "CREATE_TIMETABLE",
    targetType: "Timetable",
    targetId: timetable._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      batch,
      teacher,
      daysOfWeek,
      startTime,
      endTime,
      sessionsCreated: genResult.createdCount,
    },
  });

  const populated = await Timetable.findById(timetable._id)
    .populate("batch", "name")
    .populate("teacher", "fullName email");

  return res.status(201).json({
    success: true,
    message: `Timetable created successfully. Generated ${genResult.createdCount} sessions automatically.`,
    timetable: populated,
    sessionsCreated: genResult.createdCount,
  });
});

/**
 * @desc    Get all timetables for an academy
 * @route   GET /api/timetables
 * @access  Admin / Teacher / Staff
 */
const getTimetables = asyncHandler(async (req, res) => {
  const { batch, teacher, isActive } = req.query;

  const query = {
    academyId: req.academy._id,
    isDeleted: false,
  };

  if (batch) query.batch = batch;
  if (teacher) query.teacher = teacher;
  if (isActive !== undefined) query.isActive = isActive === "true";

  // If teacher role, only return timetables assigned to this teacher
  if (req.user.role === "teacher") {
    query.teacher = req.user._id;
  }

  const timetables = await Timetable.find(query)
    .populate("batch", "name schedule")
    .populate("teacher", "fullName email")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: timetables.length,
    timetables,
  });
});

/**
 * @desc    Get timetable by ID
 * @route   GET /api/timetables/:id
 * @access  Admin / Teacher / Staff
 */
const getTimetableById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const timetable = await Timetable.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  })
    .populate("batch")
    .populate("teacher", "fullName email phone");

  if (!timetable) {
    return res.status(404).json({
      success: false,
      message: "Timetable not found.",
    });
  }

  // Teacher role guard
  if (
    req.user.role === "teacher" &&
    String(timetable.teacher._id) !== String(req.user._id)
  ) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to view this timetable.",
    });
  }

  return res.status(200).json({
    success: true,
    timetable,
  });
});

/**
 * @desc    Update a timetable
 * @route   PUT /api/timetables/:id
 * @access  Admin / Authorized Staff
 */
const updateTimetable = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    teacher,
    daysOfWeek: rawDays,
    days,
    startTime,
    endTime,
    effectiveStartDate,
    effectiveEndDate,
    room,
    meetingPlatform,
    meetingLink,
    nonTeachingDays,
    applyMode = "future_only", // "future_only" | "from_effective_date" | "cancel_future"
  } = req.body;

  const timetable = await Timetable.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!timetable) {
    return res.status(404).json({
      success: false,
      message: "Timetable not found.",
    });
  }

  const newTeacher = teacher || timetable.teacher;
  const newStartTime = startTime || timetable.startTime;
  const newEndTime = endTime || timetable.endTime;
  const newDaysOfWeek = rawDays || days
    ? normalizeDaysOfWeek(rawDays || days)
    : timetable.daysOfWeek;

  // Validate time
  if (parseTimeToMinutes(newStartTime) >= parseTimeToMinutes(newEndTime)) {
    return res.status(400).json({
      success: false,
      message: "startTime must be earlier than endTime.",
    });
  }

  // Check conflicts
  const conflictCheck = await checkSchedulingConflict({
    academyId: req.academy._id,
    batchId: timetable.batch,
    teacherId: newTeacher,
    daysOfWeek: newDaysOfWeek,
    startTime: newStartTime,
    endTime: newEndTime,
    startDate: effectiveStartDate || timetable.effectiveStartDate,
    endDate: effectiveEndDate || timetable.effectiveEndDate,
    excludeTimetableId: timetable._id,
  });

  if (conflictCheck.hasConflict) {
    return res.status(409).json({
      success: false,
      message: "Scheduling conflict detected with updated parameters.",
      conflicts: conflictCheck.conflicts,
    });
  }

  // Update properties
  timetable.teacher = newTeacher;
  timetable.startTime = newStartTime;
  timetable.endTime = newEndTime;
  timetable.daysOfWeek = newDaysOfWeek;
  if (days) timetable.days = days.map((d) => String(d).toLowerCase().trim());
  if (effectiveStartDate) timetable.effectiveStartDate = normalizeDate(effectiveStartDate);
  if (effectiveEndDate !== undefined) {
    timetable.effectiveEndDate = effectiveEndDate ? normalizeDate(effectiveEndDate) : null;
  }
  if (room !== undefined) timetable.room = room;
  if (meetingPlatform !== undefined) timetable.meetingPlatform = meetingPlatform;
  if (meetingLink !== undefined) timetable.meetingLink = meetingLink;
  if (nonTeachingDays) {
    timetable.nonTeachingDays = nonTeachingDays.map((d) => normalizeDate(d));
  }

  await timetable.save();

  // Handle future sessions safely: Historical sessions with attendance marked or past date are NEVER touched!
  const today = normalizeDate(new Date(), timetable.timezone || DEFAULT_TIMEZONE);

  if (applyMode === "cancel_future") {
    // Cancel unrecorded future sessions
    await ClassSession.updateMany(
      {
        timetable: timetable._id,
        date: { $gte: today },
        attendanceMarked: false,
        status: "scheduled",
        isDeleted: false,
      },
      {
        $set: {
          status: "cancelled",
          cancellationReason: "Timetable updated / future sessions cancelled by admin",
          cancelledBy: req.user._id,
          cancelledAt: new Date(),
        },
      }
    );
  } else {
    // Remove future unrecorded un-started sessions so that they can be regenerated cleanly with new timings/days
    await ClassSession.deleteMany({
      timetable: timetable._id,
      date: { $gte: today },
      attendanceMarked: false,
      status: "scheduled",
      isDeleted: false,
    });

    // Regenerate future sessions with the new parameters
    await generateSessionsForTimetable(timetable._id, 30);
  }

  // Audit log
  await AttendanceAuditLog.create({
    academyId: req.academy._id,
    action: "UPDATE_TIMETABLE",
    targetType: "Timetable",
    targetId: timetable._id,
    actor: req.user._id,
    actorRole: req.user.role,
    details: {
      applyMode,
      newTeacher,
      newStartTime,
      newEndTime,
      newDaysOfWeek,
    },
  });

  const updated = await Timetable.findById(timetable._id)
    .populate("batch", "name")
    .populate("teacher", "fullName email");

  return res.status(200).json({
    success: true,
    message: "Timetable updated successfully.",
    timetable: updated,
  });
});

/**
 * @desc    Toggle active / paused state of a timetable
 * @route   PATCH /api/timetables/:id/status
 * @access  Admin / Authorized Staff
 */
const toggleTimetableStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  const timetable = await Timetable.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!timetable) {
    return res.status(404).json({
      success: false,
      message: "Timetable not found.",
    });
  }

  timetable.isActive = isActive !== undefined ? Boolean(isActive) : !timetable.isActive;
  await timetable.save();

  // If paused, cancel future unrecorded scheduled sessions
  if (!timetable.isActive) {
    const today = normalizeDate(new Date(), timetable.timezone || DEFAULT_TIMEZONE);
    await ClassSession.updateMany(
      {
        timetable: timetable._id,
        date: { $gte: today },
        attendanceMarked: false,
        status: "scheduled",
        isDeleted: false,
      },
      {
        $set: {
          status: "cancelled",
          cancellationReason: "Timetable paused",
          cancelledBy: req.user._id,
          cancelledAt: new Date(),
        },
      }
    );
  } else {
    // If reactivated, generate sessions for next 30 days
    await generateSessionsForTimetable(timetable._id, 30);
  }

  return res.status(200).json({
    success: true,
    message: `Timetable is now ${timetable.isActive ? "Active" : "Paused"}.`,
    timetable,
  });
});

/**
 * @desc    Soft-delete a timetable
 * @route   DELETE /api/timetables/:id
 * @access  Admin / Authorized Staff
 */
const deleteTimetable = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const timetable = await Timetable.findOne({
    _id: id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!timetable) {
    return res.status(404).json({
      success: false,
      message: "Timetable not found.",
    });
  }

  timetable.isDeleted = true;
  timetable.deletedAt = new Date();
  timetable.deletedBy = req.user._id;
  timetable.isActive = false;
  await timetable.save();

  // Cancel future unrecorded sessions without modifying historical records
  const today = normalizeDate(new Date(), timetable.timezone || DEFAULT_TIMEZONE);
  await ClassSession.updateMany(
    {
      timetable: timetable._id,
      date: { $gte: today },
      attendanceMarked: false,
      status: "scheduled",
      isDeleted: false,
    },
    {
      $set: {
        status: "cancelled",
        cancellationReason: "Timetable deleted",
        cancelledBy: req.user._id,
        cancelledAt: new Date(),
      },
    }
  );

  return res.status(200).json({
    success: true,
    message: "Timetable removed and future sessions cancelled. Historical records preserved.",
  });
});

/**
 * @desc    Check conflict without saving
 * @route   POST /api/timetables/check-conflict
 * @access  Admin / Teacher / Staff
 */
const checkTimetableConflict = asyncHandler(async (req, res) => {
  const {
    batch,
    teacher,
    daysOfWeek: rawDays,
    days,
    startTime,
    endTime,
    effectiveStartDate,
    effectiveEndDate,
    excludeTimetableId,
  } = req.body;

  const daysOfWeek = normalizeDaysOfWeek(rawDays || days || []);

  const result = await checkSchedulingConflict({
    academyId: req.academy._id,
    batchId: batch,
    teacherId: teacher,
    daysOfWeek,
    startTime,
    endTime,
    startDate: effectiveStartDate ? normalizeDate(effectiveStartDate) : new Date(),
    endDate: effectiveEndDate ? normalizeDate(effectiveEndDate) : null,
    excludeTimetableId,
  });

  return res.status(200).json({
    success: true,
    hasConflict: result.hasConflict,
    conflicts: result.conflicts,
  });
});

module.exports = {
  createTimetable,
  getTimetables,
  getTimetableById,
  updateTimetable,
  toggleTimetableStatus,
  deleteTimetable,
  checkTimetableConflict,
};
