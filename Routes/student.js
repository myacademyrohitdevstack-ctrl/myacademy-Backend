const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { getMyProfile, updateProfile, getStudentBatches, getStudentNotes, getStudentClassLinks, getStudentBatchById, getStudentAnnouncements, getLoggedStudentAllAnnouncements, getLoggedStudentAllClasses } = require("../Controllers/student");


const router = express.Router();
router.get('/me',protect,authorize("student"),getMyProfile)
router.get('/:studentId/batches',protect,authorize("student"),getStudentBatches)
router.get('/:batchId/notes',protect,authorize("student"),getStudentNotes)
router.get('/:batchId/class-links',protect,authorize("student"),getStudentClassLinks)
router.get('/:batchId/batch',protect,authorize("student"),getStudentBatchById)
router.get('/:courseId/:batchId/announcements',protect,authorize("student"),getStudentAnnouncements)
router.get('/announcements',protect,authorize("student"),getLoggedStudentAllAnnouncements)
router.get('/classes',protect,authorize("student"),getLoggedStudentAllClasses)
router.patch('/update',protect,authorize("student","admin"),updateProfile)

module.exports = router;