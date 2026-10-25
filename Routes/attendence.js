const express = require("express");
const router = express.Router();
const {
  markAttendance,
  updateAttendance,
  getAttendance,
  getBatchAttendanceHistory,
  getStudentAttendance,
  deleteAttendance,
  getAttendanceDashboard,
  getAttendanceById,
} = require("../Controllers/attendence");
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");

// Mark attendance
router.post(
  "/mark",
  protect,
  requirePermissionOrRole("attendance.create", "admin", "teacher"),
  markAttendance
);

// Get attendance by batch & date
router.get(
  "/",
  protect,
  requirePermissionOrRole("attendance.read", "admin", "teacher", "student", "parent"),
  getAttendance
);

router.get(
  "/:attendanceId/ById",
  protect,
  requirePermissionOrRole("attendance.read", "admin", "teacher", "student", "parent"),
  getAttendanceById
);

router.get(
  "/:batchId/dashboard",
  protect,
  requirePermissionOrRole("attendance.read", "admin", "teacher"),
  getAttendanceDashboard
);

// Get batch attendance history
router.get(
  "/batch/:batchId",
  protect,
  requirePermissionOrRole("attendance.read", "admin", "teacher", "student", "parent"),
  getBatchAttendanceHistory
);

// Get student attendance report
router.get(
  "/student/:studentId",
  protect,
  getStudentAttendance
);

// Update attendance
router.put(
  "/:attendanceId",
  protect,
  requirePermissionOrRole("attendance.update", "admin", "teacher"),
  updateAttendance
);

// Delete attendance
router.delete(
  "/:attendanceId",
  protect,
  requirePermissionOrRole("attendance.update", "admin"),
  deleteAttendance
);

module.exports = router;
