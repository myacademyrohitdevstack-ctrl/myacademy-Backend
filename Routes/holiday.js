const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const {
  createHoliday,
  getHolidays,
  previewAffectedSessions,
  deleteHoliday,
} = require("../Controllers/holiday");

// Preview affected sessions
router.get("/preview-affected", protect, requirePermissionOrRole("batches.read", "admin", "teacher"), previewAffectedSessions);

// Create holiday
router.post("/", protect, requirePermissionOrRole("batches.update", "admin"), createHoliday);

// Get holidays
router.get("/", protect, requirePermissionOrRole("batches.read", "admin", "teacher", "student", "parent"), getHolidays);

// Delete holiday
router.delete("/:id", protect, requirePermissionOrRole("batches.delete", "admin"), deleteHoliday);

module.exports = router;
