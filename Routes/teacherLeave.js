const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const {
  requestTeacherLeave,
  getTeacherLeaves,
  previewAffectedSessions,
  reviewTeacherLeave,
  cancelTeacherLeave,
} = require("../Controllers/teacherLeave");

// Preview affected sessions
router.get(
  "/preview-affected",
  protect,
  requirePermissionOrRole("batches.read", "admin", "teacher"),
  previewAffectedSessions
);

// Submit leave request
router.post(
  "/",
  protect,
  requirePermissionOrRole("batches.read", "teacher", "admin"),
  requestTeacherLeave
);

// Get teacher leaves
router.get(
  "/",
  protect,
  requirePermissionOrRole("batches.read", "admin", "teacher"),
  getTeacherLeaves
);

// Review (approve/reject)
router.put(
  "/:id/review",
  protect,
  requirePermissionOrRole("teachers.update", "admin"),
  reviewTeacherLeave
);

// Cancel leave
router.patch(
  "/:id/cancel",
  protect,
  requirePermissionOrRole("batches.read", "teacher", "admin"),
  cancelTeacherLeave
);

module.exports = router;
