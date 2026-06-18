const jwt = require("jsonwebtoken");

const generateVerificationToken = (email, purpose) => {
  return jwt.sign(
    {
      email,
      purpose,
      type: "email-verification",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "10m",
    }
  );
};

module.exports = generateVerificationToken;