const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const controller = require("../Controllers/exam");

const router = express.Router();

router.get("/my-results", protect, authorize("student"), controller.getMyExamResults);
router.get("/parent/:studentUserId", protect, authorize("parent"), controller.getChildExamResults);

router.post("/", protect, requirePermissionOrRole("exams.manage", "admin", "teacher"), controller.createExam);
router.get("/", protect, requirePermissionOrRole("exams.read", "admin", "teacher"), controller.getExams);
router.get("/:id", protect, requirePermissionOrRole("exams.read", "admin", "teacher"), controller.getExamById);
router.patch("/:id", protect, requirePermissionOrRole("exams.manage", "admin", "teacher"), controller.updateExam);
router.delete("/:id", protect, requirePermissionOrRole("exams.manage", "admin", "teacher"), controller.deleteExam);
router.post("/:id/results", protect, requirePermissionOrRole("exams.manage", "admin", "teacher"), controller.saveExamResults);

module.exports = router;
