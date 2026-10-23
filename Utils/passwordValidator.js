const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "admin123",
  "admin@123",
  "welcome123",
  "letmein123",
  "academy123",
  "iloveyou",
  "secret123",
  "pass1234",
  "testing123",
  "superadmin",
  "superadmin123",
]);

/**
 * Validates password strength and blocks commonly compromised passwords.
 * @param {string} password 
 * @param {object} options { minLength: 8, requireSpecial: true }
 * @returns {{ isValid: boolean, message?: string }}
 */
function validatePasswordStrength(password, options = {}) {
  const minLength = options.minLength || 8;

  if (!password || typeof password !== "string") {
    return { isValid: false, message: "Password is required." };
  }

  if (password.length < minLength) {
    return {
      isValid: false,
      message: `Password must be at least ${minLength} characters long.`,
    };
  }

  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    return {
      isValid: false,
      message: "This password is too common and easily guessed. Please choose a stronger password.",
    };
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[@$!%*?#&^_\-+=\~\[\]\(\)\{\}|:;,.<>]/.test(password);

  if (!hasLower || !hasUpper || !hasDigit) {
    return {
      isValid: false,
      message: "Password must include at least one uppercase letter, one lowercase letter, and one number.",
    };
  }

  if (options.requireSpecial !== false && !hasSpecial) {
    return {
      isValid: false,
      message: "Password must include at least one special character (e.g. @, $, !, %, *, ?, #, &).",
    };
  }

  return { isValid: true };
}

module.exports = {
  validatePasswordStrength,
  COMMON_PASSWORDS,
};
