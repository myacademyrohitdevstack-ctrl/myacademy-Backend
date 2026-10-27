const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const {
  createTimetable,
  getTimetables,
  getTimetableById,
  updateTimetable,
  toggleTimetableStatus,
  deleteTimetable,
  checkTimetableConflict,
} = require("../Controllers/timetable");

// Check conflicts
router.post(
  "/check-conflict",
  protect,
  requirePermissionOrRole("batches.update", "admin", "teacher"),
  checkTimetableConflict
);

// Create timetable
router.post(
  "/",
  protect,
  requirePermissionOrRole("batches.create", "admin"),
  createTimetable
);

// Get timetables
router.get(
  "/",
  protect,
  requirePermissionOrRole("batches.read", "admin", "teacher", "student", "parent"),
  getTimetables
);

// Get timetable by ID
router.get(
  "/:id",
  protect,
  requirePermissionOrRole("batches.read", "admin", "teacher", "student", "parent"),
  getTimetableById
);

// Update timetable
router.put(
  "/:id",
  protect,
  requirePermissionOrRole("batches.update", "admin"),
  updateTimetable
);

// Toggle active status
router.patch(
  "/:id/status",
  protect,
  requirePermissionOrRole("batches.update", "admin"),
  toggleTimetableStatus
);

// Delete timetable
router.delete(
  "/:id",
  protect,
  requirePermissionOrRole("batches.delete", "admin"),
  deleteTimetable
);

module.exports = router;
