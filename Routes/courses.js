const express = require("express");
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const upload = require("../Middleware/upload");
const {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  publishCourse,
  archiveCourse,
} = require("../Controllers/Courses");

const router = express.Router();

router.post("/createCourse", protect, requirePermissionOrRole("courses.create", "admin"), upload.single("image"), createCourse);
router.get("/", protect, requirePermissionOrRole("courses.read", "admin", "teacher"), getCourses);
router.get("/:courseId", protect, getCourseById);
router.patch("/:courseId", protect, requirePermissionOrRole("courses.update", "admin", "teacher"), updateCourse);
router.delete("/:courseId", protect, requirePermissionOrRole("courses.delete", "admin"), deleteCourse);
router.patch("/:courseId/publish", protect, requirePermissionOrRole("courses.update", "admin"), publishCourse);
router.patch("/:courseId/archive", protect, requirePermissionOrRole("courses.update", "admin"), archiveCourse);

module.exports = router;
