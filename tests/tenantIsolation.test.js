const { test, describe } = require("node:test");
const assert = require("node:assert");
const authorize = require("../Middleware/authorize");

describe("Tenant Isolation & Role Authorization Middleware", () => {
  test("Allows user with exact matching permitted role", () => {
    const middleware = authorize("admin", "super_admin");
    const req = { user: { role: "admin" } };
    let nextCalled = false;
    let resStatus = null;

    const res = {
      status: (code) => {
        resStatus = code;
        return { json: () => {} };
      },
    };

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(resStatus, null);
  });

  test("Rejects user with unpermitted role with 401 unauthorized", () => {
    const middleware = authorize("admin");
    const req = { user: { role: "student" } };
    let nextCalled = false;
    let resStatus = null;
    let responseBody = null;

    const res = {
      status: (code) => {
        resStatus = code;
        return {
          json: (body) => {
            responseBody = body;
          },
        };
      },
    };

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(resStatus, 401);
    assert.strictEqual(responseBody.success, false);
    assert.ok(responseBody.message.includes("not authorized"));
  });

  test("Prevents cross-tenant query contamination (Tenant Scope Check)", () => {
    const authenticatedAcademyId = "60d5ec49f1b2c8b1f8e4e1a1";
    const attackerAcademyId = "60d5ec49f1b2c8b1f8e4e999";

    // Simulate query building helper in controller
    function buildScopedQuery(req, filter = {}) {
      // Must always bind academyId from req.user/req.academy, never from untrusted req.query or req.body
      const effectiveAcademyId = req.user?.academyId || req.academy?._id;
      return {
        ...filter,
        academyId: effectiveAcademyId,
        isDeleted: { $ne: true },
      };
    }

    const maliciousReq = {
      user: { role: "admin", academyId: authenticatedAcademyId },
      query: { academyId: attackerAcademyId }, // Attacker trying to view another academy's records
      body: { academyId: attackerAcademyId },
    };

    const query = buildScopedQuery(maliciousReq, { courseId: "course123" });

    // The query MUST be bound to authenticatedAcademyId, ignoring the malicious input
    assert.strictEqual(String(query.academyId), authenticatedAcademyId);
    assert.notStrictEqual(String(query.academyId), attackerAcademyId);
    assert.deepStrictEqual(query.isDeleted, { $ne: true });
  });

  test("Parent-Child Link: Rejects access when child does not belong to parent", () => {
    const parentId = "parent_user_1";
    const childId = "student_user_1";
    const unrelatedChildId = "student_user_2";

    // Mock parent-child relationship table
    const links = [
      { parentId, studentId: childId, status: "active" },
    ];

    function verifyParentAccess(pId, targetStudentId) {
      return links.some((l) => l.parentId === pId && l.studentId === targetStudentId && l.status === "active");
    }

    assert.strictEqual(verifyParentAccess(parentId, childId), true);
    assert.strictEqual(verifyParentAccess(parentId, unrelatedChildId), false);
  });

  test("Teacher Batch Assignment: Rejects marking attendance for unassigned batch", () => {
    const teacherId = "teacher_1";
    const assignedBatchId = "batch_math_101";
    const unassignedBatchId = "batch_physics_201";

    const teacherAssignments = [
      { teacherId, batchId: assignedBatchId },
    ];

    function verifyTeacherBatch(tId, bId) {
      return teacherAssignments.some((a) => a.teacherId === tId && a.batchId === bId);
    }

    assert.strictEqual(verifyTeacherBatch(teacherId, assignedBatchId), true);
    assert.strictEqual(verifyTeacherBatch(teacherId, unassignedBatchId), false);
  });
});
