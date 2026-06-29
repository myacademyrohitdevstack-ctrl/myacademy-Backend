const Student = require("../Modals/Student");
const Teacher = require("../Modals/Teacher");
const sendEmail = require("../Utils/sendEmail");
const asyncHandler = require("../Utils/asyncHandler");
const User = require("../Modals/User");
const ClassLink = require("../Modals/ClassLink");

const Announcement = require("../Modals/Announcement");

const Course = require("../Modals/Courses");
const Batch = require("../Modals/Batches");
const mongoose = require("mongoose");

const getUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    role,
    approvalStatus,
    status,
    sort = "newest",
  } = req.query;

  const currentPage = Math.max(Number(page), 1);
  const perPage = Math.min(Number(limit), 100);
  const skip = (currentPage - 1) * perPage;

  const filter = {};

  if (role && role !== "all") filter.role = role;

  if (approvalStatus && approvalStatus !== "all") filter.approvalStatus = approvalStatus;

  if (status && status !=="all") filter.status = status;

  if (search) {
    filter.$or = [
      {
        fullName: {
          $regex: search,
          $options: "i",
        },
      },
      {
        email: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  let sortQuery = {};

  switch (sort) {
    case "oldest":
      sortQuery.createdAt = 1;
      break;

    case "name":
      sortQuery.fullName = 1;
      break;

    default:
      sortQuery.createdAt = -1;
  }
 filter.academyId = req.academy._id;
filter.isDeleted = false;

  const [users, totalUsers] = await Promise.all([
    User.find(filter)
      .select("-password -refreshToken")
      .sort(sortQuery)
      .skip(skip)
      .limit(perPage),

    User.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    users,
    pagination: {
      page: currentPage,
      limit: perPage,
      total: totalUsers,
      totalPages: Math.ceil(totalUsers / perPage),
      hasNextPage: currentPage * perPage < totalUsers,
      hasPreviousPage: currentPage > 1,
    },
  });
});



const approveUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();
  let user;
  try {
    session.startTransaction();

     user = await User.findOne({
  _id: id,
  academyId: req.academy._id,
  isDeleted:false
}).session(session);

    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.approvalStatus === "approved") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "User is already approved.",
      });
    }

    if (user.role === "student") {
    const existingStudent = await Student.findOne({
  user: user._id,
  academyId: req.academy._id,
  isDeleted: false,
}).session(session);

if (!existingStudent) {
  await Student.create(
    [
      {
        user: user._id,
        academyId: req.academy._id,
      },
    ],
    { session }
  );
}
    }

    if (user.role === "teacher") {
      const existingTeacher = await Teacher.findOne({
        user: user._id,
          isDeleted:false,
          academyId:req.academy._id
      }).session(session);

      if (!existingTeacher) {
       await Teacher.create([{
  user: user._id,
  academyId: req.academy._id
}], { session });
      }
    }

    user.approvalStatus = "approved";

    await user.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  // Send email AFTER successful commit
  try {
    await sendEmail({
      to: user.email,
      subject: "🎉 Your Account Has Been Approved",
      html: `
        <h2>Congratulations ${user.fullName}!</h2>

        <p>Your account has been approved by the administrator.</p>

        <p>You can now login to <strong>Inquisitive Mind Academy</strong> and begin your learning journey.</p>

        <p>Happy Learning!</p>
      `,
    });
  } catch (err) {
    console.error("Approval email failed:", err.message);
  }

  return res.status(200).json({
    success: true,
    message: "User approved successfully.",
  });
});



const rejectUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const session = await mongoose.startSession();

  let user;

  try {
    session.startTransaction();

user = await User.findOne({
  _id: id,
  academyId: req.academy._id,
  isDeleted: false,
}).session(session);

    if (!user) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.approvalStatus === "rejected") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "User is already rejected.",
      });
    }

    if (user.approvalStatus === "approved") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Approved users cannot be rejected.",
      });
    }

    user.approvalStatus = "rejected";
    user.rejectionReason = reason;
    user.rejectedAt = new Date();
    user.rejectedBy = req.user.id;

    await user.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  try {
    await sendEmail({
      to: user.email,
      subject: "Account Registration Update",
      html: `
        <h2>Hello ${user.fullName},</h2>

        <p>Unfortunately, your registration request has been rejected.</p>

        <p><strong>Reason:</strong></p>

        <p>${reason}</p>

        <p>If you believe this is a mistake, please contact the academy.</p>

        <br/>

        <p>Inquisitive Mind Academy</p>
      `,
    });
  } catch (err) {
    console.error("Reject email failed:", err.message);
  }

  return res.status(200).json({
    success: true,
    message: "User rejected successfully.",
  });
});


const blockUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const session = await mongoose.startSession();

  let user;

  try {
    session.startTransaction();

    user = await User.findOne({
  _id: id,
  academyId: req.academy._id,
    isDeleted:false
}).session(session)

    if (!user) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.approvalStatus !== "approved") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Only approved users can be blocked.",
      });
    }

    if (user.status === "blocked") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "User is already blocked.",
      });
    }

    user.status = "blocked";
    user.blockReason = reason;
    user.blockedAt = new Date();
    // user.blockedBy = req.user.id;

    await user.save({ session });

    await session.commitTransaction();

  } catch (error) {

    await session.abortTransaction();
    throw error;

  } finally {

    session.endSession();

  }

  try {
    await sendEmail({
      to: user.email,
      subject: "Account Temporarily Blocked",
      html: `
        <h2>Hello ${user.fullName}</h2>

        <p>Your account has been temporarily blocked.</p>

        <p><strong>Reason:</strong></p>

        <p>${reason}</p>

        <p>If you believe this is incorrect, please contact the academy.</p>
      `,
    });
  } catch (err) {
    console.error("Block email failed:", err.message);
  }

  return res.status(200).json({
    success: true,
    message: "User blocked successfully.",
  });
});
const unblockUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();

  let user;

  try {
    session.startTransaction();

    user = await User.findOne({
  _id: id,
  academyId: req.academy._id,
    isDeleted:false
}).session(session)

    if (!user) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.status !== "blocked") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "User is not blocked.",
      });
    }

    user.status = "active";
    user.blockReason = null;
    user.blockedAt = null;
    user.blockedBy = null;

    await user.save({ session });

    await session.commitTransaction();

  } catch (error) {

    await session.abortTransaction();
    throw error;

  } finally {

    session.endSession();

  }

  try {
    await sendEmail({
      to: user.email,
      subject: "Account Restored",
      html: `
        <h2>Hello ${user.fullName}</h2>

        <p>Your account has been restored.</p>

        <p>You can now login to Inquisitive Mind Academy.</p>
      `,
    });
  } catch (err) {
    console.error("Unblock email failed:", err.message);
  }

  return res.status(200).json({
    success: true,
    message: "User unblocked successfully.",
  });
});
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user id.",
    });
  }

const user = await User.findOne({
  _id: id,
  academyId: req.academy._id,
    isDeleted:false
}).select("-password -refreshToken");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  return res.status(200).json({
    success: true,
    user,
  });
});
const updateUserByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const allowedFields = [
    "fullName",
    "email",
    "phone",
    "role",
  ];

  const updates = {};

  for (const [key, value] of Object.entries(req.body)) {
    if (allowedFields.includes(key)) {
      updates[key] = value;
    }
  }

const user = await User.findOne({
  _id: id,
  academyId: req.academy._id,
  isDeleted: false,
});

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

const updatedUser = await User.findOneAndUpdate(
  {
    _id: id,
    academyId: req.academy._id,
      isDeleted:false
  },
  { $set: updates },
  {
    new: true,
    runValidators: true,
  }
).select("-password -refreshToken");

  return res.status(200).json({
    success: true,
    message: "User updated successfully.",
    user: updatedUser,
  });
});



const getDashboardStats = asyncHandler(

  async (req, res) => {
    const academyId = req.academy._id;
    const [
      totalStudents,
      approvedStudents,
      totalTeachers,
      pendingStudents,
      blockedStudents,
      totalCourses,
      publishedCourses,
      totalBatches,
      activeBatches,
    ] = await Promise.all([
    Student.countDocuments({ academyId,  isDeleted:false }),

User.countDocuments({
  academyId,
  role: "student",
  approvalStatus: "approved",
    isDeleted:false
}),

User.countDocuments({
  academyId,
  role: "teacher",
  approvalStatus: "approved",
    isDeleted:false
}),

User.countDocuments({
  academyId,
  role: "student",
  approvalStatus: "pending",
    isDeleted:false
}),

User.countDocuments({
  academyId,
  status: "blocked",
    isDeleted:false
}),

Course.countDocuments({ academyId,  isDeleted:false }),

Course.countDocuments({
  academyId,
  status: "published",
    isDeleted:false
}),

Batch.countDocuments({ academyId,  isDeleted:false }),

Batch.countDocuments({
  academyId,
  status: "active",
    isDeleted:false
}),
    ]);

    res.status(200).json({
      success: true,

      stats: {
        totalStudents,
        approvedStudents,
        pendingStudents,
        blockedStudents,
totalTeachers,
        totalCourses,
        publishedCourses,

        totalBatches,
        activeBatches,
      },
    });
  }
);


const getRecentEnrollments = asyncHandler(async (req, res) => {
  const batches = await Batch.find({
  academyId: req.academy._id,
    isDeleted:false
})
.populate("course", "title")
.populate("students", "fullName email status approvalStatus createdAt")
.sort({ createdAt: -1 });

 const enrollmentMap = new Map();

batches.forEach((batch) => {
  batch.students.forEach((student) => {
    if (!enrollmentMap.has(student._id.toString())) {
      enrollmentMap.set(student._id.toString(), {
        id: student._id,
        name: student.fullName,
        batch: batch.name,
        course: batch.course?.title || "N/A",
        status: student.approvalStatus,
        enrolledAt: student.createdAt,
      });
    }
  });
});

const enrollments = Array.from(
  enrollmentMap.values()
);

  enrollments.sort(
    (a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt)
  );

  return res.status(200).json({
    success: true,
    count: enrollments.length,
    enrollments: enrollments.slice(0, 10), // latest 20
  });
});
const getallClasses = asyncHandler(async (req, res) => {

const classes = await ClassLink.find({
  academyId: req.academy._id,
  isDeleted: false
})
.sort({ meetingDate: -1 })
.limit(5);

  return res.status(200).json({
    success: true,
    classes, // latest 20
  });
});
const getallAnnouncement = asyncHandler(async (req, res) => {

const announcements = await Announcement.find({
  academyId: req.academy._id,
  isDeleted: false
})
.sort({
    pinned: -1,
    createdAt: -1,
})
.limit(5);
  return res.status(200).json({
    success: true,
    announcements, // latest 20
  });
});



module.exports = {
  getUsers,approveUser,getallClasses,getallAnnouncement ,getRecentEnrollments,rejectUser,blockUser,unblockUser,getUserById,updateUserByAdmin,getDashboardStats
};