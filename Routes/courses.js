const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const upload = require("../Middleware/upload");
const { createCourse, getCourses, getCourseById, updateCourse, deleteCourse, publishCourse, archiveCourse } = require("../Controllers/Courses");




const router = express.Router();
router.post("/createCourse",protect,authorize("admin"),upload.single('image'),createCourse );


router.get("/", protect,authorize("admin"), getCourses);

router.get("/:courseId", getCourseById);

router.patch("/:courseId", updateCourse);

router.delete("/:courseId", deleteCourse);

router.patch("/:courseId/publish", publishCourse);

router.patch("/:courseId/archive", archiveCourse);
module.exports = router;

// import { Router } from "express";

// const router = Router();

// /* =========================
//    COURSE MANAGEMENT
// ========================= */



// router.get("/", getCourses);

// router.get("/:courseId", getCourse);

// router.patch("/:courseId", updateCourse);

// router.delete("/:courseId", deleteCourse);

// /* =========================
//    COURSE STATUS
// ========================= */

// router.patch("/:courseId/publish", publishCourse);

// router.patch("/:courseId/unpublish", unpublishCourse);

// router.patch("/:courseId/archive", archiveCourse);

// router.patch("/:courseId/restore", restoreCourse);

// /* =========================
//    COURSE THUMBNAIL
// ========================= */

// router.patch("/:courseId/thumbnail", updateThumbnail);

// router.delete("/:courseId/thumbnail", deleteThumbnail);

// /* =========================
//    MODULES
// ========================= */

// router.post("/:courseId/modules", createModule);

// router.get("/:courseId/modules", getModules);

// router.get("/:courseId/modules/:moduleId", getModule);

// router.patch("/:courseId/modules/:moduleId", updateModule);

// router.delete("/:courseId/modules/:moduleId", deleteModule);

// router.patch("/:courseId/modules/reorder", reorderModules);

// /* =========================
//    LESSONS
// ========================= */

// router.post(
//   "/:courseId/modules/:moduleId/lessons",
//   createLesson
// );

// router.get(
//   "/:courseId/modules/:moduleId/lessons",
//   getLessons
// );

// router.get(
//   "/:courseId/modules/:moduleId/lessons/:lessonId",
//   getLesson
// );

// router.patch(
//   "/:courseId/modules/:moduleId/lessons/:lessonId",
//   updateLesson
// );

// router.delete(
//   "/:courseId/modules/:moduleId/lessons/:lessonId",
//   deleteLesson
// );

// router.patch(
//   "/:courseId/modules/:moduleId/lessons/reorder",
//   reorderLessons
// );

// /* =========================
//    BATCHES
// ========================= */

// router.post("/:courseId/batches", createBatch);

// router.get("/:courseId/batches", getBatches);

// router.get("/:courseId/batches/:batchId", getBatch);

// router.patch("/:courseId/batches/:batchId", updateBatch);

// router.delete("/:courseId/batches/:batchId", deleteBatch);

// /* =========================
//    BATCH STUDENTS
// ========================= */

// router.post(
//   "/:courseId/batches/:batchId/students",
//   addStudentToBatch
// );

// router.get(
//   "/:courseId/batches/:batchId/students",
//   getBatchStudents
// );

// router.delete(
//   "/:courseId/batches/:batchId/students/:studentId",
//   removeStudentFromBatch
// );

// /* =========================
//    RECORDINGS
// ========================= */

// router.post(
//   "/:courseId/batches/:batchId/recordings",
//   createRecording
// );

// router.get(
//   "/:courseId/batches/:batchId/recordings",
//   getRecordings
// );

// router.get(
//   "/:courseId/batches/:batchId/recordings/:recordingId",
//   getRecording
// );

// router.patch(
//   "/:courseId/batches/:batchId/recordings/:recordingId",
//   updateRecording
// );

// router.delete(
//   "/:courseId/batches/:batchId/recordings/:recordingId",
//   deleteRecording
// );

// /* =========================
//    ENROLLMENTS
// ========================= */

// router.post("/:courseId/enroll", enrollInCourse);

// router.post(
//   "/:courseId/batches/:batchId/enroll",
//   enrollInBatch
// );

// router.delete(
//   "/:courseId/batches/:batchId/enrollments/:enrollmentId",
//   cancelEnrollment
// );

// /* =========================
//    ANALYTICS
// ========================= */

// router.get("/:courseId/analytics", getCourseAnalytics);

// router.get(
//   "/:courseId/analytics/enrollments",
//   getEnrollmentAnalytics
// );

// router.get(
//   "/:courseId/analytics/revenue",
//   getRevenueAnalytics
// );

// export default router;