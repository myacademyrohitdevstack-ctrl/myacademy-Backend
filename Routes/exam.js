const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const controller = require("../Controllers/exam");

const router = express.Router();

router.get("/my-results", protect, authorize("student"), controller.getMyExamResults);
router.get("/parent/:studentUserId", protect, authorize("parent"), controller.getChildExamResults);

router.post("/", protect, authorize("admin", "teacher"), controller.createExam);
router.get("/", protect, authorize("admin", "teacher"), controller.getExams);
router.get("/:id", protect, authorize("admin", "teacher"), controller.getExamById);
router.patch("/:id", protect, authorize("admin", "teacher"), controller.updateExam);
router.delete("/:id", protect, authorize("admin", "teacher"), controller.deleteExam);
router.post("/:id/results", protect, authorize("admin", "teacher"), controller.saveExamResults);

module.exports = router;
