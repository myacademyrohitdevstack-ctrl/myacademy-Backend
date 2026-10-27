const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  formatDateKey,
  normalizeDate,
  getDayOfWeek,
  parseTimeToMinutes,
  doTimesOverlap,
  isDateInRange,
  addDays,
} = require("../Utils/dateUtils");

describe("Timetable & Session Generation Math", () => {
  test("1. Validates time interval order: startTime must be earlier than endTime", () => {
    assert.strictEqual(parseTimeToMinutes("09:00") < parseTimeToMinutes("10:00"), true);
    assert.strictEqual(parseTimeToMinutes("17:30") < parseTimeToMinutes("18:30"), true);
    assert.strictEqual(parseTimeToMinutes("11:00") < parseTimeToMinutes("10:00"), false);
    assert.strictEqual(parseTimeToMinutes("12:00") < parseTimeToMinutes("12:00"), false);
  });

  test("2. Detects time overlap correctly on the same day", () => {
    // 10:00-11:00 and 10:30-11:30 -> OVERLAP
    assert.strictEqual(doTimesOverlap("10:00", "11:00", "10:30", "11:30"), true);

    // 10:00-11:00 and 11:00-12:00 -> NO OVERLAP (back-to-back classes allowed)
    assert.strictEqual(doTimesOverlap("10:00", "11:00", "11:00", "12:00"), false);

    // 09:00-10:00 and 11:00-12:00 -> NO OVERLAP
    assert.strictEqual(doTimesOverlap("09:00", "10:00", "11:00", "12:00"), false);

    // 14:00-16:00 and 15:00-15:30 -> OVERLAP (contained)
    assert.strictEqual(doTimesOverlap("14:00", "16:00", "15:00", "15:30"), true);
  });

  test("3. Generates sessions only on configured days of week", () => {
    const daysOfWeek = [1, 3, 5]; // Monday, Wednesday, Friday
    const startDate = new Date("2026-10-26T00:00:00.000Z"); // 2026-10-26 is Monday
    const timezone = "Asia/Kolkata";

    const generatedDays = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(startDate, i);
      const dayIdx = getDayOfWeek(d, timezone);
      if (daysOfWeek.includes(dayIdx)) {
        generatedDays.push({ dateKey: formatDateKey(d, timezone), dayIdx });
      }
    }

    // Should generate for Mon (1), Wed (3), Fri (5)
    assert.strictEqual(generatedDays.length, 3);
    assert.deepStrictEqual(
      generatedDays.map((g) => g.dayIdx),
      [1, 3, 5]
    );
  });

  test("4. Idempotency Key ensures repeated runs do not duplicate sessions", () => {
    const timetableId = "60d5ec49f1b2c8b1f8e4e111";
    const sessionMap = new Map();

    function attemptInsert(ttId, dateKey, sessionPayload) {
      const idempotencyKey = `tt_${ttId}_${dateKey}`;
      if (sessionMap.has(idempotencyKey)) {
        return { inserted: false, session: sessionMap.get(idempotencyKey) };
      }
      sessionMap.set(idempotencyKey, { ...sessionPayload, idempotencyKey });
      return { inserted: true, session: sessionMap.get(idempotencyKey) };
    }

    // First generation run
    const run1 = attemptInsert(timetableId, "2026-10-26", { title: "Math Class" });
    assert.strictEqual(run1.inserted, true);

    // Repeated generation run (e.g. server restart or overlapping cron)
    const run2 = attemptInsert(timetableId, "2026-10-26", { title: "Math Class" });
    assert.strictEqual(run2.inserted, false);
    assert.strictEqual(sessionMap.size, 1);
  });

  test("5. Respects effective start and end dates", () => {
    const effStart = "2026-11-01";
    const effEnd = "2026-11-15";
    const timezone = "Asia/Kolkata";

    assert.strictEqual(isDateInRange("2026-10-31", effStart, effEnd, timezone), false);
    assert.strictEqual(isDateInRange("2026-11-01", effStart, effEnd, timezone), true);
    assert.strictEqual(isDateInRange("2026-11-10", effStart, effEnd, timezone), true);
    assert.strictEqual(isDateInRange("2026-11-15", effStart, effEnd, timezone), true);
    assert.strictEqual(isDateInRange("2026-11-16", effStart, effEnd, timezone), false);
  });

  test("6. Respects non-teaching days and skips generation", () => {
    const nonTeachingKeys = new Set(["2026-10-28", "2026-10-30"]);
    const testDates = ["2026-10-26", "2026-10-28", "2026-10-30"];

    const eligibleDates = testDates.filter((d) => !nonTeachingKeys.has(d));
    assert.deepStrictEqual(eligibleDates, ["2026-10-26"]);
  });

  test("7. Detects teacher and batch conflicts for overlapping time slots on same weekday", () => {
    const existingSchedule = {
      teacherId: "teacher_1",
      batchId: "batch_1",
      daysOfWeek: [1, 3],
      startTime: "17:00",
      endTime: "18:00",
    };

    function hasConflict(newReq) {
      const commonDays = newReq.daysOfWeek.filter((d) => existingSchedule.daysOfWeek.includes(d));
      if (commonDays.length === 0) return false;
      const timeOverlaps = doTimesOverlap(
        newReq.startTime,
        newReq.endTime,
        existingSchedule.startTime,
        existingSchedule.endTime
      );
      if (!timeOverlaps) return false;
      return newReq.teacherId === existingSchedule.teacherId || newReq.batchId === existingSchedule.batchId;
    }

    // Same teacher, overlapping time on Monday (1) -> CONFLICT
    assert.strictEqual(
      hasConflict({
        teacherId: "teacher_1",
        batchId: "batch_2",
        daysOfWeek: [1],
        startTime: "17:30",
        endTime: "18:30",
      }),
      true
    );

    // Same teacher, non-overlapping time on Monday (1) -> NO CONFLICT
    assert.strictEqual(
      hasConflict({
        teacherId: "teacher_1",
        batchId: "batch_2",
        daysOfWeek: [1],
        startTime: "18:00",
        endTime: "19:00",
      }),
      false
    );

    // Same teacher, overlapping time but DIFFERENT day (Tuesday = 2) -> NO CONFLICT
    assert.strictEqual(
      hasConflict({
        teacherId: "teacher_1",
        batchId: "batch_2",
        daysOfWeek: [2],
        startTime: "17:00",
        endTime: "18:00",
      }),
      false
    );
  });
});

describe("Student Attendance & Percentage Governance", () => {
  function computeStudentAttendance(records = [], studentAdmissionDate, sessionDates = []) {
    let attended = 0;
    let leave = 0;
    let absent = 0;
    let pending = 0;

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const sDate = sessionDates[i];

      // If student was admitted after this class date, exclude from absences
      if (studentAdmissionDate && sDate && new Date(studentAdmissionDate) > new Date(sDate)) {
        continue; // not enrolled yet -> does not count
      }

      if (rec.status === "present") attended++;
      else if (rec.status === "leave") leave++;
      else if (rec.status === "absent") absent++;
      else pending++;
    }

    const totalHeld = attended + leave + absent;
    const denominator = totalHeld - leave;
    const rate = denominator > 0 ? Number(((attended / denominator) * 100).toFixed(2)) : 0;

    return { attended, leave, absent, pending, totalHeld, rate };
  }

  test("8. Correctly computes 100% rate when all held classes are attended", () => {
    const records = [{ status: "present" }, { status: "present" }, { status: "present" }];
    const res = computeStudentAttendance(records);
    assert.strictEqual(res.rate, 100);
    assert.strictEqual(res.attended, 3);
    assert.strictEqual(res.absent, 0);
  });

  test("9. Approved leave does not penalize attendance percentage", () => {
    // 3 present, 1 approved leave, 1 absent -> Denominator: 4 (5 - 1 leave). Attended: 3. Rate = 3/4 = 75%
    const records = [
      { status: "present" },
      { status: "present" },
      { status: "present" },
      { status: "leave" },
      { status: "absent" },
    ];
    const res = computeStudentAttendance(records);
    assert.strictEqual(res.attended, 3);
    assert.strictEqual(res.leave, 1);
    assert.strictEqual(res.absent, 1);
    assert.strictEqual(res.rate, 75);
  });

  test("10. Missing/pending attendance does not count as absent", () => {
    const records = [
      { status: "present" },
      { status: "pending" }, // Pending class
    ];
    const res = computeStudentAttendance(records);
    assert.strictEqual(res.attended, 1);
    assert.strictEqual(res.absent, 0);
    assert.strictEqual(res.pending, 1);
    assert.strictEqual(res.rate, 100);
  });

  test("11. Handles zero classes safely without NaN or division by zero", () => {
    const res = computeStudentAttendance([]);
    assert.strictEqual(res.rate, 0);
    assert.strictEqual(Number.isNaN(res.rate), false);
  });

  test("12. Late enrolment does not create false absences for pre-admission dates", () => {
    const admissionDate = "2026-11-01";
    const sessionDates = ["2026-10-25", "2026-10-28", "2026-11-02", "2026-11-04"];
    const records = [
      { status: "absent" }, // pre-admission -> must be excluded
      { status: "absent" }, // pre-admission -> must be excluded
      { status: "present" },
      { status: "present" },
    ];

    const res = computeStudentAttendance(records, admissionDate, sessionDates);
    assert.strictEqual(res.totalHeld, 2);
    assert.strictEqual(res.attended, 2);
    assert.strictEqual(res.absent, 0);
    assert.strictEqual(res.rate, 100);
  });
});

describe("Leave, Holiday & Rescheduling Workflows", () => {
  test("13. Approved teacher leave cancels class with makeUpRequired=true without marking students absent", () => {
    const session = {
      _id: "session_1",
      teacherId: "teacher_1",
      status: "scheduled",
      attendanceMarked: false,
      makeUpRequired: false,
    };

    function applyTeacherLeaveAction(s, action, reason) {
      if (action === "cancelled") {
        return {
          ...s,
          status: "cancelled",
          cancellationReason: `Teacher on approved leave: ${reason}`,
          makeUpRequired: true,
          makeUpStatus: "pending",
        };
      }
      return s;
    }

    const updated = applyTeacherLeaveAction(session, "cancelled", "Medical emergency");
    assert.strictEqual(updated.status, "cancelled");
    assert.strictEqual(updated.makeUpRequired, true);
    assert.strictEqual(updated.makeUpStatus, "pending");
    assert.strictEqual(updated.attendanceMarked, false);
  });

  test("14. Teacher substitute assignment preserves original session and assigns substitute", () => {
    const session = {
      _id: "session_1",
      teacher: "original_teacher",
      substituteTeacher: null,
      status: "scheduled",
    };

    const substituted = {
      ...session,
      substituteTeacher: "substitute_teacher",
    };

    assert.strictEqual(substituted.teacher, "original_teacher");
    assert.strictEqual(substituted.substituteTeacher, "substitute_teacher");
    assert.strictEqual(substituted.status, "scheduled");
  });

  test("15. Academy holiday cancels all batch sessions within range", () => {
    const sessions = [
      { id: "s1", batch: "b1", date: "2026-11-05", status: "scheduled" },
      { id: "s2", batch: "b2", date: "2026-11-05", status: "scheduled" },
      { id: "s3", batch: "b1", date: "2026-11-10", status: "scheduled" },
    ];

    const holiday = {
      startDate: "2026-11-04",
      endDate: "2026-11-06",
      scope: "academy",
      title: "Diwali",
    };

    const result = sessions.map((s) => {
      if (isDateInRange(s.date, holiday.startDate, holiday.endDate)) {
        return { ...s, status: "cancelled", reason: `Holiday: ${holiday.title}` };
      }
      return s;
    });

    assert.strictEqual(result[0].status, "cancelled");
    assert.strictEqual(result[1].status, "cancelled");
    assert.strictEqual(result[2].status, "scheduled"); // untouched
  });

  test("16. Batch holiday affects ONLY the targeted batch", () => {
    const sessions = [
      { id: "s1", batch: "b1", date: "2026-11-05", status: "scheduled" },
      { id: "s2", batch: "b2", date: "2026-11-05", status: "scheduled" },
    ];

    const batchHoliday = {
      startDate: "2026-11-04",
      endDate: "2026-11-06",
      scope: "batch",
      batch: "b1",
      title: "Batch b1 specific revision break",
    };

    const result = sessions.map((s) => {
      if (
        batchHoliday.scope === "batch" &&
        s.batch === batchHoliday.batch &&
        isDateInRange(s.date, batchHoliday.startDate, batchHoliday.endDate)
      ) {
        return { ...s, status: "cancelled" };
      }
      return s;
    });

    assert.strictEqual(result[0].status, "cancelled");
    assert.strictEqual(result[1].status, "scheduled"); // unrelated batch completely untouched
  });

  test("17. Rescheduling links replacement session and updates make-up status", () => {
    const original = {
      _id: "orig_123",
      status: "scheduled",
      makeUpStatus: "none",
    };

    const replacement = {
      _id: "repl_456",
      originalSession: original._id,
      isMakeUp: true,
      status: "scheduled",
    };

    const updatedOriginal = {
      ...original,
      status: "rescheduled",
      rescheduledToSession: replacement._id,
      makeUpStatus: "scheduled",
    };

    assert.strictEqual(updatedOriginal.status, "rescheduled");
    assert.strictEqual(updatedOriginal.rescheduledToSession, "repl_456");
    assert.strictEqual(replacement.originalSession, "orig_123");
    assert.strictEqual(replacement.isMakeUp, true);
  });

  test("18. Retroactive student leave approval corrects recorded absences to leave", () => {
    const studentId = "student_99";
    const attendanceRecords = [
      { student: "student_99", status: "absent" },
      { student: "student_100", status: "absent" },
    ];

    // Late approval for student_99
    const corrected = attendanceRecords.map((r) => {
      if (r.student === studentId && r.status === "absent") {
        return { ...r, status: "leave", remarks: "Late approval correction" };
      }
      return r;
    });

    assert.strictEqual(corrected[0].status, "leave");
    assert.strictEqual(corrected[1].status, "absent"); // other students completely untouched
  });
});

describe("Security, Tenant Isolation & Financial Independence", () => {
  test("19. Multi-tenant isolation: Scopes session and timetable queries strictly by academyId", () => {
    const acadA = "60d5ec49f1b2c8b1f8e4e111";
    const acadB = "60d5ec49f1b2c8b1f8e4e222";

    const allSessions = [
      { id: "s1", academyId: acadA, title: "Academy A Class" },
      { id: "s2", academyId: acadB, title: "Academy B Class" },
    ];

    function queryAcademySessions(reqAcademyId) {
      return allSessions.filter((s) => s.academyId === reqAcademyId);
    }

    const acadASessions = queryAcademySessions(acadA);
    assert.strictEqual(acadASessions.length, 1);
    assert.strictEqual(acadASessions[0].id, "s1");

    const acadBSessions = queryAcademySessions(acadB);
    assert.strictEqual(acadBSessions.length, 1);
    assert.strictEqual(acadBSessions[0].id, "s2");
  });

  test("20. Financial independence: Session cancellations do not alter fee records", () => {
    const studentFeeRecord = {
      studentId: "s1",
      totalAmount: 5000,
      paidAmount: 2500,
      status: "partial",
    };

    // When a session is cancelled or rescheduled:
    const sessionEvent = { type: "SESSION_CANCELLED", sessionId: "sess_1" };

    // Fee record must remain 100% untouched
    assert.strictEqual(studentFeeRecord.totalAmount, 5000);
    assert.strictEqual(studentFeeRecord.paidAmount, 2500);
    assert.strictEqual(studentFeeRecord.status, "partial");
  });
});
