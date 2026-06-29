const Announcement = require("../Modals/Announcement");
const asyncHandler = require("../Utils/asyncHandler");
const Course = require("../Modals/Courses");
const Batch = require("../Modals/Batches");
const User = require("../Modals/User");

const createAnnouncement = asyncHandler(
  async (req, res) => {
  
    const announcement = await Announcement.create({
  ...req.body,
  academyId: req.academy._id,
  createdBy: req.user._id,
});

    res.status(201).json({
      success: true,
      message:"Annoucement Sent Successfully",
      announcement,
    });
  }
);

/**
 * @desc Get All Announcements
 * @route GET /api/announcements
 */
const getAnnouncements = asyncHandler(
  async (req, res) => {
    const {
      targetType,
      priority,
      search,
    } = req.query;

   const query = {
  isDeleted: false,
  academyId: req.academy._id,
};

    if (targetType) {
      query.targetType = targetType;
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

    const announcements =
      await Announcement.find(query)
        .populate(
          "createdBy",
          "fullName"
        )
        .populate("batch", "name")
        .populate("course", "title")
        .sort({
          pinned: -1,
          createdAt: -1,
        });

    res.status(200).json({
      success: true,
      count: announcements.length,
      announcements,
    });
  }
);

/**
 * @desc Get Single Announcement
 * @route GET /api/announcements/:id
 */
const getAnnouncementById =
  asyncHandler(async (req, res) => {
   const announcement = await Announcement.findOne({
  _id: req.params.id,
  academyId: req.academy._id,
    isDeleted:false
})
        .populate(
          "createdBy",
          "fullName"
        )
        .populate("batch", "name")
        .populate("course", "title");

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message:
          "Announcement not found",
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
const updateAnnouncement =
  asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({
  _id: req.params.id,
  academyId: req.academy._id,
    isDeleted:false
});

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message:
          "Announcement not found",
      });
    }

const updatedAnnouncement = await Announcement.findOneAndUpdate(
  {
    _id: req.params.id,
    academyId: req.academy._id,
      isDeleted:false
  },
  req.body,
  {
    new: true,
    runValidators: true,
  }
);

    res.status(200).json({
      success: true,
      announcement:
        updatedAnnouncement,
    });
  });

/**
 * @desc Delete Announcement
 * @route DELETE /api/announcements/:id
 */
const deleteAnnouncement =
  asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOneAndUpdate(
  {
    _id: req.params.id,
    academyId: req.academy._id,
    isDeleted: false,
  },
  {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: req.user._id,
  },
  {
    new: true,
  }
);

if (!announcement) {
  return res.status(404).json({
    success: false,
    message: "Announcement not found",
  });
}

    res.status(200).json({
      success: true,
      message:
        "Announcement deleted successfully",
    });
  });

/**
 * @desc Get Batch Announcements
 * @route GET /api/announcements/batch/:batchId
 */
const getBatchAnnouncements =
  asyncHandler(async (req, res) => {
  const batch = await Batch.findOne({
  _id: req.params.batchId,
  academyId: req.academy._id,
    isDeleted:false
}).select("course");
if (!batch) {
  return res.status(404).json({
    success: false,
    message: "Batch not found",
  });
}
const announcements = await Announcement.find({
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
      targetType: "system",
    },
  ],
})
    .populate("createdBy", "fullName")
    .sort({
      pinned: -1,
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
const getCourseAnnouncements =
  asyncHandler(async (req, res) => {
      const course = await Course.findOne({
  _id: req.params.courseId,
  academyId: req.academy._id,
    isDeleted:false
})
if (!course) {
  return res.status(404).json({
    success: false,
    message: "Course not found",
  });
}
    const announcements =
      await Announcement.find({
  academyId: req.academy._id,
  course: req.params.courseId,
  isDeleted: false,
})
        .populate(
          "createdBy",
          "fullName"
        )
        .sort({
          pinned: -1,
          createdAt: -1,
        });

    res.status(200).json({
      success: true,
      count: announcements.length,
      announcements,
    });
  });

/**
 * @desc Get System Announcements
 * @route GET /api/announcements/system/all
 */
const getSystemAnnouncements =
  asyncHandler(async (req, res) => {
    const announcements =
      await Announcement.find({
  academyId: req.academy._id,
  targetType: "system",
  isDeleted: false,
})
        .populate(
          "createdBy",
          "fullName"
        )
        .sort({
          pinned: -1,
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