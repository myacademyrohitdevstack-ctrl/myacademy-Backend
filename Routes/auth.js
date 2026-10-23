const express = require("express");
const {
  createUser,
  sendOtp,
  verifyOtp,
  login,
  verify2FA,
  refreshAccessToken,
  logout,
  logoutAll,
  resetPassword,
  updatePassword,
} = require("../Controllers/auth");
const protect = require("../Middleware/protect");
const { authRateLimiter, otpRateLimiter } = require("../Middleware/rateLimiter");

const router = express.Router();

// Public auth endpoints with rate limiting
router.post("/createUser", authRateLimiter, createUser);
router.post("/send-otp", otpRateLimiter, sendOtp);
router.post("/verify-otp", otpRateLimiter, verifyOtp);
router.post("/login", authRateLimiter, login);
router.post("/verify-2fa", authRateLimiter, verify2FA);
router.post("/reset-password", authRateLimiter, resetPassword);
router.post("/refresh-token", refreshAccessToken);

// Authenticated session & password management
router.post("/logout", protect, logout);
router.post("/logout-all", protect, logoutAll);
router.patch("/update-password", protect, updatePassword);

module.exports = router;
