const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const upload = require("../Middleware/upload");
const { createBatch, getBatches, getBatchById, updateBatch, deleteBatch, addStudentToBatch, getBatchStudents, removeStudentFromBatch } = require("../Controllers/batches");
router.post("/:courseId/batches", createBatch);

router.get("/:courseId/batches", getBatches);

router.get("/:courseId/batches/:batchId", getBatchById);

router.patch("/:courseId/batches/:batchId", updateBatch);

router.delete("/:courseId/batches/:batchId", deleteBatch);
router.post(
  "/:batchId/students",
  addStudentToBatch
);

router.get(
  "/:batchId/students",
  getBatchStudents
);

router.delete(
  "/:batchId/students/:studentId",
  removeStudentFromBatch
);
module.exports=router