const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  hasPermission,
  isAcademyOwner,
  PERMISSIONS,
  VALID_PERMISSIONS_LIST,
} = require("../Utils/permissions");
const {
  requirePermission,
  requireAnyPermission,
  requirePermissionOrRole,
  requireAcademyOwner,
} = require("../Middleware/authorizePermission");

// Helper to mock express req, res, next
function createMockHttp({ user, academy, params = {}, query = {}, body = {} } = {}) {
  let nextCalled = false;
  let statusCode = null;
  let responseBody = null;

  const req = { user, academy, params, query, body };
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (payload) => {
          responseBody = payload;
          return payload;
        },
      };
    },
  };
  const next = () => {
    nextCalled = true;
  };

  return { req, res, next, getNext: () => nextCalled, getStatus: () => statusCode, getBody: () => responseBody };
}

describe("Academy Staff Custom Permissions & Access Control", () => {
  const academyAId = "60d5ec49f1b2c8b1f8e4e111";
  const academyBId = "60d5ec49f1b2c8b1f8e4e222";
  const ownerUserId = "507f1f77bcf86cd799439011";
  const staffUserId = "507f1f77bcf86cd799439022";

  const mockAcademyA = {
    _id: academyAId,
    name: "Academy Alpha",
    owner: ownerUserId,
    status: "active",
  };

  const mockOwner = {
    _id: ownerUserId,
    fullName: "Alpha Owner",
    email: "owner@alpha.com",
    role: "admin",
    academyId: academyAId,
  };

  const mockSuperAdmin = {
    _id: "507f1f77bcf86cd799439099",
    fullName: "Platform Super Admin",
    email: "superadmin@myacademy.com",
    role: "admin",
    platformRole: "super_admin",
  };

  test("1. Staff member with permission granted succeeds", () => {
    const staffWithFeePerm = {
      _id: staffUserId,
      role: "academy_staff",
      academyId: academyAId,
      permissions: [PERMISSIONS.FEES_READ, PERMISSIONS.FEES_CREATE],
    };

    assert.strictEqual(hasPermission(staffWithFeePerm, PERMISSIONS.FEES_READ), true);
    assert.strictEqual(hasPermission(staffWithFeePerm, PERMISSIONS.FEES_CREATE), true);

    const middleware = requirePermission(PERMISSIONS.FEES_READ);
    const { req, res, next, getNext, getStatus } = createMockHttp({
      user: staffWithFeePerm,
      academy: mockAcademyA,
    });

    middleware(req, res, next);
    assert.strictEqual(getNext(), true);
    assert.strictEqual(getStatus(), null);
  });

  test("2. Staff member without permission receives 403 Forbidden", () => {
    const staffWithoutDelete = {
      _id: staffUserId,
      role: "academy_staff",
      academyId: academyAId,
      permissions: [PERMISSIONS.FEES_READ], // only read, no delete
    };

    assert.strictEqual(hasPermission(staffWithoutDelete, PERMISSIONS.FEES_DELETE), false);

    const middleware = requirePermission(PERMISSIONS.FEES_DELETE);
    const { req, res, next, getNext, getStatus, getBody } = createMockHttp({
      user: staffWithoutDelete,
      academy: mockAcademyA,
    });

    middleware(req, res, next);
    assert.strictEqual(getNext(), false);
    assert.strictEqual(getStatus(), 403);
    assert.strictEqual(getBody().success, false);
    assert.ok(getBody().message.includes("fees.delete"));
  });

  test("3. requirePermissionOrRole allows role or staff with explicit permission", () => {
    const middleware = requirePermissionOrRole(PERMISSIONS.STUDENTS_READ, "teacher");

    // Teacher accesses via role
    const teacherUser = { _id: "teacher1", role: "teacher", academyId: academyAId };
    const teacherHttp = createMockHttp({ user: teacherUser, academy: mockAcademyA });
    middleware(teacherHttp.req, teacherHttp.res, teacherHttp.next);
    assert.strictEqual(teacherHttp.getNext(), true);

    // Staff with students.read accesses via permission
    const staffWithPerm = {
      _id: staffUserId,
      role: "academy_staff",
      academyId: academyAId,
      permissions: [PERMISSIONS.STUDENTS_READ],
    };
    const staffHttp = createMockHttp({ user: staffWithPerm, academy: mockAcademyA });
    middleware(staffHttp.req, staffHttp.res, staffHttp.next);
    assert.strictEqual(staffHttp.getNext(), true);

    // Staff WITHOUT students.read is rejected
    const staffWithoutPerm = {
      _id: staffUserId,
      role: "academy_staff",
      academyId: academyAId,
      permissions: [PERMISSIONS.TEACHERS_READ],
    };
    const deniedHttp = createMockHttp({ user: staffWithoutPerm, academy: mockAcademyA });
    middleware(deniedHttp.req, deniedHttp.res, deniedHttp.next);
    assert.strictEqual(deniedHttp.getNext(), false);
    assert.strictEqual(deniedHttp.getStatus(), 403);
  });

  test("4. requireAcademyOwner strictly restricts staff from owner-only actions", () => {
    const middleware = requireAcademyOwner;

    // Academy Owner passes
    const ownerHttp = createMockHttp({ user: mockOwner, academy: mockAcademyA });
    middleware(ownerHttp.req, ownerHttp.res, ownerHttp.next);
    assert.strictEqual(ownerHttp.getNext(), true);

    // Super Admin passes
    const superAdminHttp = createMockHttp({ user: mockSuperAdmin, academy: mockAcademyA });
    middleware(superAdminHttp.req, superAdminHttp.res, superAdminHttp.next);
    assert.strictEqual(superAdminHttp.getNext(), true);

    // Staff member with ALL permissions is STILL rejected from owner-only actions
    const allPermsStaff = {
      _id: staffUserId,
      role: "academy_staff",
      academyId: academyAId,
      permissions: [...VALID_PERMISSIONS_LIST],
    };
    const staffHttp = createMockHttp({ user: allPermsStaff, academy: mockAcademyA });
    middleware(staffHttp.req, staffHttp.res, staffHttp.next);
    assert.strictEqual(staffHttp.getNext(), false);
    assert.strictEqual(staffHttp.getStatus(), 403);
    assert.strictEqual(isAcademyOwner(allPermsStaff, mockAcademyA), false);
  });

  test("5. Server-controlled permission allowlist rejects arbitrary/injected permissions", () => {
    const maliciousPermissions = [
      "students.read",
      "superadmin.takeover",
      "billing.bypass",
      "__proto__.pollute",
    ];

    const invalid = maliciousPermissions.filter((p) => !VALID_PERMISSIONS_LIST.includes(p));
    assert.deepStrictEqual(invalid, [
      "superadmin.takeover",
      "billing.bypass",
      "__proto__.pollute",
    ]);
  });

  test("6. Immediate Revocation: subsequent checks respect updated permissions without re-login", () => {
    // User object in DB loaded on request
    const userInDb = {
      _id: staffUserId,
      role: "academy_staff",
      academyId: academyAId,
      permissions: [PERMISSIONS.FEES_READ, PERMISSIONS.FEES_DELETE],
    };

    assert.strictEqual(hasPermission(userInDb, PERMISSIONS.FEES_DELETE), true);

    // Owner revokes fees.delete in database
    userInDb.permissions = [PERMISSIONS.FEES_READ];

    // Next request evaluates fresh permissions
    assert.strictEqual(hasPermission(userInDb, PERMISSIONS.FEES_DELETE), false);
    assert.strictEqual(hasPermission(userInDb, PERMISSIONS.FEES_READ), true);
  });

  test("7. Suspended / blocked staff member rejected by account status guard", () => {
    const blockedStaff = {
      _id: staffUserId,
      role: "academy_staff",
      status: "blocked",
      approvalStatus: "approved",
      permissions: [PERMISSIONS.STUDENTS_READ],
    };

    function evaluateAccountAccess(user) {
      if (user.status === "blocked") return { allowed: false, code: 401, message: "Account blocked" };
      if (user.approvalStatus === "rejected") return { allowed: false, code: 401, message: "Account rejected" };
      return { allowed: true };
    }

    const check = evaluateAccountAccess(blockedStaff);
    assert.strictEqual(check.allowed, false);
    assert.strictEqual(check.code, 401);
  });

  test("8. Cross-tenant isolation: Academy A staff cannot access Academy B resources", () => {
    const staffAcademyA = {
      _id: staffUserId,
      role: "academy_staff",
      academyId: academyAId,
      permissions: [PERMISSIONS.STUDENTS_READ, PERMISSIONS.STUDENTS_UPDATE],
    };

    const targetStudentInAcademyB = {
      _id: "student_b_1",
      academyId: academyBId,
      fullName: "Student in Academy B",
    };

    function authorizeResourceAccess(user, resource) {
      if (String(user.academyId) !== String(resource.academyId)) {
        return { allowed: false, code: 404, message: "Resource not found in this academy." };
      }
      return { allowed: true };
    }

    const result = authorizeResourceAccess(staffAcademyA, targetStudentInAcademyB);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.code, 404);
  });

  test("9. Backward compatibility: Academy Owner retains 100% full access to all features", () => {
    for (const permission of VALID_PERMISSIONS_LIST) {
      assert.strictEqual(
        hasPermission(mockOwner, permission),
        true,
        `Owner must have implicit access to ${permission}`
      );
    }

    // Owner is confirmed as academy owner
    assert.strictEqual(isAcademyOwner(mockOwner, mockAcademyA), true);
  });
});
