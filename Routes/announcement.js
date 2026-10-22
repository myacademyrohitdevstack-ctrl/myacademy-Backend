const express = require("express");

const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  getBatchAnnouncements,
  getCourseAnnouncements,
  getSystemAnnouncements,
} = require("../Controllers/announcements");

const router = express.Router();

router.post("/create", protect, authorize("admin", "teacher"), createAnnouncement);
router.get("/all", protect, authorize("admin"), getAnnouncements);
router.get("/system/all", protect, getSystemAnnouncements);
router.get("/course/:courseId", protect, getCourseAnnouncements);
router.get("/:batchId/announcements", protect, getBatchAnnouncements);
router.get("/:id", protect, getAnnouncementById);
router.put("/:id", protect, authorize("admin", "teacher"), updateAnnouncement);
router.delete("/:id/delete", protect, authorize("admin", "teacher"), deleteAnnouncement);

module.exports = router;
