const User = require("../Modals/User");
const EmailOtp = require("../Modals/EmailOtp");
const bcrypt = require("bcryptjs");
const asyncHandler = require("../Utils/asyncHandler");
const sendEmail = require("../Utils/sendEmail");
const generateVerificationToken = require("../Utils/generateVerificationToken");
const jwt = require("jsonwebtoken");
const Session = require("../Modals/Sessions");
const Academy = require("../Modals/Academy");
const UAParser = require("ua-parser-js");
const hashToken = require("../Utils/hashToken");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../Utils/generateTokens");
const generateUniqueAcademySlug = require("../Utils/generateAcadmeySlug");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

const createUser = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    password,
    academyName,
    verificationToken,
  } = req.body;

  // Verify email verification token.
  let decoded;

  try {
    decoded = jwt.verify(
      verificationToken,
      process.env.JWT_SECRET
    );
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired verification token.",
    });
  }

  // Validate token.
  if (
    decoded.type !== "email-verification" ||
    decoded.email !== email ||
    decoded.purpose !== "register"
  ) {
    return res.status(401).json({
      success: false,
      message: "Email verification failed.",
    });
  }

  // Check existing user.
  const existingUser = await User.findOne({
    $or: [{ email }],
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "User already exists with this email.",
    });
  }

  // Hash password.
  const hashedPassword = await bcrypt.hash(password, 10);

  const slug = await generateUniqueAcademySlug(academyName);

  const academy = await Academy.create({
    name: academyName,
    email,
    slug,
  });

  // Public registration must not control role or platformRole.
  // This registration flow creates an academy admin.
  const user = await User.create({
    fullName,
    email,
    password: hashedPassword,
    role: "admin",
    platformRole: "user",
    emailVerified: true,
    approvalStatus: "approved",
    academyId: academy._id,
  });

  academy.owner = user._id;
  await academy.save();

  return res.status(201).json({
    success: true,
    message:
      "Registration successful. Your account is awaiting admin approval.",
    data: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
    },
  });
});

// Generate a 6-digit OTP.
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ================= SEND OTP =================

const sendOtp = asyncHandler(async (req, res) => {
  const { email, purpose } = req.body;

  // Registration validation.
  if (purpose === "register") {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email is already registered.",
      });
    }
  }

  // Login/forgot-password validation.
  if (purpose !== "register") {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }
  }

  // Check existing OTP.
  let emailOtp = await EmailOtp.findOne({
    email,
    purpose,
  });

  if (emailOtp) {
    // 60-second cooldown.
    const secondsPassed = Math.floor(
      (Date.now() - emailOtp.lastSentAt.getTime()) / 1000
    );

    if (secondsPassed < 60) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${
          60 - secondsPassed
        } seconds before requesting another OTP.`,
      });
    }

    // Maximum resend limit.
    if (emailOtp.resendCount >= 5) {
      return res.status(429).json({
        success: false,
        message:
          "Maximum OTP requests reached. Please try again after 5 minutes.",
      });
    }
  }

  // Generate OTP.
  const otp = generateOtp();

  // Hash OTP.
  const hashedOtp = await bcrypt.hash(otp, 10);

  // Save OTP.
  if (emailOtp) {
    emailOtp.otp = hashedOtp;
    emailOtp.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    emailOtp.lastSentAt = new Date();
    emailOtp.resendCount += 1;
    emailOtp.attempts = 0;

    await emailOtp.save();
  } else {
    emailOtp = await EmailOtp.create({
      email,
      purpose,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      lastSentAt: new Date(),
      resendCount: 0,
      attempts: 0,
    });
  }

  // Send email.
  await sendEmail({
    to: email,
    subject: "Your Verification OTP",
    html: `
      <h2>Email Verification</h2>
      <p>Your OTP is:</p>
      <h1>${otp}</h1>
      <p>This OTP will expire in 5 minutes.</p>
    `,
  });

  return res.status(200).json({
    success: true,
    message: "OTP sent successfully.",
    resendAfter: 60,
  });
});

// ================= VERIFY OTP =================

const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp, purpose } = req.body;

  const emailOtp = await EmailOtp.findOne({
    email,
    purpose,
  }).select("+otp");

  // Don't reveal whether OTP exists or not.
  if (!emailOtp) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired OTP.",
    });
  }

  // Expired OTP.
  if (emailOtp.expiresAt < new Date()) {
    await EmailOtp.deleteOne({ _id: emailOtp._id });

    return res.status(400).json({
      success: false,
      message: "Invalid or expired OTP.",
    });
  }

  // Too many attempts.
  if (emailOtp.attempts >= 5) {
    await EmailOtp.deleteOne({
      _id: emailOtp._id,
    });

    return res.status(429).json({
      success: false,
      message:
        "Too many incorrect attempts. Please request a new OTP.",
    });
  }

  const matched = await bcrypt.compare(
    otp,
    emailOtp.otp
  );

  if (!matched) {
    emailOtp.attempts += 1;
    await emailOtp.save();

    const remaining = 5 - emailOtp.attempts;

    return res.status(400).json({
      success: false,
      message:
        remaining > 0
          ? `Invalid OTP. ${remaining} attempt(s) remaining.`
          : "Too many incorrect attempts. Please request a new OTP.",
    });
  }

  // OTP verification succeeded.
  const verificationToken = generateVerificationToken(
    email,
    purpose
  );

  await EmailOtp.deleteOne({
    _id: emailOtp._id,
  });

  return res.status(200).json({
    success: true,
    message: "OTP verified successfully.",
    verificationToken,
  });
});

// ================= LOGIN =================

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

const user = await User.findOne({
  email,
  isDeleted: { $ne: true },
}).select("+password");

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  // Is the account locked?
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutes = Math.ceil(
      (user.lockUntil.getTime() - Date.now()) / 60000
    );

    return res.status(423).json({
      success: false,
      message: `Account locked. Try again in ${minutes} minute(s).`,
    });
  }

  // Check password.
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    user.loginAttempts += 1;

    if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_TIME);
    }

    await user.save();

    const remaining = MAX_LOGIN_ATTEMPTS - user.loginAttempts;

    return res.status(401).json({
      success: false,
      message:
        remaining > 0
          ? `Invalid email or password. ${remaining} attempt(s) remaining.`
          : "Account locked for 15 minutes due to multiple failed login attempts.",
    });
  }

  // Check account approval status.
  if (user.approvalStatus === "pending") {
    return res.status(401).json({
      success: false,
      message:
        "Your account is awaiting admin approval. Please try again later.",
    });
  }

  if (user.approvalStatus === "rejected") {
    return res.status(401).json({
      success: false,
      message:
        "Your account has been rejected. Please contact the administrator.",
    });
  }

  if (user.status === "blocked") {
    return res.status(401).json({
      success: false,
      message: "Your account has been blocked.",
    });
  }

  user.loginAttempts = 0;
  user.lockUntil = null;
  user.lastLogin = new Date();

  await user.save();

  // Super admins are platform-level users and do not belong to an academy.
  const isSuperAdmin = user.platformRole === "super_admin";

  const academy = isSuperAdmin
    ? null
    : user.academyId
      ? await Academy.findOne({
          _id: user.academyId,
          isDeleted: { $ne: true },
        })
      : null;

  if (!isSuperAdmin && (!academy || academy.status !== "active")) {
    return res.status(403).json({
      success: false,
      message: "Academy is not active.",
    });
  }

  // Device information.
  const parser = new UAParser(req.headers["user-agent"]);

  const browser = parser.getBrowser().name || "Unknown";
  const os = parser.getOS().name || "Unknown";

  const device =
    parser.getDevice().model ||
    parser.getDevice().type ||
    "Desktop";

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "";

  // Generate JWTs.
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const refreshTokenHash = hashToken(refreshToken);

  // Create session. Super-admin sessions have no academyId.
  await Session.create({
    user: user._id,
    refreshTokenHash,
    browser,
    os,
    device,
    ip,
    academyId: academy?._id,
    userAgent: req.headers["user-agent"],
    expiresAt: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ),
  });

  // Do not return the password hash.
  user.password = undefined;

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    success: true,
    accessToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      platformRole: user.platformRole || "user",
    },
    academy: academy
      ? {
          id: academy._id,
          name: academy.name,
          slug: academy.slug,
        }
      : null,
  });
});

// ================= REFRESH ACCESS TOKEN =================

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: "Refresh token missing.",
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_SECRET
    );
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token.",
    });
  }

  if (!decoded.id) {
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token.",
    });
  }

  const refreshTokenHash = hashToken(refreshToken);

  // The hashed refresh token uniquely identifies the session.
  // Do not filter by academyId because platform sessions have no academyId.
  const session = await Session.findOne({ refreshTokenHash });

  if (
    !session ||
    String(session.user) !== String(decoded.id)
  ) {
    return res.status(401).json({
      success: false,
      message: "Session not found.",
    });
  }

  if (session.expiresAt && session.expiresAt <= new Date()) {
    await Session.deleteOne({ _id: session._id });

    return res.status(401).json({
      success: false,
      message: "Session has expired. Please log in again.",
    });
  }

  // Always load the current user. Never authorize from token claims alone.
const user = await User.findOne({
  _id: decoded.id,
  isDeleted: { $ne: true },
});

  if (!user) {
    await Session.deleteOne({ _id: session._id });

    return res.status(401).json({
      success: false,
      message: "User not found.",
    });
  }

  if (
    user.status === "blocked" ||
    user.approvalStatus === "pending" ||
    user.approvalStatus === "rejected"
  ) {
    await Session.deleteOne({ _id: session._id });

    return res.status(401).json({
      success: false,
      message:
        "This account is not permitted to refresh its session.",
    });
  }

  let academy = null;

  if (user.platformRole === "super_admin") {
    // A platform super admin may have a session without an academy.
    if (session.academyId) {
      await Session.deleteOne({ _id: session._id });

      return res.status(401).json({
        success: false,
        message: "Invalid platform session.",
      });
    }
  } else {
    // Academy users must still belong to the same active academy.
    if (
      !user.academyId ||
      !decoded.academyId ||
      String(user.academyId) !== String(decoded.academyId) ||
      !session.academyId ||
      String(session.academyId) !== String(user.academyId)
    ) {
      await Session.deleteOne({ _id: session._id });

      return res.status(401).json({
        success: false,
        message: "Invalid academy session.",
      });
    }

    academy = await Academy.findOne({
      _id: user.academyId,
      isDeleted: { $ne: true },
    });

    if (!academy || academy.status !== "active") {
      await Session.deleteOne({ _id: session._id });

      return res.status(403).json({
        success: false,
        message: "Academy is not active.",
      });
    }
  }

  // Rotate both tokens after all current database checks pass.
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  session.refreshTokenHash = hashToken(newRefreshToken);
  session.lastActive = new Date();
  session.expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  );

  await session.save();

  res.cookie("refreshToken", newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    success: true,
    accessToken: newAccessToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profileImage: user.profileImage,
      role: user.role,
      platformRole: user.platformRole || "user",
    },
    academy: academy
      ? {
          id: academy._id,
          name: academy.name,
          slug: academy.slug,
        }
      : null,
  });
});

// ================= LOGOUT =================

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);

    await Session.deleteOne({
      refreshTokenHash,
      user: req.user._id,
    });
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
});

// ================= LOGOUT ALL DEVICES =================

const logoutAll = asyncHandler(async (req, res) => {
  await Session.deleteMany({
    user: req.user._id,
  });

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out from all devices.",
  });
});

// ================= UPDATE PASSWORD =================

const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message:
        "Current password and new password are required.",
    });
  }

  const user = await User.findById(req.user._id).select("+password");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  const isMatch = await bcrypt.compare(
    currentPassword,
    user.password
  );

  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: "Current password is incorrect.",
    });
  }

  // Prevent using the same password.
  const isSamePassword = await bcrypt.compare(
    newPassword,
    user.password
  );

  if (isSamePassword) {
    return res.status(400).json({
      success: false,
      message:
        "New password must be different from current password.",
    });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  user.password = hashedPassword;

  await user.save();

  return res.status(200).json({
    success: true,
    message: "Password updated successfully.",
  });
});

module.exports = {
  createUser,
  updatePassword,
  sendOtp,
  verifyOtp,
  login,
  refreshAccessToken,
  logout,
  logoutAll,
};