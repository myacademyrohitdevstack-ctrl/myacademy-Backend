const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const generateVerificationToken = (email, purpose) => {
  return jwt.sign(
    {
      email: email.toLowerCase().trim(),
      purpose,
      type: "email-verification",
      jti: crypto.randomBytes(16).toString("hex"),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "15m",
      algorithm: "HS256",
    }
  );
};

module.exports = generateVerificationToken;
