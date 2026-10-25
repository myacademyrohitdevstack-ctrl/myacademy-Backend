const { createParent } = require("../Controllers/parent");
const express = require("express");
const {
  getSubscriptionUsage,
  getAcademyProfile,
  updateAcademyProfile,
  getUsers,
  approveUser,
  rejectUser,
  blockUser,
  unblockUser,
  getUserById,
  updateUserByAdmin,
  getDashboardStats,
  getRecentEnrollments,
  getallClasses,
  getallAnnouncement,
  createStudent,
  deleteUserByAdmin,
  createTeacher,
  bulkCreateStudents,
  bulkCreateTeachers,
} = require("../Controllers/admin");
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
  requireAnyPermission,
  requireAcademyOwner,
} = require("../Middleware/authorizePermission");
const upload = require("../Middleware/upload");

const router = express.Router();

// Academy profile and settings
router.get("/academy", protect, requirePermissionOrRole("academy_settings.read", "admin"), getAcademyProfile);
router.put("/academy", protect, requirePermissionOrRole("academy_settings.update", "admin"), upload.single("logo"), updateAcademyProfile);
router.get("/academy-public", protect, getAcademyProfile);

// Subscription and billing is strictly restricted to academy owner
router.get("/subscription-usage", protect, requireAcademyOwner, getSubscriptionUsage);

// User listings & details
router.get("/users", protect, requireAnyPermission("students.read", "teachers.read"), getUsers);
router.get("/user/:id", protect, requireAnyPermission("students.read", "teachers.read"), getUserById);

// Analytics and activity feeds
router.get("/dashboard-stats", protect, requirePermissionOrRole("reports.read", "admin"), getDashboardStats);
router.get("/recent-activties", protect, requirePermissionOrRole("reports.read", "admin"), getRecentEnrollments);
router.get("/all-classes", protect, requirePermissionOrRole("batches.read", "admin"), getallClasses);
router.get("/all-announcements", protect, requirePermissionOrRole("announcements.manage", "admin"), getallAnnouncement);

// User status & moderation
router.patch("/user/:id/approve", protect, requireAnyPermission("students.update", "teachers.update"), approveUser);
router.patch("/user/:id/reject", protect, requireAnyPermission("students.update", "teachers.update"), rejectUser);
router.patch("/user/:id/block", protect, requireAnyPermission("students.update", "teachers.update"), blockUser);
router.patch("/user/:id/unblock", protect, requireAnyPermission("students.update", "teachers.update"), unblockUser);
router.patch("/user/:id/update", protect, requireAnyPermission("students.update", "teachers.update"), updateUserByAdmin);

// User creation
router.post("/create-student", protect, requirePermissionOrRole("students.create", "admin"), createStudent);
router.post("/create-teacher", protect, requirePermissionOrRole("teachers.create", "admin"), createTeacher);
router.post("/bulk-create-students", protect, requirePermissionOrRole("students.create", "admin"), bulkCreateStudents);
router.post("/bulk-create-teachers", protect, requirePermissionOrRole("teachers.create", "admin"), bulkCreateTeachers);
router.post("/create-parent", protect, requirePermissionOrRole("students.create", "admin"), createParent);

// User deletion
router.delete("/user/:id", protect, requireAnyPermission("students.delete", "teachers.delete"), deleteUserByAdmin);

module.exports = router;
