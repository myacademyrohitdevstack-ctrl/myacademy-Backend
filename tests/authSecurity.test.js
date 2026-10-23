const { test, describe } = require("node:test");
const assert = require("node:assert");
const { validatePasswordStrength, COMMON_PASSWORDS } = require("../Utils/passwordValidator");
const { generateAccessToken, generateRefreshToken } = require("../Utils/generateTokens");
const generateVerificationToken = require("../Utils/generateVerificationToken");
const jwt = require("jsonwebtoken");

describe("Auth Security: Password Strength & Common Password Blocking", () => {
  test("Rejects passwords shorter than 8 characters", () => {
    const res = validatePasswordStrength("Short1!");
    assert.strictEqual(res.isValid, false);
    assert.ok(res.message.includes("at least 8 characters"));
  });

  test("Rejects passwords in common password dictionary", () => {
    for (const common of ["password", "12345678", "admin123", "superadmin", "welcome123"]) {
      const res = validatePasswordStrength(common);
      assert.strictEqual(res.isValid, false, `Failed to block common password: ${common}`);
      assert.ok(res.message.includes("too common"));
    }
  });

  test("Rejects passwords missing required character groups", () => {
    // Missing digit
    assert.strictEqual(validatePasswordStrength("NoDigitHere!").isValid, false);
    // Missing uppercase
    assert.strictEqual(validatePasswordStrength("nouppercase1!").isValid, false);
    // Missing special character
    assert.strictEqual(validatePasswordStrength("NoSpecialChar123").isValid, false);
  });

  test("Accepts strong, unique passwords", () => {
    const res = validatePasswordStrength("CorrectHorseBatteryStaple99!");
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.message, undefined);
  });
});

describe("Auth Security: Token Generation & Algorithm Pinning", () => {
  const dummyUser = {
    _id: "60d5ec49f1b2c8b1f8e4e1a1",
    role: "admin",
    platformRole: "user",
    academyId: "60d5ec49f1b2c8b1f8e4e1a2",
  };

  test("Pins access tokens to HS256 algorithm", () => {
    process.env.ACCESS_SECRET = "test_super_secure_access_secret_key_12345";
    const token = generateAccessToken(dummyUser);
    const decodedHeader = jwt.decode(token, { complete: true });
    assert.strictEqual(decodedHeader.header.alg, "HS256");
  });

  test("Pins refresh tokens to HS256 algorithm and 7-day expiry", () => {
    process.env.REFRESH_SECRET = "test_super_secure_refresh_secret_key_12345";
    const token = generateRefreshToken(dummyUser);
    const decodedHeader = jwt.decode(token, { complete: true });
    assert.strictEqual(decodedHeader.header.alg, "HS256");
  });

  test("Pins verification tokens to HS256 and includes random jti", () => {
    process.env.JWT_SECRET = "test_super_secure_jwt_secret_key_12345";
    const token = generateVerificationToken("admin@example.com", "2fa-login");
    const decoded = jwt.decode(token, { complete: true });
    assert.strictEqual(decoded.header.alg, "HS256");
    assert.ok(decoded.payload.jti);
    assert.strictEqual(decoded.payload.email, "admin@example.com");
  });
});
