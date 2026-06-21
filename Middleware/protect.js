const jwt = require("jsonwebtoken");
const User = require("../Modals/User");
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
      code:"TOKEN-EXPIRE",
      message: "Access token is required.",
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.ACCESS_SECRET);
  } catch (error) {
    return res.status(403).json({
      success: false,
       code:"TOKEN-EXPIRE",
      message: "Invalid or expired access token.",
    });
  }

  const user = await User.findById(decoded.id).select(
    "-password"
  );

  if (!user) {
    return res.status(403).json({
      success: false,
       code:"TOKEN-EXPIRE",
      message: "User not found.",
    });
  }

  // Security checks
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

  req.user = user;

  next();
});

module.exports = protect;