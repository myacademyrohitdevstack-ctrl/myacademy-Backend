const Student = require("../Modals/Student");
const Teacher = require("../Modals/Teacher");
const sendEmail = require("../Utils/sendEmail");
const asyncHandler = require("../Utils/asyncHandler");
const User = require("../Modals/User");
const ClassLink = require("../Modals/ClassLink");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const Announcement = require("../Modals/Announcement");

const Course = require("../Modals/Courses");
const Batch = require("../Modals/Batches");
const Academy = require("../Modals/Academy");
const uploadToCloudinary = require("../Utils/Cloudinary");
const mongoose = require("mongoose");
const { assertResourceLimit, getUsageSummary } = require("../Utils/planEnforcer");

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

  const isAll = limit === "all" || limit === "0" || Number(limit) === 0;
  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = isAll ? 0 : Math.max(1, Math.min(Number(limit) || 10, 10000));
  const skip = isAll ? 0 : (currentPage - 1) * perPage;

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
    (() => {
      let q = User.find(filter)
        .select("-password -refreshToken")
        .sort(sortQuery);
      if (!isAll) {
        q = q.skip(skip).limit(perPage);
      }
      return q;
    })(),

    User.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    users,
    pagination: {
      page: currentPage,
      limit: isAll ? totalUsers : perPage,
      total: totalUsers,
      totalPages: isAll ? 1 : Math.ceil(totalUsers / (perPage || 1)),
      hasNextPage: isAll ? false : currentPage * perPage < totalUsers,
      hasPreviousPage: isAll ? false : currentPage > 1,
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

    if (req.user.role === "academy_staff") {
      if (user.role === "admin" || user.role === "academy_staff" || user.platformRole === "super_admin") {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Staff members cannot modify administrative accounts.",
        });
      }
      if (user.role === "student" && !req.user.permissions?.includes("students.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'students.update'.",
        });
      }
      if (user.role === "teacher" && !req.user.permissions?.includes("teachers.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'teachers.update'.",
        });
      }
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

    if (req.user.role === "academy_staff") {
      if (user.role === "admin" || user.role === "academy_staff" || user.platformRole === "super_admin") {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Staff members cannot modify administrative accounts.",
        });
      }
      if (user.role === "student" && !req.user.permissions?.includes("students.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'students.update'.",
        });
      }
      if (user.role === "teacher" && !req.user.permissions?.includes("teachers.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'teachers.update'.",
        });
      }
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

    if (req.user.role === "academy_staff") {
      if (user.role === "admin" || user.role === "academy_staff" || user.platformRole === "super_admin") {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Staff members cannot modify administrative accounts.",
        });
      }
      if (user.role === "student" && !req.user.permissions?.includes("students.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'students.update'.",
        });
      }
      if (user.role === "teacher" && !req.user.permissions?.includes("teachers.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'teachers.update'.",
        });
      }
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

    if (req.user.role === "academy_staff") {
      if (user.role === "admin" || user.role === "academy_staff" || user.platformRole === "super_admin") {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Staff members cannot modify administrative accounts.",
        });
      }
      if (user.role === "student" && !req.user.permissions?.includes("students.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'students.update'.",
        });
      }
      if (user.role === "teacher" && !req.user.permissions?.includes("teachers.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'teachers.update'.",
        });
      }
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

  if (req.user.role === "academy_staff") {
    if (user.role === "admin" || user.role === "academy_staff" || user.platformRole === "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Staff members cannot view administrative user profiles.",
      });
    }
    if (user.role === "student" && !req.user.permissions?.includes("students.read")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Required permission: 'students.read'.",
      });
    }
    if (user.role === "teacher" && !req.user.permissions?.includes("teachers.read")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Required permission: 'teachers.read'.",
      });
    }
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

  if (req.user.role === "academy_staff") {
    if (user.role === "admin" || user.role === "academy_staff" || user.platformRole === "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Staff members cannot modify administrative accounts.",
      });
    }
    if (updates.role && updates.role !== user.role) {
      return res.status(403).json({
        success: false,
        message: "Staff members cannot change user roles.",
      });
    }
    if (user.role === "student" && !req.user.permissions?.includes("students.update")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Required permission: 'students.update'.",
      });
    }
    if (user.role === "teacher" && !req.user.permissions?.includes("teachers.update")) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Required permission: 'teachers.update'.",
      });
    }
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
  // 1. Fetch recent students registered in this academy
  const recentUsers = await User.find({
    academyId: req.academy._id,
    role: "student",
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("fullName email status approvalStatus createdAt phone profileImage");

  if (!recentUsers || recentUsers.length === 0) {
    return res.status(200).json({
      success: true,
      count: 0,
      enrollments: [],
    });
  }

  // 2. Fetch active batches to map student batch & course assignments
  const batches = await Batch.find({
    academyId: req.academy._id,
    isDeleted: false,
  })
    .populate("course", "title")
    .select("name course students");

  const studentBatchMap = new Map();
  batches.forEach((batch) => {
    (batch.students || []).forEach((stId) => {
      const idStr = (stId._id || stId).toString();
      if (!studentBatchMap.has(idStr)) {
        studentBatchMap.set(idStr, {
          batch: batch.name,
          courseTitle: batch.course?.title || "N/A",
        });
      }
    });
  });

  // 3. Format enrollments with both modern object shape and backwards-compatible shape
  const enrollments = recentUsers.map((student) => {
    const batchInfo = studentBatchMap.get(student._id.toString());
    const courseTitle = batchInfo?.courseTitle || "General Cohort";
    const batchName = batchInfo?.batch || "Unassigned";

    return {
      _id: student._id,
      id: student._id,
      name: student.fullName,
      email: student.email,
      batch: batchName,
      course: {
        title: courseTitle,
      },
      student: {
        _id: student._id,
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        status: student.status,
        approvalStatus: student.approvalStatus,
      },
      status: student.approvalStatus || student.status || "active",
      enrolledAt: student.createdAt,
      createdAt: student.createdAt,
    };
  });

  return res.status(200).json({
    success: true,
    count: enrollments.length,
    enrollments,
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


const createStudent = asyncHandler(async (req, res) => {
  const { fullName, email, phone, courseId, batchId, password } = req.body;

  // Enforce SaaS plan student quota
  await assertResourceLimit(req.academy._id, "students", 1);

  const session = await mongoose.startSession();

  let createdUser;

  try {
    session.startTransaction();

    // Check existing user
    const existingUser = await User.findOne({
      email,
      academyId: req.academy._id,
      isDeleted: false,
    }).session(session);

    if (existingUser) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Student already exists.",
      });
    }

    // Validate Course
    const course = await Course.findOne({
      _id: courseId,
      academyId: req.academy._id,
      isDeleted: false,
    }).session(session);

    if (!course) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    // Validate Batch
    const batch = await Batch.findOne({
      _id: batchId,
      academyId: req.academy._id,
      course: courseId,
      isDeleted: false,
    }).session(session);

    if (!batch) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User
    const users = await User.create(
      [
        {
          fullName,
          email,
          phone,
          password: hashedPassword,
          role: "student",
          academyId: req.academy._id,
          approvalStatus: "approved",
          status: "active",
        },
      ],
      { session }
    );

    createdUser = users[0];

    // Create Student Profile
    await Student.create(
      [
        {
          user: createdUser._id,
          academyId: req.academy._id,
        },
      ],
      { session }
    );

    // Add student to batch
    batch.students.push(createdUser._id);
    await batch.save({ session });

    // Commit Transaction
    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw err;
  } finally {
    session.endSession();
  }

  // Send Email AFTER successful commit
  try {
    await sendEmail({
      to: createdUser.email,
      subject: "🎉 Welcome to My Academy",
      html: `
        <h2>Welcome ${createdUser.fullName},</h2>

        <p>Your student account has been created successfully.</p>

        <p><strong>Login Details</strong></p>

        <ul>
          <li><strong>Email:</strong> ${createdUser.email}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>

        <p>Please keep these credentials safe. You can change your password after logging in.</p>

        <br/>

        <p>Regards,</p>
        <p><strong>My Academy</strong></p>
      `,
    });
  } catch (err) {
    console.error("Student welcome email failed:", err.message);
  }

  return res.status(201).json({
    success: true,
    message: "Student created successfully.",
  });
});
const createTeacher = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  // Enforce SaaS plan staff quota
  await assertResourceLimit(req.academy._id, "staff", 1);

  const session = await mongoose.startSession();

  let createdUser;

  try {
    session.startTransaction();

    // Check existing user
    const existingUser = await User.findOne({
      email,
      academyId: req.academy._id,
      isDeleted: false,
    }).session(session);

    if (existingUser) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Teacher already exists.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const users = await User.create(
      [
        {
          fullName,
          email,
          phone,
          password: hashedPassword,
          role: "teacher",
          academyId: req.academy._id,
          approvalStatus: "approved",
          status: "active",
        },
      ],
      { session }
    );

    createdUser = users[0];
 // Create Student Profile
    await Teacher.create(
      [
        {
          user: createdUser._id,
          academyId: req.academy._id,
        },
      ],
      { session }
    );
    // Commit transaction
    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw err;
  } finally {
    session.endSession();
  }

  // Send email after successful commit
  try {
    await sendEmail({
      to: createdUser.email,
      subject: "🎉 Welcome to My Academy",
      html: `
        <h2>Welcome ${createdUser.fullName},</h2>

        <p>Your teacher account has been created successfully.</p>

        <p><strong>Login Details</strong></p>

        <ul>
          <li><strong>Email:</strong> ${createdUser.email}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>

        <p>Please keep these credentials safe. You can change your password after logging in.</p>

        <br/>

        <p>Regards,</p>
        <p><strong>My Academy</strong></p>
      `,
    });
  } catch (err) {
    console.error("Teacher welcome email failed:", err.message);
  }

  return res.status(201).json({
    success: true,
    message: "Teacher created successfully.",
  });
});
const deleteUserByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const user = await User.findOne({
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

    if (req.user.role === "academy_staff") {
      if (user.role === "admin" || user.role === "academy_staff" || user.platformRole === "super_admin") {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Staff members cannot modify administrative accounts.",
        });
      }
      if (user.role === "student" && !req.user.permissions?.includes("students.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'students.update'.",
        });
      }
      if (user.role === "teacher" && !req.user.permissions?.includes("teachers.update")) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Access denied. Required permission: 'teachers.update'.",
        });
      }
    }

    // Prevent deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account.",
      });
    }

    // Soft delete user
    user.isDeleted = true;
    await user.save({ session });

    if (user.role === "student") {
      await Student.findOneAndUpdate(
        {
          user: user._id,
          academyId: req.academy._id,
          isDeleted: false,
        },
        {
          $set: {
            isDeleted: true,
          },
        },
        { session }
      );

      await Batch.updateMany(
        {
          academyId: req.academy._id,
          students: user._id,
          isDeleted: false,
        },
        {
          $pull: {
            students: user._id,
          },
        },
        { session }
      );
    }

    if (user.role === "teacher") {
      await Teacher.findOneAndUpdate(
        {
          user: user._id,
          academyId: req.academy._id,
          isDeleted: false,
        },
        {
          $set: {
            isDeleted: true,
          },
        },
        { session }
      );

      await Batch.updateMany(
        {
          academyId: req.academy._id,
          trainers: user._id,
          isDeleted: false,
        },
        {
          $pull: {
            trainers: user._id,
          },
        },
        { session }
      );
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "User deleted successfully.",
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

const bulkCreateStudents = asyncHandler(async (req, res) => {
  const { courseId, batchId, students } = req.body;

  if (!courseId || !batchId) {
    return res.status(400).json({
      success: false,
      message: "Both Course and Batch must be selected to enroll students.",
    });
  }

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid list of students to import.",
    });
  }

  // Enforce SaaS plan student quota for bulk import
  await assertResourceLimit(req.academy._id, "students", students.length);

  const course = await Course.findOne({
    _id: courseId,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found.",
    });
  }

  const batch = await Batch.findOne({
    _id: batchId,
    academyId: req.academy._id,
    course: courseId,
    isDeleted: false,
  });

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Selected batch not found for this course.",
    });
  }

  const createdUsers = [];
  const skipped = [];
  const errors = [];
  const newStudentIds = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const rowNum = i + 1;
    const fullName = (s.fullName || s.name || "").trim();
    const email = (s.email || "").trim().toLowerCase();
    const phone = (s.phone || s.mobile || "").trim();
    const rawPassword = s.password ? String(s.password).trim() : `Student@${Math.floor(1000 + Math.random() * 9000)}`;

    if (!fullName || !email) {
      errors.push({
        row: rowNum,
        name: fullName || "Unnamed",
        email: email || "Missing email",
        reason: "Name and email are mandatory fields.",
      });
      continue;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push({
        row: rowNum,
        name: fullName,
        email,
        reason: "Invalid email format.",
      });
      continue;
    }

    const existing = await User.findOne({
      email,
      isDeleted: false,
    });

    if (existing) {
      if (existing.academyId && existing.academyId.toString() === req.academy._id.toString()) {
        const alreadyInBatch = (batch.students || []).some(
          (stId) => stId.toString() === existing._id.toString()
        );

        if (alreadyInBatch) {
          skipped.push({
            row: rowNum,
            name: fullName,
            email,
            reason: "Student already registered and already in this batch.",
          });
        } else {
          if (existing.role === "student") {
            newStudentIds.push(existing._id);
            createdUsers.push({
              _id: existing._id,
              fullName: existing.fullName,
              email: existing.email,
              phone: existing.phone,
              note: "Existing student added to batch",
            });
          } else {
            skipped.push({
              row: rowNum,
              name: fullName,
              email,
              reason: `Email belongs to an account with role '${existing.role}'.`,
            });
          }
        }
      } else {
        errors.push({
          row: rowNum,
          name: fullName,
          email,
          reason: "Email is already registered under another account or academy.",
        });
      }
      continue;
    }

    try {
      const hashedPassword = await bcrypt.hash(rawPassword, 10);
      const user = await User.create({
        fullName,
        email,
        phone,
        password: hashedPassword,
        role: "student",
        academyId: req.academy._id,
        approvalStatus: "approved",
        status: "active",
      });

      await Student.create({
        user: user._id,
        academyId: req.academy._id,
      });

      newStudentIds.push(user._id);
      createdUsers.push({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        temporaryPassword: rawPassword,
      });

      try {
        await sendEmail({
          to: user.email,
          subject: "🎉 Welcome to My Academy",
          html: `
            <h2>Welcome ${user.fullName},</h2>
            <p>Your student account has been created for batch <strong>${batch.name}</strong>.</p>
            <p><strong>Login Details:</strong></p>
            <ul>
              <li><strong>Email:</strong> ${user.email}</li>
              <li><strong>Password:</strong> ${rawPassword}</li>
            </ul>
            <p>Regards,<br/><strong>My Academy</strong></p>
          `,
        });
      } catch (emailErr) {}
    } catch (err) {
      errors.push({
        row: rowNum,
        name: fullName,
        email,
        reason: err.message || "Failed to create student account.",
      });
    }
  }

  if (newStudentIds.length > 0) {
    batch.students.push(...newStudentIds);
    await batch.save();
  }

  return res.status(200).json({
    success: true,
    message: `Batch import complete: ${createdUsers.length} enrolled, ${skipped.length} skipped, ${errors.length} failed.`,
    data: {
      importedCount: createdUsers.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      createdUsers,
      skipped,
      errors,
      batchName: batch.name,
      courseTitle: course.title,
    },
  });
});

const bulkCreateTeachers = asyncHandler(async (req, res) => {
  const { teachers } = req.body;

  if (!Array.isArray(teachers) || teachers.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid list of teachers to import.",
    });
  }

  // Enforce SaaS plan staff quota for bulk import
  await assertResourceLimit(req.academy._id, "staff", teachers.length);

  const createdUsers = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < teachers.length; i++) {
    const t = teachers[i];
    const rowNum = i + 1;
    const fullName = (t.fullName || t.name || "").trim();
    const email = (t.email || "").trim().toLowerCase();
    const phone = (t.phone || t.mobile || "").trim();
    const rawPassword = t.password ? String(t.password).trim() : `Teacher@${Math.floor(1000 + Math.random() * 9000)}`;

    if (!fullName || !email) {
      errors.push({
        row: rowNum,
        name: fullName || "Unnamed",
        email: email || "Missing email",
        reason: "Name and email are mandatory fields.",
      });
      continue;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push({
        row: rowNum,
        name: fullName,
        email,
        reason: "Invalid email format.",
      });
      continue;
    }

    const existing = await User.findOne({
      email,
      isDeleted: false,
    });

    if (existing) {
      skipped.push({
        row: rowNum,
        name: fullName,
        email,
        reason: existing.academyId && existing.academyId.toString() === req.academy._id.toString()
          ? `Account already exists in your academy with role '${existing.role}'.`
          : "Email is already registered under another account or academy.",
      });
      continue;
    }

    try {
      const hashedPassword = await bcrypt.hash(rawPassword, 10);
      const user = await User.create({
        fullName,
        email,
        phone,
        password: hashedPassword,
        role: "teacher",
        academyId: req.academy._id,
        approvalStatus: "approved",
        status: "active",
      });

      await Teacher.create({
        user: user._id,
        academyId: req.academy._id,
      });

      createdUsers.push({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        temporaryPassword: rawPassword,
      });

      try {
        await sendEmail({
          to: user.email,
          subject: "🎉 Welcome to My Academy - Faculty Account",
          html: `
            <h2>Welcome ${user.fullName},</h2>
            <p>Your teacher/faculty account has been created successfully.</p>
            <p><strong>Login Credentials:</strong></p>
            <ul>
              <li><strong>Email:</strong> ${user.email}</li>
              <li><strong>Password:</strong> ${rawPassword}</li>
            </ul>
            <p>Regards,<br/><strong>My Academy</strong></p>
          `,
        });
      } catch (emailErr) {}
    } catch (err) {
      errors.push({
        row: rowNum,
        name: fullName,
        email,
        reason: err.message || "Failed to create teacher account.",
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: `Teacher import complete: ${createdUsers.length} added, ${skipped.length} skipped, ${errors.length} failed.`,
    data: {
      importedCount: createdUsers.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      createdUsers,
      skipped,
      errors,
    },
  });
});

const getSubscriptionUsage = asyncHandler(async (req, res) => {
  const usage = await getUsageSummary(req.academy._id);
  res.status(200).json({
    success: true,
    data: usage,
  });
});

const getAcademyProfile = asyncHandler(async (req, res) => {
  if (!req.academy?._id) {
    return res.status(400).json({
      success: false,
      message: "No academy context found in session.",
    });
  }

  const academy = await Academy.findById(req.academy._id).populate("owner", "fullName email phone");

  if (!academy) {
    return res.status(404).json({
      success: false,
      message: "Academy not found.",
    });
  }

  res.status(200).json({
    success: true,
    academy,
  });
});

const updateAcademyProfile = asyncHandler(async (req, res) => {
  if (!req.academy?._id) {
    return res.status(400).json({
      success: false,
      message: "No academy context found in session.",
    });
  }

  const academy = await Academy.findById(req.academy._id);

  if (!academy) {
    return res.status(404).json({
      success: false,
      message: "Academy not found.",
    });
  }

  let logoUrl = req.body.logo;
  if (req.file) {
    const uploadRes = await uploadToCloudinary(req.file.buffer, "academy_logos");
    logoUrl = uploadRes.secure_url;
  }

  const {
    name,
    phone,
    supportPhone,
    email,
    tagline,
    website,
    isOnline,
    deliveryMode,
    address,
    city,
    state,
    pincode,
    country,
    taxNumber,
    currency,
    receiptPrefix,
    receiptNotes,
    signatoryName,
    signatoryTitle,
    signature,
  } = req.body;

  if (name !== undefined && name !== null) academy.name = String(name).trim();
  if (phone !== undefined && phone !== null) academy.phone = String(phone).trim();
  if (supportPhone !== undefined && supportPhone !== null) academy.supportPhone = String(supportPhone).trim();
  if (email !== undefined && email !== null) academy.email = String(email).trim().toLowerCase();
  if (tagline !== undefined && tagline !== null) academy.tagline = String(tagline).trim();
  if (website !== undefined && website !== null) academy.website = String(website).trim();
  if (isOnline !== undefined && isOnline !== null) {
    academy.isOnline = isOnline === true || isOnline === "true";
  }
  if (deliveryMode !== undefined && deliveryMode !== null) {
    academy.deliveryMode = deliveryMode;
    if (deliveryMode === "online") {
      academy.isOnline = true;
    }
  }
  if (address !== undefined && address !== null) academy.address = String(address).trim();
  if (city !== undefined && city !== null) academy.city = String(city).trim();
  if (state !== undefined && state !== null) academy.state = String(state).trim();
  if (pincode !== undefined && pincode !== null) academy.pincode = String(pincode).trim();
  if (country !== undefined && country !== null) academy.country = String(country).trim();
  if (taxNumber !== undefined && taxNumber !== null) academy.taxNumber = String(taxNumber).trim();
  if (currency !== undefined && currency !== null) academy.currency = String(currency).trim();
  if (receiptPrefix !== undefined && receiptPrefix !== null) academy.receiptPrefix = String(receiptPrefix).trim();
  if (receiptNotes !== undefined && receiptNotes !== null) academy.receiptNotes = String(receiptNotes).trim();
  if (signatoryName !== undefined && signatoryName !== null) academy.signatoryName = String(signatoryName).trim();
  if (signatoryTitle !== undefined && signatoryTitle !== null) academy.signatoryTitle = String(signatoryTitle).trim();
  if (logoUrl !== undefined && logoUrl !== null) academy.logo = logoUrl;
  if (signature !== undefined && signature !== null) academy.signature = signature;

  await academy.save();

  res.status(200).json({
    success: true,
    message: "Academy details saved successfully.",
    academy,
  });
});

module.exports = {
  getSubscriptionUsage,
  getAcademyProfile,
  updateAcademyProfile,
  getUsers,
  approveUser,
  getallClasses,
  getallAnnouncement,
  createStudent,
  getRecentEnrollments,
  rejectUser,
  blockUser,
  unblockUser,
  getUserById,
  updateUserByAdmin,
  getDashboardStats,
  deleteUserByAdmin,
  createTeacher,
  bulkCreateStudents,
  bulkCreateTeachers,
};
