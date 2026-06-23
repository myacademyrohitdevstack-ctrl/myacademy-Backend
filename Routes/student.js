const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { getMyProfile, updateProfile, getStudentBatches, getStudentNotes, getStudentClassLinks } = require("../Controllers/student");


const router = express.Router();
router.get('/me',protect,authorize("student"),getMyProfile)
router.get('/:studentId/batches',protect,authorize("student"),getStudentBatches)
router.get('/:batchId/notes',protect,authorize("student"),getStudentNotes)
router.get('/:batchId/class-links',protect,authorize("student"),getStudentClassLinks)
router.patch('/update',protect,authorize("student","admin"),updateProfile)

module.exports = router;