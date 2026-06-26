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
} = require("../Controllers/attendence");
const protect = require("../Middleware/protect");


// Mark attendance
router.post(
  "/mark",
  protect,
  markAttendance
);

// Get attendance by batch & date
// Example:
// GET /api/attendance?batch=123&date=2026-06-26
router.get(
  "/",
  protect,
  getAttendance
);
router.get(
  "/:batchId/dashboard",
  protect,
  getAttendanceDashboard
);

// Get batch attendance history
router.get(
  "/batch/:batchId",
  protect,
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
  updateAttendance
);

// Delete attendance
router.delete(
  "/:attendanceId",
  protect,
  deleteAttendance
);

module.exports = router;