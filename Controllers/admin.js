const Student = require("../Modals/Student");
const Teacher = require("../Modals/Teacher");
const sendEmail = require("../Utils/sendEmail");
const asyncHandler = require("../Utils/asyncHandler");
const User = require("../Modals/User");

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

  if (role) filter.role = role;

  if (approvalStatus) filter.approvalStatus = approvalStatus;

  if (status) filter.status = status;

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

  const [users, totalUsers] = await Promise.all([
    User.find(filter)
      .select("-password -refreshTokens")
      .sort(sortQuery)
      .skip(skip)
      .limit(perPage),

    User.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: users,
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

     user = await User.findById(id).session(session);

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
      }).session(session);

      if (!existingStudent) {
        await Student.create(
          [
            {
              user: user._id,
            },
          ],
          { session }
        );
      }
    }

    if (user.role === "teacher") {
      const existingTeacher = await Teacher.findOne({
        user: user._id,
      }).session(session);

      if (!existingTeacher) {
        await Teacher.create(
          [
            {
              user: user._id,
            },
          ],
          { session }
        );
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

    user = await User.findById(id).session(session);

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

    user = await User.findById(id).session(session);

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

    user = await User.findById(id).session(session);

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

module.exports = rejectUser;
module.exports = {
  getUsers,approveUser,rejectUser,blockUser,unblockUser
};