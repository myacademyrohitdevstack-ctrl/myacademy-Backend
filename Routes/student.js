const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { getMyProfile, updateProfile, getStudentBatches } = require("../Controllers/student");


const router = express.Router();
router.get('/me',protect,authorize("student"),getMyProfile)
router.get('/:studentId/batches',protect,authorize("student"),getStudentBatches)
router.patch('/update',protect,authorize("student"),updateProfile)

module.exports = router;