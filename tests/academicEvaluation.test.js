const { test, describe } = require("node:test");
const assert = require("node:assert");

describe("Academic Evaluation: Attendance Metrics & Roll Call Math", () => {
  function calculateAttendanceMetrics(records = []) {
    const totalClasses = records.length;
    let attended = 0;
    let leave = 0;
    let absent = 0;

    for (const r of records) {
      if (r.status === "present") attended++;
      else if (r.status === "leave") leave++;
      else absent++;
    }

    // Rate excludes approved leaves from penalizing denominator if configured, or standard:
    const effectiveClasses = totalClasses - leave;
    const rate = effectiveClasses > 0 ? Math.round((attended / effectiveClasses) * 100) : 0;

    return { totalClasses, attended, leave, absent, rate };
  }

  test("Calculates 100% rate for perfect attendance", () => {
    const records = [
      { status: "present" },
      { status: "present" },
      { status: "present" },
    ];
    const metrics = calculateAttendanceMetrics(records);
    assert.strictEqual(metrics.totalClasses, 3);
    assert.strictEqual(metrics.attended, 3);
    assert.strictEqual(metrics.leave, 0);
    assert.strictEqual(metrics.absent, 0);
    assert.strictEqual(metrics.rate, 100);
  });

  test("Calculates accurate percentage with absences and leaves", () => {
    // 6 total sessions: 2 present, 1 leave, 3 absent
    // Effective denominator: 6 - 1 = 5. Attended = 2. Rate = 2/5 = 40%
    const records = [
      { status: "present" },
      { status: "present" },
      { status: "leave" },
      { status: "absent" },
      { status: "absent" },
      { status: "absent" },
    ];
    const metrics = calculateAttendanceMetrics(records);
    assert.strictEqual(metrics.totalClasses, 6);
    assert.strictEqual(metrics.attended, 2);
    assert.strictEqual(metrics.leave, 1);
    assert.strictEqual(metrics.absent, 3);
    assert.strictEqual(metrics.rate, 40);
  });

  test("Handles zero classes gracefully without division by zero or NaN", () => {
    const metrics = calculateAttendanceMetrics([]);
    assert.strictEqual(metrics.totalClasses, 0);
    assert.strictEqual(metrics.attended, 0);
    assert.strictEqual(metrics.rate, 0);
    assert.strictEqual(Number.isNaN(metrics.rate), false);
  });
});

describe("Academic Evaluation: Exam Marks, Boundaries & Pass/Fail", () => {
  function evaluateExamResult({ marksObtained, totalMarks, passingMarks }) {
    if (marksObtained < 0 || marksObtained > totalMarks) {
      throw new Error(`Marks obtained (${marksObtained}) must be between 0 and total marks (${totalMarks}).`);
    }
    const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 1000) / 10 : 0;
    const isPassed = marksObtained >= passingMarks;
    return { marksObtained, totalMarks, percentage, isPassed };
  }

  test("Computes percentage and passing status accurately", () => {
    const res = evaluateExamResult({ marksObtained: 85, totalMarks: 100, passingMarks: 40 });
    assert.strictEqual(res.percentage, 85);
    assert.strictEqual(res.isPassed, true);
  });

  test("Marks student as failed when score is below passing threshold", () => {
    const res = evaluateExamResult({ marksObtained: 38, totalMarks: 100, passingMarks: 40 });
    assert.strictEqual(res.percentage, 38);
    assert.strictEqual(res.isPassed, false);
  });

  test("Throws error when marks exceed maximum allowed bounds", () => {
    assert.throws(
      () => evaluateExamResult({ marksObtained: 105, totalMarks: 100, passingMarks: 40 }),
      /must be between 0 and total marks/
    );
  });

  test("Throws error when marks are negative", () => {
    assert.throws(
      () => evaluateExamResult({ marksObtained: -5, totalMarks: 100, passingMarks: 40 }),
      /must be between 0 and total marks/
    );
  });
});

describe("Academic Evaluation: Homework Submissions & Deadline Evaluation", () => {
  function evaluateSubmissionTime(dueDate, submittedAt) {
    const due = new Date(dueDate).getTime();
    const sub = new Date(submittedAt).getTime();
    return sub <= due ? "on_time" : "late";
  }

  test("Marks submission as on_time if submitted on or before deadline", () => {
    const due = "2026-10-25T18:00:00Z";
    const sub = "2026-10-25T17:59:59Z";
    assert.strictEqual(evaluateSubmissionTime(due, sub), "on_time");
  });

  test("Marks submission as late if submitted after deadline", () => {
    const due = "2026-10-25T18:00:00Z";
    const sub = "2026-10-25T18:05:00Z";
    assert.strictEqual(evaluateSubmissionTime(due, sub), "late");
  });
});
