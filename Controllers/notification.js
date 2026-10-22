const mongoose = require("mongoose");
const asyncHandler = require("../Utils/asyncHandler");
const Announcement = require("../Modals/Announcement");
const Batch = require("../Modals/Batches");
const ParentStudent = require("../Modals/ParentStudent");
const User = require("../Modals/User");

// @desc Get Notifications for logged in user based on role and enrolled/assigned batches
// @route GET /api/notifications
// @access Private
const getMyNotifications = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("role readAnnouncements lastNotificationReadAt");
  const role = req.user.role;
  const academyId = req.academy?._id || req.user.academyId;

  if (!academyId && req.user.platformRole !== "super_admin") {
    return res.status(200).json({ success: true, unreadCount: 0, notifications: [] });
  }

  let filter = {
    isDeleted: false,
    isPublished: true,
  };

  if (academyId) {
    filter.academyId = academyId;
  }

  if (role === "admin") {
    // Admin sees all announcements for their academy
  } else if (role === "teacher") {
    // Teacher sees system announcements + batches they train
    const batches = await Batch.find({
      academyId,
      trainers: req.user._id,
      isDeleted: false,
    }).select("_id course");

    const batchIds = batches.map((b) => b._id);
    const courseIds = batches.map((b) => b.course).filter(Boolean);

    filter.$or = [
      { targetType: "system" },
      { targetType: "batch", batch: { $in: batchIds } },
      { targetType: "course", course: { $in: courseIds } },
    ];
  } else if (role === "student") {
    // Student sees system announcements + batches they are enrolled in
    const batches = await Batch.find({
      academyId,
      students: req.user._id,
      isDeleted: false,
    }).select("_id course");

    const batchIds = batches.map((b) => b._id);
    const courseIds = batches.map((b) => b.course).filter(Boolean);

    filter.$or = [
      { targetType: "system" },
      { targetType: "batch", batch: { $in: batchIds } },
      { targetType: "course", course: { $in: courseIds } },
    ];
  } else if (role === "parent") {
    // Parent sees system announcements + batches of all their linked children
    const links = await ParentStudent.find({
      academyId,
      parentId: req.user._id,
      status: "active",
    }).select("studentUserId");

    const studentUserIds = links.map((l) => l.studentUserId);

    const batches = await Batch.find({
      academyId,
      students: { $in: studentUserIds },
      isDeleted: false,
    }).select("_id course");

    const batchIds = batches.map((b) => b._id);
    const courseIds = batches.map((b) => b.course).filter(Boolean);

    filter.$or = [
      { targetType: "system" },
      { targetType: "batch", batch: { $in: batchIds } },
      { targetType: "course", course: { $in: courseIds } },
    ];
  }

  const announcements = await Announcement.find(filter)
    .sort({ isPinned: -1, publishAt: -1, createdAt: -1 })
    .limit(30)
    .populate("batch", "name slug")
    .populate("course", "title slug")
    .populate("createdBy", "fullName role");

  const readAnnouncementIds = new Set((user?.readAnnouncements || []).map((id) => id.toString()));
  const lastReadTime = user?.lastNotificationReadAt ? new Date(user.lastNotificationReadAt).getTime() : 0;

  const notifications = announcements.map((ann) => {
    const annCreatedAt = new Date(ann.createdAt).getTime();
    const isRead =
      readAnnouncementIds.has(ann._id.toString()) ||
      (lastReadTime > 0 && annCreatedAt <= lastReadTime);

    // Build smart deep link based on role
    let link = "/";
    const batchId = ann.batch?._id || ann.batch;
    const courseSlug = ann.course?.slug || "all";

    if (role === "admin") {
      link = batchId
        ? `/admin-panel/batches/${courseSlug}/batch?batchId=${batchId}&tab=announcements`
        : "/admin-panel/courses";
    } else if (role === "student") {
      link = batchId
        ? `/student-profile/classes?batchId=${batchId}&tab=announcements`
        : "/student-profile/dashboard";
    } else if (role === "parent") {
      link = "/parent-panel/dashboard";
    } else if (role === "teacher") {
      link = batchId
        ? `/teacher-panel/batches`
        : "/teacher-panel/dashboard";
    }

    return {
      _id: ann._id,
      title: ann.title,
      message: ann.message,
      priority: ann.priority || "normal",
      targetType: ann.targetType,
      isPinned: ann.isPinned,
      batch: ann.batch ? { _id: ann.batch._id, name: ann.batch.name } : null,
      course: ann.course ? { _id: ann.course._id, title: ann.course.title } : null,
      createdBy: ann.createdBy ? { fullName: ann.createdBy.fullName, role: ann.createdBy.role } : null,
      createdAt: ann.createdAt,
      isRead,
      link,
    };
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  res.status(200).json({
    success: true,
    unreadCount,
    notifications,
  });
});

// @desc Mark single notification as read
// @route PATCH /api/notifications/:id/read
// @access Private
const markNotificationAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid notification ID." });
  }

  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { readAnnouncements: id },
  });

  res.status(200).json({
    success: true,
    message: "Notification marked as read.",
  });
});

// @desc Mark all notifications as read
// @route PATCH /api/notifications/mark-all-read
// @access Private
const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    $set: { lastNotificationReadAt: new Date() },
  });

  res.status(200).json({
    success: true,
    message: "All notifications marked as read.",
  });
});

module.exports = {
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
