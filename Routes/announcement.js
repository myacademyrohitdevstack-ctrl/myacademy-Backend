const express = require("express");

const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { createAnnouncement, getBatchAnnouncements, deleteAnnouncement } = require("../Controllers/announcements");

const router = express.Router();
router.post('/create',protect,authorize("admin"),createAnnouncement)
router.get('/:batchId/announcements',protect,getBatchAnnouncements)
router.delete('/:id/delete',protect,authorize("admin"),deleteAnnouncement)
// router.get('/user/:id',protect,authorize("admin"),getUserById)

module.exports = router;