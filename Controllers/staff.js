const bcrypt = require("bcryptjs");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");
const {
  VALID_PERMISSIONS_LIST,
  PERMISSION_CATEGORIES,
} = require("../Utils/permissions");
const { validatePasswordStrength } = require("../Utils/passwordValidator");

/**
 * Returns permission categories & allowlist for UI rendering and preset grouping.
 */
const getStaffCatalog = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    categories: PERMISSION_CATEGORIES,
    validPermissions: VALID_PERMISSIONS_LIST,
  });
});

/**
 * Lists all staff members belonging to the current academy.
 */
const getStaffMembers = asyncHandler(async (req, res) => {
  const staff = await User.find({
    academyId: req.academy._id,
    role: "academy_staff",
    isDeleted: { $ne: true },
  })
    .select("-password")
    .populate("invitedBy", "fullName email")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: staff.length,
    staff,
  });
});

/**
 * Retrieves a single staff member by ID within the current academy.
 */
const getStaffMemberById = asyncHandler(async (req, res) => {
  const staff = await User.findOne({
    _id: req.params.id,
    academyId: req.academy._id,
    role: "academy_staff",
    isDeleted: { $ne: true },
  })
    .select("-password")
    .populate("invitedBy", "fullName email");

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found in this academy.",
    });
  }

  return res.status(200).json({
    success: true,
    staff,
  });
});

/**
 * Creates / onboards a new staff member with explicit permissions.
 */
const createStaffMember = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, staffTitle, permissions } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Full name, email, and password are required.",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Validate password strength if validator exists, or enforce min length 8
  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters long.",
    });
  }

  // Check email uniqueness
  const existingUser = await User.findOne({
    email: normalizedEmail,
    isDeleted: { $ne: true },
  });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "An account with this email address already exists.",
    });
  }

  // Validate permissions against server-controlled allowlist
  const requestedPermissions = Array.isArray(permissions) ? permissions : [];
  const invalidPermissions = requestedPermissions.filter(
    (p) => !VALID_PERMISSIONS_LIST.includes(p)
  );

  if (invalidPermissions.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid permissions provided: ${invalidPermissions.join(", ")}`,
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const staffUser = await User.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: phone ? phone.trim() : "",
    password: hashedPassword,
    role: "academy_staff",
    staffTitle: staffTitle ? staffTitle.trim() : "",
    permissions: requestedPermissions,
    academyId: req.academy._id,
    approvalStatus: "approved",
    status: "active",
    invitedBy: req.user._id,
  });

  const createdStaff = await User.findById(staffUser._id)
    .select("-password")
    .populate("invitedBy", "fullName email");

  return res.status(201).json({
    success: true,
    message: "Staff member created successfully.",
    staff: createdStaff,
  });
});

/**
 * Updates staff permissions (validated against allowlist).
 */
const updateStaffPermissions = asyncHandler(async (req, res) => {
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({
      success: false,
      message: "Permissions must be an array of valid permission keys.",
    });
  }

  const invalidPermissions = permissions.filter(
    (p) => !VALID_PERMISSIONS_LIST.includes(p)
  );

  if (invalidPermissions.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid permissions provided: ${invalidPermissions.join(", ")}`,
    });
  }

  const staff = await User.findOne({
    _id: req.params.id,
    academyId: req.academy._id,
    role: "academy_staff",
    isDeleted: { $ne: true },
  });

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found in this academy.",
    });
  }

  staff.permissions = permissions;
  await staff.save();

  const updatedStaff = await User.findById(staff._id)
    .select("-password")
    .populate("invitedBy", "fullName email");

  return res.status(200).json({
    success: true,
    message: "Staff permissions updated successfully.",
    staff: updatedStaff,
  });
});

/**
 * Updates staff profile details (name, phone, title).
 */
const updateStaffProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, staffTitle } = req.body;

  const staff = await User.findOne({
    _id: req.params.id,
    academyId: req.academy._id,
    role: "academy_staff",
    isDeleted: { $ne: true },
  });

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found in this academy.",
    });
  }

  if (fullName !== undefined) staff.fullName = fullName.trim();
  if (phone !== undefined) staff.phone = phone.trim();
  if (staffTitle !== undefined) staff.staffTitle = staffTitle.trim();

  await staff.save();

  const updatedStaff = await User.findById(staff._id)
    .select("-password")
    .populate("invitedBy", "fullName email");

  return res.status(200).json({
    success: true,
    message: "Staff profile updated successfully.",
    staff: updatedStaff,
  });
});

/**
 * Toggles staff status (active / blocked).
 */
const updateStaffStatus = asyncHandler(async (req, res) => {
  const { status, blockReason } = req.body;

  if (!["active", "blocked"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be either 'active' or 'blocked'.",
    });
  }

  const staff = await User.findOne({
    _id: req.params.id,
    academyId: req.academy._id,
    role: "academy_staff",
    isDeleted: { $ne: true },
  });

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found in this academy.",
    });
  }

  staff.status = status;
  if (status === "blocked") {
    staff.blockedAt = new Date();
    staff.blockedBy = req.user._id;
    staff.blockReason = blockReason || "Suspended by academy owner";
  } else {
    staff.blockedAt = null;
    staff.blockedBy = null;
    staff.blockReason = null;
  }

  await staff.save();

  const updatedStaff = await User.findById(staff._id)
    .select("-password")
    .populate("invitedBy", "fullName email");

  return res.status(200).json({
    success: true,
    message: `Staff member has been ${status === "blocked" ? "suspended" : "activated"}.`,
    staff: updatedStaff,
  });
});

/**
 * Soft deletes a staff member.
 */
const deleteStaffMember = asyncHandler(async (req, res) => {
  const staff = await User.findOne({
    _id: req.params.id,
    academyId: req.academy._id,
    role: "academy_staff",
    isDeleted: { $ne: true },
  });

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found in this academy.",
    });
  }

  staff.isDeleted = true;
  staff.deletedAt = new Date();
  staff.deletedBy = req.user._id;
  await staff.save();

  return res.status(200).json({
    success: true,
    message: "Staff member removed successfully.",
  });
});

module.exports = {
  getStaffCatalog,
  getStaffMembers,
  getStaffMemberById,
  createStaffMember,
  updateStaffPermissions,
  updateStaffProfile,
  updateStaffStatus,
  deleteStaffMember,
};
