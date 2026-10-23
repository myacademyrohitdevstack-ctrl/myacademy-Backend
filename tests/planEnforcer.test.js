const { test, describe } = require("node:test");
const assert = require("node:assert");

describe("SaaS Plan Enforcement: Feature Permission Matching", () => {
  function normalizeFeatureKey(str) {
    const trimmed = String(str || "").trim().toLowerCase();
    if (trimmed === "*" || trimmed === "all") return "*";
    return trimmed.replace(/[^a-z0-9]/g, "");
  }

  function isFeatureAllowed(featuresList, requestedFeature) {
    if (!Array.isArray(featuresList) || featuresList.length === 0) {
      return true;
    }
    const normalizedRequested = normalizeFeatureKey(requestedFeature);
    return featuresList.some((f) => {
      const norm = normalizeFeatureKey(f);
      return norm === "*" || norm === normalizedRequested;
    });
  }

  test("Allows feature when wildcard '*' is present", () => {
    assert.strictEqual(isFeatureAllowed(["*"], "fee_management"), true);
    assert.strictEqual(isFeatureAllowed(["all"], "whatsapp_reminders"), true);
    assert.strictEqual(isFeatureAllowed([], "exams"), true);
  });

  test("Allows specific matched feature regardless of case or hyphenation", () => {
    const features = ["Fee Management", "whatsapp-reminders", "exams"];
    assert.strictEqual(isFeatureAllowed(features, "fee_management"), true);
    assert.strictEqual(isFeatureAllowed(features, "FEE MANAGEMENT"), true);
    assert.strictEqual(isFeatureAllowed(features, "whatsapp_reminders"), true);
    assert.strictEqual(isFeatureAllowed(features, "exams"), true);
  });

  test("Rejects unpermitted features", () => {
    const features = ["Attendance", "Courses"];
    assert.strictEqual(isFeatureAllowed(features, "fee_management"), false);
    assert.strictEqual(isFeatureAllowed(features, "whatsapp_reminders"), false);
    assert.strictEqual(isFeatureAllowed(features, "exams"), false);
  });
});

describe("SaaS Plan Enforcement: Quota Math & Boundary Conditions", () => {
  function evaluateQuota(current, requested, limit) {
    if (limit === -1 || limit === undefined) {
      return { allowed: true, remaining: Infinity };
    }
    if (current + requested > limit) {
      return {
        allowed: false,
        limit,
        current,
        requested,
        available: Math.max(0, limit - current),
      };
    }
    return {
      allowed: true,
      remaining: limit - (current + requested),
    };
  }

  test("Allows additions when under limit", () => {
    const res = evaluateQuota(80, 1, 100);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.remaining, 19);
  });

  test("Allows exact reaching of limit", () => {
    const res = evaluateQuota(99, 1, 100);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.remaining, 0);
  });

  test("Blocks single addition when quota is exhausted", () => {
    const res = evaluateQuota(100, 1, 100);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.available, 0);
  });

  test("Blocks bulk import when it exceeds remaining slots", () => {
    const res = evaluateQuota(90, 20, 100);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.available, 10);
  });

  test("Always allows additions when limit is -1 (unlimited)", () => {
    const res = evaluateQuota(15000, 500, -1);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.remaining, Infinity);
  });
});
