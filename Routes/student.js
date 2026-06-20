const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { getMyProfile, updateProfile } = require("../Controllers/student");


const router = express.Router();
router.get('/me',protect,authorize("student"),getMyProfile)
router.patch('/update',protect,authorize("student"),updateProfile)

module.exports = router;