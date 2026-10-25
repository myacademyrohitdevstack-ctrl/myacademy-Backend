const express = require("express");

const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
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

router.post("/create", protect, requirePermissionOrRole("announcements.manage", "admin", "teacher"), createAnnouncement);
router.get("/all", protect, requirePermissionOrRole("announcements.manage", "admin"), getAnnouncements);
router.get("/system/all", protect, getSystemAnnouncements);
router.get("/course/:courseId", protect, getCourseAnnouncements);
router.get("/:batchId/announcements", protect, getBatchAnnouncements);
router.get("/:id", protect, getAnnouncementById);
router.put("/:id", protect, requirePermissionOrRole("announcements.manage", "admin", "teacher"), updateAnnouncement);
router.delete("/:id/delete", protect, requirePermissionOrRole("announcements.manage", "admin", "teacher"), deleteAnnouncement);

module.exports = router;
