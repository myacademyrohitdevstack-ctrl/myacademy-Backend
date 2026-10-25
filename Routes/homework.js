const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const controller = require("../Controllers/homework");

const router = express.Router();

router.get("/my-homework", protect, authorize("student"), controller.getMyHomework);
router.post("/:id/submit", protect, authorize("student"), controller.submitHomework);
router.get("/parent/:studentUserId", protect, authorize("parent"), controller.getChildHomework);

router.post("/", protect, requirePermissionOrRole("homework.manage", "admin", "teacher"), controller.createHomework);
router.get("/", protect, requirePermissionOrRole("homework.read", "admin", "teacher"), controller.getHomeworkList);
router.get("/:id", protect, requirePermissionOrRole("homework.read", "admin", "teacher", "student"), controller.getHomeworkById);
router.patch("/:id", protect, requirePermissionOrRole("homework.manage", "admin", "teacher"), controller.updateHomework);
router.delete("/:id", protect, requirePermissionOrRole("homework.manage", "admin", "teacher"), controller.deleteHomework);
router.patch("/:id/grade/:submissionId", protect, requirePermissionOrRole("homework.manage", "admin", "teacher"), controller.gradeSubmission);

module.exports = router;
