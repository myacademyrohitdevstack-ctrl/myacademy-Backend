const Announcement = require("../Modals/Announcement");
const asyncHandler = require("../Utils/asyncHandler");
const Course = require("../Modals/Courses");
const Batch = require("../Modals/Batches");
const User = require("../Modals/User");

/**
 * @desc Create Announcement
 * @route POST /api/announcements/create
 * @access Private (Admin, Teacher)
 */
const createAnnouncement = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const academyId = req.academy._id;
  const {
    title,
    message,
    targetType: rawTargetType,
    course: rawCourse,
    batch: rawBatch,
    priority = "normal",
    publishAt: rawPublishAt,
    expiresAt: rawExpiresAt,
    isPinned,
    isPublished,
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({
      success: false,
      message: "Title is required.",
    });
  }

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: "Message is required.",
    });
  }

  // Normalize targetType: "system" and "academy" both target the whole academy
  let targetType = rawTargetType || "system";
  if (targetType === "entire-academy" || targetType === "academy") {
    targetType = "system";
  }

  let courseId = rawCourse || null;
  let batchId = rawBatch || null;

  if (targetType === "system") {
    // Entire Academy broadcast: ONLY admin (or super_admin)
    if (role !== "admin" && req.user.platformRole !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only academy administrators can broadcast announcements to the entire academy.",
      });
    }
    courseId = null;
    batchId = null;
  } else if (targetType === "course") {
    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course is required for course-level announcements.",
      });
    }

    const course = await Course.findOne({
      _id: courseId,
      academyId,
      isDeleted: false,
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    if (role === "teacher") {
      // Teacher must train at least one batch in this course
      const hasBatch = await Batch.exists({
        course: courseId,
        academyId,
        trainers: req.user._id,
        isDeleted: false,
      });
      if (!hasBatch) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to broadcast to this course.",
        });
      }
    }

    batchId = null;
  } else if (targetType === "batch") {
    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "Batch is required for batch announcements.",
      });
    }

    const batch = await Batch.findOne({
      _id: batchId,
      academyId,
      isDeleted: false,
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    if (
      role === "teacher" &&
      !batch.trainers.some(
        (trainer) => trainer.toString() === req.user._id.toString()
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to create announcements for this batch.",
      });
    }

    courseId = batch.course;
  } else {
    return res.status(400).json({
      success: false,
      message: "Invalid target type.",
    });
  }

  // Parse publish date (default to now if not provided or empty)
  let publishAt = new Date();
  if (rawPublishAt && String(rawPublishAt).trim() !== "") {
    const parsed = new Date(rawPublishAt);
    if (!isNaN(parsed.getTime())) {
      publishAt = parsed;
    }
  }

  // Parse expiry date
  let expiresAt = null;
  if (rawExpiresAt && String(rawExpiresAt).trim() !== "") {
    const parsed = new Date(rawExpiresAt);
    if (!isNaN(parsed.getTime())) {
      expiresAt = parsed;
    }
  }

  // Booleans: default isPublished to TRUE unless explicitly false
  const pinned = isPinned === true || isPinned === "true";
  const published = isPublished !== false && isPublished !== "false";

  const announcement = await Announcement.create({
    academyId,
    title: title.trim(),
    message: message.trim(),
    targetType,
    course: courseId,
    batch: batchId,
    priority: ["low", "normal", "high", "urgent"].includes(priority)
      ? priority
      : "normal",
    publishAt,
    expiresAt,
    isPinned: pinned,
    isPublished: published,
    createdBy: req.user._id,
  });

  const populated = await Announcement.findById(announcement._id)
    .populate("createdBy", "fullName role")
    .populate("batch", "name")
    .populate("course", "title");

  res.status(201).json({
    success: true,
    message: "Announcement created successfully.",
    announcement: populated,
  });
});

/**
 * @desc Get All Announcements
 * @route GET /api/announcements
 */
const getAnnouncements = asyncHandler(async (req, res) => {
  const { targetType, priority, search } = req.query;

  const query = {
    isDeleted: false,
    academyId: req.academy._id,
  };

  if (targetType) {
    if (targetType === "system" || targetType === "academy") {
      query.targetType = { $in: ["system", "academy"] };
    } else {
      query.targetType = targetType;
    }
  }

  if (priority) {
    query.priority = priority;
  }

  if (search) {
    query.title = {
      $regex: search,
      $options: "i",
    };
  }

  const announcements = await Announcement.find(query)
    .populate("createdBy", "fullName role")
    .populate("batch", "name")
    .populate("course", "title")
    .sort({
      isPinned: -1,
      publishAt: -1,
      createdAt: -1,
    });

  res.status(200).json({
    success: true,
    count: announcements.length,
    announcements,
  });
});

/**
 * @desc Get Single Announcement
 * @route GET /api/announcements/:id
 */
const getAnnouncementById = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({
    _id: req.params.id,
    academyId: req.academy._id,
    isDeleted: false,
  })
    .populate("createdBy", "fullName role")
    .populate("batch", "name")
    .populate("course", "title");

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: "Announcement not found",
    });
  }

  res.status(200).json({
    success: true,
    announcement,
  });
});

/**
 * @desc Update Announcement
 * @route PUT /api/announcements/:id
 */
const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({
    _id: req.params.id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: "Announcement not found",
    });
  }

  // Teachers can update only their own announcements
  if (
    req.user.role === "teacher" &&
    announcement.createdBy.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to update this announcement.",
    });
  }

  const updatedAnnouncement = await Announcement.findOneAndUpdate(
    {
      _id: req.params.id,
      academyId: req.academy._id,
      isDeleted: false,
    },
    req.body,
    {
      new: true,
      runValidators: true,
    }
  )
    .populate("createdBy", "fullName role")
    .populate("batch", "name")
    .populate("course", "title");

  res.status(200).json({
    success: true,
    announcement: updatedAnnouncement,
  });
});

/**
 * @desc Delete Announcement
 * @route DELETE /api/announcements/:id/delete
 */
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({
    _id: req.params.id,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: "Announcement not found.",
    });
  }

  // Teachers can delete only their own announcements
  if (
    req.user.role === "teacher" &&
    announcement.createdBy.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to delete this announcement.",
    });
  }

  announcement.isDeleted = true;
  announcement.deletedAt = new Date();
  announcement.deletedBy = req.user._id;

  await announcement.save();

  res.status(200).json({
    success: true,
    message: "Announcement deleted successfully.",
  });
});

/**
 * @desc Get Batch Announcements (Batch + Course + Entire Academy)
 * @route GET /api/announcements/:batchId/announcements
 */
const getBatchAnnouncements = asyncHandler(async (req, res) => {
  const batch = await Batch.findOne({
    _id: req.params.batchId,
    academyId: req.academy._id,
    isDeleted: false,
  }).select("course");

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found",
    });
  }

  const filter = {
    academyId: req.academy._id,
    isDeleted: false,
    $or: [
      {
        targetType: "batch",
        batch: req.params.batchId,
      },
      {
        targetType: "course",
        course: batch.course,
      },
      {
        targetType: { $in: ["system", "academy"] },
      },
    ],
  };

  // Students see only published announcements
  if (req.user.role === "student") {
    filter.isPublished = true;
  }

  const announcements = await Announcement.find(filter)
    .populate("createdBy", "fullName role")
    .populate("batch", "name")
    .populate("course", "title")
    .sort({
      isPinned: -1,
      publishAt: -1,
      createdAt: -1,
    });

  res.status(200).json({
    success: true,
    count: announcements.length,
    announcements,
  });
});

/**
 * @desc Get Course Announcements
 * @route GET /api/announcements/course/:courseId
 */
const getCourseAnnouncements = asyncHandler(async (req, res) => {
  const course = await Course.findOne({
    _id: req.params.courseId,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const filter = {
    academyId: req.academy._id,
    course: req.params.courseId,
    isDeleted: false,
  };

  if (req.user.role === "student") {
    filter.isPublished = true;
  }

  const announcements = await Announcement.find(filter)
    .populate("createdBy", "fullName role")
    .populate("batch", "name")
    .populate("course", "title")
    .sort({
      isPinned: -1,
      publishAt: -1,
      createdAt: -1,
    });

  res.status(200).json({
    success: true,
    count: announcements.length,
    announcements,
  });
});

/**
 * @desc Get System (Entire Academy) Announcements
 * @route GET /api/announcements/system/all
 */
const getSystemAnnouncements = asyncHandler(async (req, res) => {
  const filter = {
    academyId: req.academy._id,
    targetType: { $in: ["system", "academy"] },
    isDeleted: false,
  };

  if (req.user.role === "student") {
    filter.isPublished = true;
  }

  const announcements = await Announcement.find(filter)
    .populate("createdBy", "fullName role")
    .sort({
      isPinned: -1,
      publishAt: -1,
      createdAt: -1,
    });

  res.status(200).json({
    success: true,
    count: announcements.length,
    announcements,
  });
});

module.exports = {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  getBatchAnnouncements,
  getCourseAnnouncements,
  getSystemAnnouncements,
};
