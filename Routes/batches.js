const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const {
  getAllAcademyBatches,
  createBatch,
  getBatches,
  getBatchById,
  updateBatch,
  deleteBatch,
  addStudentToBatch,
  getBatchStudents,
  removeStudentFromBatch,
} = require("../Controllers/batches");

router.get("/", protect, requirePermissionOrRole("batches.read", "admin", "teacher", "student", "parent"), getAllAcademyBatches);
router.post("/:courseId/batches", protect, requirePermissionOrRole("batches.create", "admin"), createBatch);
router.get("/:slug/batches", protect, requirePermissionOrRole("batches.read", "admin", "teacher", "student", "parent"), getBatches);
router.get("/:batchId/byId", protect, requirePermissionOrRole("batches.read", "admin", "teacher", "student", "parent"), getBatchById);
router.patch("/:batchId/update", protect, requirePermissionOrRole("batches.update", "admin", "teacher"), updateBatch);
router.delete("/:courseId/batches/:batchId", protect, requirePermissionOrRole("batches.delete", "admin"), deleteBatch);
router.post("/:batchId/students", protect, requirePermissionOrRole("batches.update", "admin"), addStudentToBatch);
router.get("/:batchId/students", protect, requirePermissionOrRole("batches.read", "admin", "teacher"), getBatchStudents);
router.delete("/:batchId/students/:studentId", protect, requirePermissionOrRole("batches.update", "admin"), removeStudentFromBatch);

module.exports = router;
