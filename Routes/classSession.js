const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const {
  getAcademySessions,
  getSessionById,
  getTeacherTodaySessions,
  getTeacherUpcomingSessions,
  getPendingAttendanceSessions,
  createExtraSession,
  cancelSession,
  rescheduleSession,
  assignSubstituteTeacher,
  getMakeUpDueSessions,
  triggerSessionGeneration,
} = require("../Controllers/classSession");

// Teacher specific routes
router.get("/teacher/today", protect, requirePermissionOrRole("attendance.read", "teacher", "admin"), getTeacherTodaySessions);
router.get("/teacher/upcoming", protect, requirePermissionOrRole("attendance.read", "teacher", "admin"), getTeacherUpcomingSessions);
router.get("/teacher/pending-attendance", protect, requirePermissionOrRole("attendance.read", "teacher", "admin"), getPendingAttendanceSessions);

// Make up tracking
router.get("/make-up-due", protect, requirePermissionOrRole("attendance.read", "admin", "teacher"), getMakeUpDueSessions);

// Manual rolling generation trigger
router.post("/generate", protect, requirePermissionOrRole("batches.update", "admin"), triggerSessionGeneration);

// Extra one-time session
router.post("/extra", protect, requirePermissionOrRole("batches.create", "admin", "teacher"), createExtraSession);

// Session actions
router.post("/:id/cancel", protect, requirePermissionOrRole("batches.update", "admin", "teacher"), cancelSession);
router.post("/:id/reschedule", protect, requirePermissionOrRole("batches.update", "admin", "teacher"), rescheduleSession);
router.post("/:id/substitute", protect, requirePermissionOrRole("batches.update", "admin"), assignSubstituteTeacher);

// General list & detail
router.get("/", protect, requirePermissionOrRole("attendance.read", "admin", "teacher", "student", "parent"), getAcademySessions);
router.get("/:id", protect, requirePermissionOrRole("attendance.read", "admin", "teacher", "student", "parent"), getSessionById);

module.exports = router;
