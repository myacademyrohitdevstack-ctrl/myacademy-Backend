const express = require("express");

const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { createAnnouncement, getBatchAnnouncements, deleteAnnouncement } = require("../Controllers/announcements");

const router = express.Router();
router.post('/create',protect,authorize("admin","teacher"),createAnnouncement)
router.get('/:batchId/announcements',protect,getBatchAnnouncements)
router.delete('/:id/delete',protect,authorize("admin","teacher"),deleteAnnouncement)
// router.get('/user/:id',protect,authorize("admin"),getUserById)
module.exports = router;