const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const {
  requestStudentLeave,
  getMyStudentLeaves,
  getAcademyStudentLeaves,
  reviewStudentLeave,
  cancelStudentLeave,
} = require("../Controllers/studentLeave");

// Student's own leave requests
router.get("/my", protect, requirePermissionOrRole("students.read", "student", "parent"), getMyStudentLeaves);

// Submit student leave request
router.post("/", protect, requirePermissionOrRole("students.read", "student"), requestStudentLeave);

// Academy-wide student leave requests
router.get("/", protect, requirePermissionOrRole("students.read", "admin", "teacher"), getAcademyStudentLeaves);

// Review (approve/reject)
router.put("/:id/review", protect, requirePermissionOrRole("students.update", "admin", "teacher"), reviewStudentLeave);

// Cancel student leave
router.patch("/:id/cancel", protect, requirePermissionOrRole("students.read", "student", "admin"), cancelStudentLeave);

module.exports = router;
