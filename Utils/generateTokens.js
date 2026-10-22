
const jwt = require("jsonwebtoken");

const generateAccessToken = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    platformRole: user.platformRole || "user",
  };

  if (user.platformRole !== "super_admin" && user.academyId) {
    payload.academyId = user.academyId;
  }

  return jwt.sign(payload, process.env.ACCESS_SECRET, {
    expiresIn: "15m",
  });
};

const generateRefreshToken = (user) => {
  const payload = {
    id: user._id,
    academyId: user.academyId || null,
    platformRole: user.platformRole || "user",
  };

  return jwt.sign(payload, process.env.REFRESH_SECRET, {
    expiresIn: "7d",
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
};
