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
const { validatePasswordStrength } = require("../Utils/passwordValidator");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

// Generate a 6-digit numeric OTP.
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ================= CREATE USER (REGISTER ACADEMY ADMIN) =================

const createUser = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    password,
    academyName,
    verificationToken,
  } = req.body;

  if (!fullName || !email || !password || !academyName || !verificationToken) {
    return res.status(400).json({
      success: false,
      message: "All fields are required.",
    });
  }

  // Password strength check
  const strength = validatePasswordStrength(password);
  if (!strength.isValid) {
    return res.status(400).json({
      success: false,
      message: strength.message,
    });
  }

  // Verify email verification token (pinned to HS256)
  let decoded;
  try {
    decoded = jwt.verify(
      verificationToken,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired verification token.",
    });
  }

  // Validate token payload.
  if (
    decoded.type !== "email-verification" ||
    decoded.email !== email.toLowerCase().trim() ||
    decoded.purpose !== "register"
  ) {
    return res.status(401).json({
      success: false,
      message: "Email verification failed.",
    });
  }

  // Check existing user.
  const existingUser = await User.findOne({
    email: email.toLowerCase().trim(),
    isDeleted: false,
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "User already exists with this email.",
    });
  }

  // Hash password with bcrypt 12 rounds
  const hashedPassword = await bcrypt.hash(password, 12);

  const slug = await generateUniqueAcademySlug(academyName);

  const academy = await Academy.create({
    name: academyName,
    email: email.toLowerCase().trim(),
    slug,
    status: "pending",
    approvalStatus: "pending",
  });

  // Public registration creates an academy admin awaiting platform approval.
  const user = await User.create({
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    password: hashedPassword,
    role: "admin",
    platformRole: "user",
    emailVerified: true,
    approvalStatus: "pending",
    status: "pending",
    academyId: academy._id,
  });

  academy.owner = user._id;
  await academy.save();

  return res.status(201).json({
    success: true,
    message: "Registration successful. Your account is awaiting admin approval.",
    data: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
    },
  });
});

// ================= SEND OTP (WITH ANTI-USER-ENUMERATION) =================

const sendOtp = asyncHandler(async (req, res) => {
  const { email, purpose } = req.body;

  if (!email || !purpose) {
    return res.status(400).json({
      success: false,
      message: "Email and purpose are required.",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Registration validation
  if (purpose === "register") {
    const existingUser = await User.findOne({ email: normalizedEmail, isDeleted: false });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email is already registered.",
      });
    }
  }

  // Anti-enumeration for forgot/reset password:
  // If account doesn't exist, return uniform success message without sending email
  if (purpose === "forgot-password" || purpose === "reset-password") {
    const user = await User.findOne({ email: normalizedEmail, isDeleted: false });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account exists with this email, a verification code has been sent.",
        resendAfter: 60,
      });
    }
  }

  // Check existing OTP for cooldown and limits
  let emailOtp = await EmailOtp.findOne({
    email: normalizedEmail,
    purpose,
  });

  if (emailOtp) {
    const secondsPassed = Math.floor(
      (Date.now() - emailOtp.lastSentAt.getTime()) / 1000
    );

    if (secondsPassed < 60) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${60 - secondsPassed} seconds before requesting another OTP.`,
      });
    }

    if (emailOtp.resendCount >= 5) {
      return res.status(429).json({
        success: false,
        message: "Maximum OTP requests reached. Please try again after 5 minutes.",
      });
    }
  }

  // Generate 6-digit OTP
  const otp = generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);

  if (emailOtp) {
    emailOtp.otp = hashedOtp;
    emailOtp.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    emailOtp.lastSentAt = new Date();
    emailOtp.resendCount += 1;
    emailOtp.attempts = 0;
    await emailOtp.save();
  } else {
    emailOtp = await EmailOtp.create({
      email: normalizedEmail,
      purpose,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      lastSentAt: new Date(),
      resendCount: 0,
      attempts: 0,
    });
  }

  // Send email
  await sendEmail({
    to: normalizedEmail,
    subject: "Your Verification Code",
    html: `
      <h2>Email Verification</h2>
      <p>Your verification code is:</p>
      <h1 style="font-size: 32px; letter-spacing: 4px; color: #D6451B;">${otp}</h1>
      <p>This code will expire in 5 minutes.</p>
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

  if (!email || !otp || !purpose) {
    return res.status(400).json({
      success: false,
      message: "Email, OTP, and purpose are required.",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const emailOtp = await EmailOtp.findOne({
    email: normalizedEmail,
    purpose,
  }).select("+otp");

  if (!emailOtp) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired OTP.",
    });
  }

  if (emailOtp.expiresAt < new Date()) {
    await EmailOtp.deleteOne({ _id: emailOtp._id });
    return res.status(400).json({
      success: false,
      message: "Invalid or expired OTP.",
    });
  }

  if (emailOtp.attempts >= 5) {
    await EmailOtp.deleteOne({ _id: emailOtp._id });
    return res.status(429).json({
      success: false,
      message: "Too many incorrect attempts. Please request a new OTP.",
    });
  }

  const matched = await bcrypt.compare(otp, emailOtp.otp);

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

  // OTP verified successfully - generate single-use verification token
  const verificationToken = generateVerificationToken(normalizedEmail, purpose);

  await EmailOtp.deleteOne({ _id: emailOtp._id });

  return res.status(200).json({
    success: true,
    message: "OTP verified successfully.",
    verificationToken,
  });
});

// ================= LOGIN WITH ACCOUNT LOCKOUT & 2FA TRIGGER =================

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({
    email: normalizedEmail,
    isDeleted: { $ne: true },
  }).select("+password");

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  // Check account lockout
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
    return res.status(423).json({
      success: false,
      code: "ACCOUNT_LOCKED",
      message: `Account is locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
    });
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;

    if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_TIME);
    }

    await user.save();

    const remaining = MAX_LOGIN_ATTEMPTS - user.loginAttempts;

    return res.status(401).json({
      success: false,
      message:
        remaining > 0
          ? `Invalid email or password. ${remaining} attempt(s) remaining before temporary lockout.`
          : "Account locked for 15 minutes due to multiple failed login attempts.",
    });
  }

  // Approval status checks
  if (user.approvalStatus === "pending") {
    return res.status(401).json({
      success: false,
      message: "Your account is awaiting admin approval. Please try again later.",
    });
  }

  if (user.approvalStatus === "rejected") {
    return res.status(401).json({
      success: false,
      message: user.rejectionReason
        ? `Your account registration was rejected: ${user.rejectionReason}`
        : "Your account has been rejected. Please contact the administrator.",
    });
  }

  if (user.approvalStatus === "on_hold") {
    return res.status(401).json({
      success: false,
      message: user.holdReason
        ? `Your account registration is currently on hold: ${user.holdReason}`
        : "Your account registration is currently on hold. Please contact the administrator.",
    });
  }

  if (user.status === "blocked") {
    return res.status(401).json({
      success: false,
      message: user.blockReason
        ? `Your account has been blocked: ${user.blockReason}`
        : "Your account has been blocked.",
    });
  }

  // Reset login attempts on successful credentials
  user.loginAttempts = 0;
  user.lockUntil = null;
  user.lastLogin = new Date();
  await user.save();

  // Super admins operate at platform level
  const isSuperAdmin = user.platformRole === "super_admin";

  const academy = isSuperAdmin
    ? null
    : user.academyId
      ? await Academy.findOne({
          _id: user.academyId,
          isDeleted: { $ne: true },
        })
      : null;

  if (!isSuperAdmin) {
    if (!academy) {
      return res.status(403).json({
        success: false,
        message: "Academy not found.",
      });
    }

    if (academy.status === "pending") {
      return res.status(403).json({
        success: false,
        message: "Your academy registration is awaiting platform administrator approval.",
      });
    }

    if (academy.status === "on_hold") {
      return res.status(403).json({
        success: false,
        message: academy.holdReason
          ? `Your academy account is currently on hold: ${academy.holdReason}`
          : "Your academy account is currently on hold. Please contact the administrator.",
      });
    }

    if (academy.status === "rejected") {
      return res.status(403).json({
        success: false,
        message: academy.rejectionReason
          ? `Your academy registration was rejected: ${academy.rejectionReason}`
          : "Your academy registration was rejected.",
      });
    }

    if (academy.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: academy.suspensionReason
          ? `Your academy account is suspended: ${academy.suspensionReason}`
          : "Your academy account is suspended. Please contact the administrator.",
      });
    }

    if (academy.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Academy is not active.",
      });
    }
  }

  // ================= 2FA ENFORCEMENT FOR ADMIN & SUPER ADMIN =================
  const is2FARequired = isSuperAdmin || user.role === "admin";

  if (is2FARequired) {
    const twoFactorOtp = generateOtp();
    const hashedTwoFactorOtp = await bcrypt.hash(twoFactorOtp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Save to EmailOtp with purpose 2fa-login
    await EmailOtp.findOneAndUpdate(
      { email: user.email, purpose: "2fa-login" },
      {
        otp: hashedTwoFactorOtp,
        expiresAt,
        attempts: 0,
        resendCount: 0,
        lastSentAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Temporary token signed for 5 minutes
    const tempToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        type: "2fa-pending",
      },
      process.env.ACCESS_SECRET,
      {
        expiresIn: "5m",
        algorithm: "HS256",
      }
    );

    // Send 2FA email
    await sendEmail({
      to: user.email,
      subject: "Your Two-Factor Authentication (2FA) Code",
      html: `
        <h2>Two-Factor Authentication</h2>
        <p>You are signing in to an administrative account (${user.email}).</p>
        <p>Your 6-digit login verification code is:</p>
        <h1 style="font-size: 36px; letter-spacing: 5px; color: #D6451B;">${twoFactorOtp}</h1>
        <p>This code expires in 5 minutes. If you did not initiate this request, secure your account immediately.</p>
      `,
    });

    return res.status(200).json({
      success: true,
      twoFactorRequired: true,
      tempToken,
      email: user.email,
      message: "Two-factor authentication code sent to your email.",
    });
  }

  // Normal login flow for regular roles (student, teacher, parent)
  const parser = new UAParser(req.headers["user-agent"]);
  const browser = parser.getBrowser().name || "Unknown";
  const os = parser.getOS().name || "Unknown";
  const device = parser.getDevice().model || parser.getDevice().type || "Desktop";
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const refreshTokenHash = hashToken(refreshToken);

  await Session.create({
    user: user._id,
    refreshTokenHash,
    browser,
    os,
    device,
    ip,
    academyId: academy?._id,
    userAgent: req.headers["user-agent"],
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

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
      _id: user._id,
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

// ================= VERIFY 2FA FOR ADMIN & SUPER ADMIN =================

const verify2FA = asyncHandler(async (req, res) => {
  const { tempToken, otp } = req.body;

  if (!tempToken || !otp) {
    return res.status(400).json({
      success: false,
      message: "Temporary verification token and 6-digit code are required.",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(tempToken, process.env.ACCESS_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "2FA session expired. Please log in again.",
    });
  }

  if (decoded.type !== "2fa-pending" || !decoded.id) {
    return res.status(401).json({
      success: false,
      message: "Invalid 2FA token.",
    });
  }

  const user = await User.findOne({
    _id: decoded.id,
    isDeleted: { $ne: true },
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  const emailOtp = await EmailOtp.findOne({
    email: user.email,
    purpose: "2fa-login",
  }).select("+otp");

  if (!emailOtp || emailOtp.expiresAt < new Date()) {
    if (emailOtp) await EmailOtp.deleteOne({ _id: emailOtp._id });
    return res.status(400).json({
      success: false,
      message: "Invalid or expired 2FA code. Please request a new code.",
    });
  }

  if (emailOtp.attempts >= 5) {
    await EmailOtp.deleteOne({ _id: emailOtp._id });
    return res.status(429).json({
      success: false,
      message: "Too many incorrect 2FA attempts. Please log in again.",
    });
  }

  const isOtpValid = await bcrypt.compare(otp, emailOtp.otp);
  if (!isOtpValid) {
    emailOtp.attempts += 1;
    await emailOtp.save();
    const remaining = 5 - emailOtp.attempts;
    return res.status(400).json({
      success: false,
      message:
        remaining > 0
          ? `Invalid 2FA code. ${remaining} attempt(s) remaining.`
          : "Too many incorrect 2FA attempts. Please log in again.",
    });
  }

  // Delete used 2FA OTP
  await EmailOtp.deleteOne({ _id: emailOtp._id });

  const isSuperAdmin = user.platformRole === "super_admin";
  const academy = isSuperAdmin
    ? null
    : await Academy.findOne({ _id: user.academyId, isDeleted: { $ne: true } });

  const parser = new UAParser(req.headers["user-agent"]);
  const browser = parser.getBrowser().name || "Unknown";
  const os = parser.getOS().name || "Unknown";
  const device = parser.getDevice().model || parser.getDevice().type || "Desktop";
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const refreshTokenHash = hashToken(refreshToken);

  await Session.create({
    user: user._id,
    refreshTokenHash,
    browser,
    os,
    device,
    ip,
    academyId: academy?._id,
    userAgent: req.headers["user-agent"],
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

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
      _id: user._id,
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

// ================= REFRESH ACCESS TOKEN (WITH ROTATION & REPLAY DEFENSE) =================

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
    decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET, {
      algorithms: ["HS256"],
    });
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
  const session = await Session.findOne({ refreshTokenHash });

  if (!session || String(session.user) !== String(decoded.id)) {
    return res.status(401).json({
      success: false,
      message: "Session not found or already invalidated.",
    });
  }

  if (session.expiresAt && session.expiresAt <= new Date()) {
    await Session.deleteOne({ _id: session._id });
    return res.status(401).json({
      success: false,
      message: "Session has expired. Please log in again.",
    });
  }

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

  // Session invalidation on recent password change
  if (user.passwordChangedAt && decoded.iat) {
    const changedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (decoded.iat < changedTimestamp) {
      await Session.deleteOne({ _id: session._id });
      res.clearCookie("refreshToken");
      return res.status(401).json({
        success: false,
        message: "Password changed. Please log in again.",
      });
    }
  }

  if (
    user.status === "blocked" ||
    user.approvalStatus === "pending" ||
    user.approvalStatus === "rejected"
  ) {
    await Session.deleteOne({ _id: session._id });
    return res.status(401).json({
      success: false,
      message: "This account is not permitted to refresh its session.",
    });
  }

  let academy = null;

  if (user.platformRole === "super_admin") {
    if (session.academyId) {
      await Session.deleteOne({ _id: session._id });
      return res.status(401).json({
        success: false,
        message: "Invalid platform session.",
      });
    }
  } else {
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

  // Rotate both tokens after all checks pass
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  session.refreshTokenHash = hashToken(newRefreshToken);
  session.lastActive = new Date();
  session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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
      _id: user._id,
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

// ================= RESET PASSWORD (FORGOTTEN PASSWORD VIA OTP TOKEN) =================

const resetPassword = asyncHandler(async (req, res) => {
  const { email, verificationToken, password } = req.body;

  if (!email || !verificationToken || !password) {
    return res.status(400).json({
      success: false,
      message: "Email, verification token, and new password are required.",
    });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.isValid) {
    return res.status(400).json({
      success: false,
      message: strength.message,
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(verificationToken, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Reset token expired or invalid. Please request a new verification code.",
    });
  }

  if (
    decoded.email !== email.toLowerCase().trim() ||
    decoded.type !== "email-verification" ||
    !["reset-password", "forgot-password"].includes(decoded.purpose)
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid or forged password reset token.",
    });
  }

  const user = await User.findOne({
    email: decoded.email,
    isDeleted: false,
  }).select("+password");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Account not found.",
    });
  }

  const isSame = await bcrypt.compare(password, user.password);
  if (isSame) {
    return res.status(400).json({
      success: false,
      message: "New password must be different from your current password.",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  user.password = hashedPassword;
  user.passwordChangedAt = new Date();
  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  // Invalidate all existing sessions across all devices
  await Session.deleteMany({ user: user._id });

  return res.status(200).json({
    success: true,
    message: "Password reset successfully. Please log in with your new password.",
  });
});

// ================= UPDATE PASSWORD (AUTHENTICATED USER) =================

const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Current password and new password are required.",
    });
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.isValid) {
    return res.status(400).json({
      success: false,
      message: strength.message,
    });
  }

  const user = await User.findById(req.user._id).select("+password");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: "Current password is incorrect.",
    });
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    return res.status(400).json({
      success: false,
      message: "New password must be different from current password.",
    });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  user.password = hashedPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  // Invalidate all other active sessions across devices
  await Session.deleteMany({ user: user._id });

  return res.status(200).json({
    success: true,
    message: "Password updated successfully. Other active sessions have been invalidated.",
  });
});

module.exports = {
  createUser,
  updatePassword,
  resetPassword,
  sendOtp,
  verifyOtp,
  login,
  verify2FA,
  refreshAccessToken,
  logout,
  logoutAll,
};
