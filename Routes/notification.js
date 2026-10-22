const express = require("express");
const protect = require("../Middleware/protect");
const {
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} = require("../Controllers/notification");

const router = express.Router();

router.use(protect);

router.get("/", getMyNotifications);
router.patch("/mark-all-read", markAllNotificationsAsRead);
router.patch("/:id/read", markNotificationAsRead);

module.exports = router;
