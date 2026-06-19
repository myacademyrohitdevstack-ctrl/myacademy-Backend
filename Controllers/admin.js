const asyncHandler = require("../Utils/asyncHandler");
const User = require("../Modals/User");

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
const Student = require("../Modals/Student");
const Teacher = require("../Modals/Teacher");
const sendEmail = require("../Utils/sendEmail");

const approveUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  if (user.approvalStatus === "approved") {
    return res.status(400).json({
      success: false,
      message: "User is already approved.",
    });
  }

  let profile;

  if (user.role === "student") {
     await Student.create({
      user: user._id,
    });

   
  }

  if (user.role === "teacher") {
    await Teacher.create({
      user: user._id,
    });

  }

  user.approvalStatus = "approved";

  await user.save();

  await sendEmail({
    to: user.email,
    subject: "Account Approved",
    html: `
      <h2>Congratulations 🎉</h2>

      <p>Your account has been approved by the administrator.</p>

      <p>You can now login to Inquisitive Mind Academy.</p>
    `,
  });

  return res.status(200).json({
    success: true,
    message: "User approved successfully.",
  });
});
module.exports = {
  getUsers,approveUser
};