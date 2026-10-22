const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  normalizePhoneNumber,
  renderTemplateMessage,
  generateClickToChatUrl,
  verifyWebhookSignature,
  getDefaultTemplates,
} = require("../Utils/whatsappService");
const { isWithinSendingHours } = require("../Utils/reminderEngine");

describe("WhatsApp Service: Phone Number Normalization", () => {
  test("Normalizes standard 10-digit Indian number", () => {
    const res = normalizePhoneNumber("9876543210");
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.normalizedPhone, "919876543210");
  });

  test("Normalizes 10-digit number with spaces and dashes", () => {
    const res = normalizePhoneNumber(" 98765-43210 ");
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.normalizedPhone, "919876543210");
  });

  test("Normalizes 11-digit number with leading zero", () => {
    const res = normalizePhoneNumber("09876543210");
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.normalizedPhone, "919876543210");
  });

  test("Normalizes 12-digit Indian number starting with 91", () => {
    const res = normalizePhoneNumber("+91 9876543210");
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.normalizedPhone, "919876543210");
  });

  test("Rejects invalid phone numbers", () => {
    const shortNum = normalizePhoneNumber("12345");
    assert.strictEqual(shortNum.isValid, false);

    const emptyNum = normalizePhoneNumber("");
    assert.strictEqual(emptyNum.isValid, false);

    const invalidStart = normalizePhoneNumber("2876543210");
    assert.strictEqual(invalidStart.isValid, false);
  });
});

describe("WhatsApp Service: Template Rendering", () => {
  test("Substitutes all standard template variables safely", () => {
    const template = "Hello {{parentName}}, fee of ₹{{pendingAmount}} for {{studentName}} in {{className}} is due on {{dueDate}} at {{academyName}}.";
    const vars = {
      parentName: "Rajesh Sharma",
      pendingAmount: "4500",
      studentName: "Aarav Sharma",
      className: "Class 10 Science",
      dueDate: "15 Nov 2026",
      academyName: "Apex Academy",
    };

    const rendered = renderTemplateMessage(template, vars);
    assert.ok(rendered.includes("Rajesh Sharma"));
    assert.ok(rendered.includes("₹4500"));
    assert.ok(rendered.includes("Aarav Sharma"));
    assert.ok(rendered.includes("Class 10 Science"));
    assert.ok(rendered.includes("15 Nov 2026"));
    assert.ok(rendered.includes("Apex Academy"));
    assert.strictEqual(rendered.includes("{{"), false);
  });

  test("Removes unknown and unresolved variable tags gracefully", () => {
    const template = "Hello {{studentName}}, check {{unresolvedMysteryTag}}!";
    const rendered = renderTemplateMessage(template, { studentName: "Rohan" });
    assert.strictEqual(rendered.includes("{{unresolvedMysteryTag}}"), false);
    assert.ok(rendered.includes("Rohan"));
  });
});

describe("WhatsApp Service: Click-to-Chat URL Generation", () => {
  test("Generates valid https://wa.me link with URL-encoded parameters", () => {
    const url = generateClickToChatUrl("919876543210", "Hello! Amount due is ₹5,000.");
    assert.ok(url.startsWith("https://wa.me/919876543210?text="));
    assert.ok(url.includes("%E2%82%B95%2C000")); // encoded rupee and comma
  });
});

describe("WhatsApp Service: Webhook Signature Verification", () => {
  test("Validates authentic HMAC SHA256 signature", () => {
    const crypto = require("crypto");
    const secret = "test_meta_app_secret";
    const payload = JSON.stringify({ event: "message_delivered" });
    const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const signatureHeader = "sha256=" + hmac;

    const isValid = verifyWebhookSignature(payload, signatureHeader, secret);
    assert.strictEqual(isValid, true);
  });

  test("Rejects forged signature", () => {
    const payload = JSON.stringify({ event: "message_delivered" });
    const fakeSignature = "sha256=abcdef1234567890";
    const isValid = verifyWebhookSignature(payload, fakeSignature, "test_meta_app_secret");
    assert.strictEqual(isValid, false);
  });
});

describe("Reminder Engine: Sending Hours & Rules", () => {
  test("Verifies sending hours window evaluation", () => {
    // 00:00 to 23:59 should always return true
    const isAlwaysOpen = isWithinSendingHours({ start: "00:00", end: "23:59" }, "Asia/Kolkata");
    assert.strictEqual(isAlwaysOpen, true);
  });

  test("Seeds expected default templates", () => {
    const templates = getDefaultTemplates("Bright Academy");
    assert.strictEqual(Array.isArray(templates), true);
    assert.ok(templates.length >= 4);
    assert.ok(templates.some((t) => t.category === "due_soon"));
    assert.ok(templates.some((t) => t.category === "due_today"));
    assert.ok(templates.some((t) => t.category === "overdue"));
  });
});
