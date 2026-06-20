const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const upload = require("../Middleware/upload");
const { updateProfileImage } = require("../Controllers/user");



const router = express.Router();
router.patch('/profileImage/update',protect,upload.single('image'),updateProfileImage)


module.exports = router;