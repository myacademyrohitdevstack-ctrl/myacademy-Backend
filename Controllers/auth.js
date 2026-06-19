const User  = require("../Modals/User");
const EmailOtp  = require("../Modals/EmailOtp");
const bcrypt = require("bcryptjs");
const asyncHandler = require("../Utils/asyncHandler");
const sendEmail = require("../Utils/sendEmail");
const generateVerificationToken = require("../Utils/generateVerificationToken");
const jwt = require("jsonwebtoken");

const createUser = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    password,
    role,
    verificationToken,
  } = req.body;

  // Verify Email Verification Token
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

  // Validate token
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

  // Check existing user
  const existingUser = await User.findOne({
    $or: [{ email }],
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "User already exists with this email.",
    });
  }

  // Hash Password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create User
  const user = await User.create({
    fullName,
    email,
    password: hashedPassword,
    role: role || "student",
    emailVerified: true,
    approvalStatus: "pending",
  });

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


// Generate 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ================= SEND OTP =================

 const sendOtp = asyncHandler(async (req, res) => {
    const { email, purpose } = req.body;

    // Register validation
    if (purpose === "register") {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email is already registered.",
        });
      }
    }
    // Login/Forgot Password validation
    if (purpose !== "register") {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Account not found.",
        });
      }
    }
   // Check existing OTP
  let emailOtp = await EmailOtp.findOne({
    email,
    purpose,
  });
   if (emailOtp) {
    // 60-second cooldown
    const secondsPassed = Math.floor(
      (Date.now() - emailOtp.lastSentAt.getTime()) / 1000
    );

    if (secondsPassed < 60) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${60 - secondsPassed} seconds before requesting another OTP.`,
      });
    }

    // Maximum resend limit
    if (emailOtp.resendCount >= 5) {
      return res.status(429).json({
        success: false,
        message:
          "Maximum OTP requests reached. Please try again after 5 minutes.",
      });
    }
  }

    // Generate OTP
    const otp = generateOtp();

    // Hash OTP
    const hashedOtp = await bcrypt.hash(otp, 10);

    // Save
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

    // Send Email
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

})

// ================= VERIFY OTP =================

const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp, purpose } = req.body;

  const emailOtp = await EmailOtp.findOne({
    email,
    purpose,
  }).select("+otp");

  // Don't reveal whether OTP exists or not
  if (!emailOtp) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired OTP.",
    });
  }

  // Expired
  if (emailOtp.expiresAt < new Date()) {
    await EmailOtp.deleteOne({ _id: emailOtp._id });

    return res.status(400).json({
      success: false,
      message: "Invalid or expired OTP.",
    });
  }

  // Too many attempts
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

  // Success
  const verificationToken =
    generateVerificationToken(email, purpose);

  await EmailOtp.deleteOne({
    _id: emailOtp._id,
  });

  return res.status(200).json({
    success: true,
    message: "OTP verified successfully.",
    verificationToken,
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user (password is select:false)
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  // Check account status
  if (user.approvalStatus === "pending") {
    return res.status(403).json({
      success: false,
      message:
        "Your account is awaiting admin approval. Please try again later.",
    });
  }

  if (user.approvalStatus === "rejected") {
    return res.status(403).json({
      success: false,
      message:
        "Your account has been rejected. Please contact the administrator.",
    });
  }

  if (user.status === "blocked") {
    return res.status(403).json({
      success: false,
      message: "Your account has been blocked.",
    });
  }

  // Generate JWT
  const token = jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Remove password from response
  user.password = undefined;

  return res.status(200).json({
    success: true,
    message: "Login successful.",
    token,
  });
});
module.exports ={createUser,sendOtp,verifyOtp,login}