const jwt = require("jsonwebtoken");
const User = require("../Modals/User");
const Academy = require("../Modals/Academy");
const asyncHandler = require("../Utils/asyncHandler");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Authorization: Bearer <token>
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Access token is required.",
    });
  }

  let decoded;

  try {
    // Pin algorithm to HS256 to reject 'alg: none' and mismatch attacks
    decoded = jwt.verify(token, process.env.ACCESS_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Invalid or expired access token.",
    });
  }

  if (!decoded.id) {
    return res.status(403).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "Invalid access token.",
    });
  }

  // Load the current user from the database.
  // Never trust role claims from the JWT alone.
  const user = await User.findOne({
    _id: decoded.id,
    isDeleted: { $ne: true },
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      code: "TOKEN-EXPIRE",
      message: "User not found or account deleted.",
    });
  }

  // Session invalidation on password change
  if (user.passwordChangedAt && decoded.iat) {
    const changedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (decoded.iat < changedTimestamp) {
      return res.status(401).json({
        success: false,
        code: "TOKEN-EXPIRE",
        message: "Password was changed recently. Please log in again.",
      });
    }
  }

  // Account security checks.
  if (user.status === "blocked") {
    return res.status(401).json({
      success: false,
      message: "Your account has been blocked.",
    });
  }

  if (user.approvalStatus === "pending") {
    return res.status(401).json({
      success: false,
      message: "Your account is awaiting admin approval.",
    });
  }

  if (user.approvalStatus === "rejected") {
    return res.status(401).json({
      success: false,
      message: "Your account has been rejected.",
    });
  }

  // Attach the current database user to the request.
  req.user = user;

  // Super Admins operate at the platform level.
  // They do not need an academyId.
  if (user.platformRole === "super_admin") {
    req.academy = null;
    return next();
  }

  // All other users must belong to an academy.
  if (!user.academyId) {
    return res.status(403).json({
      success: false,
      message: "Your account is not associated with an academy.",
    });
  }

  // Load the current academy and verify its status.
  const academy = await Academy.findOne({
    _id: user.academyId,
    isDeleted: { $ne: true },
  });

  if (!academy) {
    return res.status(401).json({
      success: false,
      message: "Academy not found.",
    });
  }

  if (academy.status !== "active") {
    return res.status(403).json({
      success: false,
      message: "This academy is not active.",
    });
  }

  // Ensure the access token's academy claim matches current membership.
  if (
    !decoded.academyId ||
    String(decoded.academyId) !== String(user.academyId)
  ) {
    return res.status(403).json({
      success: false,
      message: "Invalid academy access token.",
    });
  }

  req.academy = academy;

  next();
});

module.exports = protect;
