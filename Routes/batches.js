const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const upload = require("../Middleware/upload");
const { createBatch, getBatches, getBatchById, updateBatch, deleteBatch, addStudentToBatch, getBatchStudents, removeStudentFromBatch } = require("../Controllers/batches");
router.post("/:courseId/batches",protect, createBatch);

router.get("/:slug/batches",protect, getBatches);

router.get("/:batchId/byId",protect, getBatchById);

router.patch("/:batchId/update",protect, updateBatch);

router.delete("/:courseId/batches/:batchId",protect, deleteBatch);
router.post(
  "/:batchId/students",
  protect,
  addStudentToBatch
);

router.get(
  "/:batchId/students",
  protect,
  getBatchStudents
);

router.delete(
  "/:batchId/students/:studentId",
  protect,
  removeStudentFromBatch
);
module.exports=router