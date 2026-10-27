const mongoose = require("mongoose");
const Timetable = require("../Modals/Timetable");
const ClassSession = require("../Modals/ClassSession");
const Batch = require("../Modals/Batches");
const Academy = require("../Modals/Academy");
const Holiday = require("../Modals/Holiday");
const TeacherLeave = require("../Modals/TeacherLeave");
const {
  DEFAULT_TIMEZONE,
  formatDateKey,
  normalizeDate,
  getDayOfWeek,
  doTimesOverlap,
  isDateInRange,
  addDays,
} = require("./dateUtils");

/**
 * Checks for conflicts with existing timetables for the same teacher or batch.
 */
async function checkSchedulingConflict({
  academyId,
  batchId,
  teacherId,
  daysOfWeek = [],
  startTime,
  endTime,
  startDate,
  endDate = null,
  excludeTimetableId = null,
}) {
  const conflicts = [];

  const query = {
    academyId,
    isActive: true,
    isDeleted: false,
    $or: [{ teacher: teacherId }, { batch: batchId }],
  };

  if (excludeTimetableId) {
    query._id = { $ne: excludeTimetableId };
  }

  const existingTimetables = await Timetable.find(query)
    .populate("batch", "name")
    .populate("teacher", "fullName email");

  const startKey = formatDateKey(startDate);
  const endKey = endDate ? formatDateKey(endDate) : null;

  for (const tt of existingTimetables) {
    // 1. Date overlap check
    const ttStartKey = formatDateKey(tt.effectiveStartDate);
    const ttEndKey = tt.effectiveEndDate ? formatDateKey(tt.effectiveEndDate) : null;

    const datesOverlap =
      (!endKey || ttStartKey <= endKey) &&
      (!ttEndKey || !startKey || ttEndKey >= startKey);

    if (!datesOverlap) continue;

    // 2. Days of week overlap check
    const commonDays = daysOfWeek.filter((d) => tt.daysOfWeek.includes(d));
    if (commonDays.length === 0) continue;

    // 3. Time overlap check
    if (doTimesOverlap(startTime, endTime, tt.startTime, tt.endTime)) {
      const isTeacherConflict = String(tt.teacher?._id || tt.teacher) === String(teacherId);
      const isBatchConflict = String(tt.batch?._id || tt.batch) === String(batchId);

      if (isTeacherConflict) {
        conflicts.push(
          `Teacher conflict: ${tt.teacher?.fullName || "Teacher"} already has batch "${
            tt.batch?.name || "Batch"
          }" scheduled on overlapping days at ${tt.startTime}-${tt.endTime}.`
        );
      }
      if (isBatchConflict) {
        conflicts.push(
          `Batch conflict: Batch "${tt.batch?.name || "Batch"}" already has a class with ${
            tt.teacher?.fullName || "Teacher"
          } scheduled on overlapping days at ${tt.startTime}-${tt.endTime}.`
        );
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Generates scheduled sessions for a given timetable over a rolling window.
 */
async function generateSessionsForTimetable(timetableId, daysAhead = 30) {
  const timetable = await Timetable.findOne({
    _id: timetableId,
    isActive: true,
    isDeleted: false,
  }).populate("batch");

  if (!timetable || !timetable.batch || timetable.batch.isDeleted) {
    return { createdCount: 0, skippedCount: 0 };
  }

  const academy = await Academy.findById(timetable.academyId).select("timezone");
  const timezone = timetable.timezone || academy?.timezone || DEFAULT_TIMEZONE;

  const now = new Date();
  const startDate = normalizeDate(now, timezone);
  const endDate = addDays(startDate, daysAhead);

  // Fetch active holidays for academy and batch within the window
  const holidays = await Holiday.find({
    academyId: timetable.academyId,
    isDeleted: false,
    $or: [{ scope: "academy" }, { scope: "batch", batch: timetable.batch._id }],
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });

  // Fetch approved teacher leaves within the window
  const teacherLeaves = await TeacherLeave.find({
    academyId: timetable.academyId,
    teacher: timetable.teacher,
    status: "approved",
    isDeleted: false,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });

  const nonTeachingKeys = new Set(
    (timetable.nonTeachingDays || []).map((d) => formatDateKey(d, timezone))
  );

  let createdCount = 0;
  let skippedCount = 0;

  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateKey = formatDateKey(currentDate, timezone);
    const dayOfWeek = getDayOfWeek(currentDate, timezone);

    // Advance to next day at end of loop
    const nextDate = addDays(currentDate, 1);

    // Check if day of week matches timetable
    if (!timetable.daysOfWeek.includes(dayOfWeek)) {
      currentDate = nextDate;
      continue;
    }

    // Check effective date bounds
    const effStartKey = formatDateKey(timetable.effectiveStartDate, timezone);
    const effEndKey = timetable.effectiveEndDate
      ? formatDateKey(timetable.effectiveEndDate, timezone)
      : null;

    if (dateKey < effStartKey || (effEndKey && dateKey > effEndKey)) {
      currentDate = nextDate;
      continue;
    }

    // Check non-teaching days
    if (nonTeachingKeys.has(dateKey)) {
      currentDate = nextDate;
      continue;
    }

    // Check academy or batch holidays
    const isHoliday = holidays.some((h) =>
      isDateInRange(currentDate, h.startDate, h.endDate, timezone)
    );
    if (isHoliday) {
      // Classes do not take place on holidays -> skip generation to prevent false absences
      skippedCount++;
      currentDate = nextDate;
      continue;
    }

    // Check teacher leave
    const activeLeave = teacherLeaves.find((l) =>
      isDateInRange(currentDate, l.startDate, l.endDate, timezone)
    );

    let substituteTeacher = null;
    let initialStatus = "scheduled";
    let cancellationReason = "";

    if (activeLeave) {
      // Find if this session has a specific leave action
      const matchedAction = (activeLeave.affectedSessions || []).find((as) => {
        return as.newDate && formatDateKey(as.newDate, timezone) === dateKey;
      });

      if (matchedAction?.action === "substitute" && matchedAction.substituteTeacher) {
        substituteTeacher = matchedAction.substituteTeacher;
      } else if (matchedAction?.action === "cancelled") {
        initialStatus = "cancelled";
        cancellationReason = `Teacher on approved leave: ${activeLeave.reason}`;
      }
    }

    // Strict idempotency key
    const idempotencyKey = `tt_${timetable._id}_${dateKey}`;

    const normalizedSessionDate = normalizeDate(currentDate, timezone);

    const sessionData = {
      academyId: timetable.academyId,
      batch: timetable.batch._id,
      timetable: timetable._id,
      teacher: timetable.teacher,
      substituteTeacher,
      date: normalizedSessionDate,
      startTime: timetable.startTime,
      endTime: timetable.endTime,
      title: `${timetable.batch.name || "Class"} - Regular Session`,
      room: timetable.room || "",
      meetingPlatform: timetable.meetingPlatform || "offline",
      meetingLink: timetable.meetingLink || "",
      status: initialStatus,
      cancellationReason,
      isMakeUp: false,
      makeUpRequired: false,
      makeUpStatus: "none",
      attendanceMarked: false,
      isExtraSession: false,
      createdBy: timetable.createdBy,
    };

    try {
      const res = await ClassSession.updateOne(
        { idempotencyKey },
        { $setOnInsert: sessionData },
        { upsert: true }
      );

      if (res.upsertedCount > 0) {
        createdCount++;
      } else {
        skippedCount++;
      }
    } catch (err) {
      if (err.code === 11000) {
        // Already exists
        skippedCount++;
      } else {
        console.error(`Error generating session for key ${idempotencyKey}:`, err.message);
      }
    }

    currentDate = nextDate;
  }

  // Update lastGeneratedThrough
  timetable.lastGeneratedThrough = endDate;
  await timetable.save();

  return { createdCount, skippedCount };
}

/**
 * Generates sessions for all active timetables of an academy.
 */
async function generateSessionsForAcademy(academyId, daysAhead = 30) {
  const timetables = await Timetable.find({
    academyId,
    isActive: true,
    isDeleted: false,
  });

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const tt of timetables) {
    try {
      const res = await generateSessionsForTimetable(tt._id, daysAhead);
      totalCreated += res.createdCount;
      totalSkipped += res.skippedCount;
    } catch (err) {
      console.error(`Error generating sessions for timetable ${tt._id}:`, err.message);
    }
  }

  return { totalCreated, totalSkipped };
}

/**
 * Global background task to generate sessions across all active academies.
 */
async function generateAllAcademySessions(daysAhead = 30) {
  try {
    const academies = await Academy.find({
      status: "active",
      approvalStatus: "approved",
      isDeleted: false,
    }).select("_id");

    let grandTotalCreated = 0;

    for (const acad of academies) {
      const res = await generateSessionsForAcademy(acad._id, daysAhead);
      grandTotalCreated += res.totalCreated;
    }

    return { grandTotalCreated };
  } catch (err) {
    console.error("Global session generation error:", err.message);
    return { grandTotalCreated: 0, error: err.message };
  }
}

module.exports = {
  checkSchedulingConflict,
  generateSessionsForTimetable,
  generateSessionsForAcademy,
  generateAllAcademySessions,
};
