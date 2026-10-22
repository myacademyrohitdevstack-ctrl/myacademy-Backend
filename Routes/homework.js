const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const controller = require("../Controllers/homework");

const router = express.Router();

router.get("/my-homework", protect, authorize("student"), controller.getMyHomework);
router.post("/:id/submit", protect, authorize("student"), controller.submitHomework);
router.get("/parent/:studentUserId", protect, authorize("parent"), controller.getChildHomework);

router.post("/", protect, authorize("admin", "teacher"), controller.createHomework);
router.get("/", protect, authorize("admin", "teacher"), controller.getHomeworkList);
router.get("/:id", protect, authorize("admin", "teacher", "student"), controller.getHomeworkById);
router.patch("/:id", protect, authorize("admin", "teacher"), controller.updateHomework);
router.delete("/:id", protect, authorize("admin", "teacher"), controller.deleteHomework);
router.patch("/:id/grade/:submissionId", protect, authorize("admin", "teacher"), controller.gradeSubmission);

module.exports = router;
