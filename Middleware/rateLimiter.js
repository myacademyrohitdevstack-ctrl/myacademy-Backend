/**
 * In-memory sliding-window rate limiter for sensitive authentication endpoints.
 */

class MemoryRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute default
    this.max = options.max || 10; // max requests per window
    this.message = options.message || "Too many requests. Please try again later.";
    this.hits = new Map();

    // Auto-cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.hits.entries()) {
      if (now > record.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  middleware() {
    return (req, res, next) => {
      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        "unknown";
      
      const key = `${ip}:${req.baseUrl || ""}${req.path || ""}`;
      const now = Date.now();

      let record = this.hits.get(key);
      if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + this.windowMs };
        this.hits.set(key, record);
      } else {
        record.count++;
      }

      const remaining = Math.max(0, this.max - record.count);
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);

      res.setHeader("X-RateLimit-Limit", this.max);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

      if (record.count > this.max) {
        res.setHeader("Retry-After", retryAfterSeconds);
        return res.status(429).json({
          success: false,
          code: "TOO_MANY_REQUESTS",
          message: this.message,
          retryAfter: retryAfterSeconds,
        });
      }

      next();
    };
  }
}

// 1. General Auth Limiter: Max 15 attempts per minute per IP
const authRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: "Too many authentication requests from this IP. Please wait a minute and try again.",
}).middleware();

// 2. Strict OTP Limiter: Max 5 OTP requests per 10 minutes per IP
const otpRateLimiter = new MemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many OTP requests from this IP. Please wait 10 minutes before requesting another OTP.",
}).middleware();

module.exports = {
  MemoryRateLimiter,
  authRateLimiter,
  otpRateLimiter,
};
