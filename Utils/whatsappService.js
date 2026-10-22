const crypto = require("crypto");

/**
 * Normalizes and validates a phone number for WhatsApp messaging.
 * Defaults to +91 (India) if 10 digits are supplied.
 */
function normalizePhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== "string") {
    return { isValid: false, normalizedPhone: "", reason: "Phone number is empty" };
  }

  // Remove all non-digits except optional leading plus
  let cleaned = rawPhone.trim().replace(/[^0-9]/g, "");

  // If starts with 0 and 11 digits, strip leading 0
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  // If 10 digits (standard Indian mobile starting with 6, 7, 8, or 9)
  if (cleaned.length === 10) {
    if (/^[6-9]\d{9}$/.test(cleaned)) {
      return {
        isValid: true,
        normalizedPhone: "91" + cleaned,
        formattedDisplay: "+91 " + cleaned,
      };
    } else {
      return {
        isValid: false,
        normalizedPhone: cleaned,
        reason: "10-digit number must start with 6, 7, 8, or 9",
      };
    }
  }

  // If 12 digits and starts with 91
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    const localPart = cleaned.slice(2);
    if (/^[6-9]\d{9}$/.test(localPart)) {
      return {
        isValid: true,
        normalizedPhone: cleaned,
        formattedDisplay: "+91 " + localPart,
      };
    }
  }

  // Generic international format (11 to 15 digits)
  if (cleaned.length >= 11 && cleaned.length <= 15) {
    return {
      isValid: true,
      normalizedPhone: cleaned,
      formattedDisplay: "+" + cleaned,
    };
  }

  return {
    isValid: false,
    normalizedPhone: cleaned,
    reason: "Phone number must be between 10 and 15 digits in E.164 format",
  };
}

/**
 * Safely renders a template body by substituting known dynamic variables.
 * Guarantees that no raw unresolved {{variable}} tags are left behind.
 */
function renderTemplateMessage(templateBody, variables = {}) {
  if (!templateBody || typeof templateBody !== "string") {
    return "";
  }

  const {
    academyName = "MyAcademy",
    studentName = "Student",
    parentName = "Parent / Guardian",
    className = "Class",
    feeAmount = "0",
    paidAmount = "0",
    pendingAmount = "0",
    dueDate = "Promptly",
    installmentName = "Fee Installment",
    paymentLink = "",
    supportPhone = "",
  } = variables;

  const replacements = {
    "{{academyName}}": String(academyName || "").trim(),
    "{{studentName}}": String(studentName || "").trim(),
    "{{parentName}}": String(parentName || "").trim(),
    "{{className}}": String(className || "").trim(),
    "{{feeAmount}}": String(feeAmount || "0").trim(),
    "{{paidAmount}}": String(paidAmount || "0").trim(),
    "{{pendingAmount}}": String(pendingAmount || "0").trim(),
    "{{dueDate}}": String(dueDate || "Promptly").trim(),
    "{{installmentName}}": String(installmentName || "Fee Installment").trim(),
    "{{paymentLink}}": String(paymentLink || "").trim(),
    "{{supportPhone}}": String(supportPhone || "").trim(),
  };

  let rendered = templateBody;
  for (const [key, val] of Object.entries(replacements)) {
    // Replace all occurrences of the dynamic tag
    rendered = rendered.split(key).join(val);
  }

  // Remove any remaining unrecognized {{...}} patterns gracefully
  rendered = rendered.replace(/\{\{[a-zA-Z0-9_-]+\}\}/g, "");

  // Clean multiple blank lines
  rendered = rendered.replace(/\n{3,}/g, "\n\n").trim();

  return rendered;
}

/**
 * Generates an official WhatsApp Click-to-Chat URL.
 */
function generateClickToChatUrl(normalizedPhone, messageText) {
  const cleanPhone = normalizedPhone.replace(/[^0-9]/g, "");
  const encodedText = encodeURIComponent(messageText);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Sends a message using Meta's official WhatsApp Business Cloud API.
 */
async function sendMetaCloudMessage({
  phoneNumberId,
  accessToken,
  toPhone,
  messageText,
  templateName = null,
  templateLanguage = "en",
  templateParams = [],
}) {
  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp Cloud API credentials (phone number ID and access token) are required.");
  }

  const cleanPhone = toPhone.replace(/[^0-9]/g, "");
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  let payload;
  if (templateName) {
    // Business-initiated template message
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage || "en" },
        components:
          templateParams.length > 0
            ? [
                {
                  type: "body",
                  parameters: templateParams.map((param) => ({
                    type: "text",
                    text: String(param || ""),
                  })),
                },
              ]
            : undefined,
      },
    };
  } else {
    // Plain text message
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
      type: "text",
      text: {
        preview_url: false,
        body: messageText,
      },
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || `Meta API returned HTTP ${response.status}`;
      const errorCode = data?.error?.code || response.status;
      const errorSubcode = data?.error?.error_subcode || null;

      const isRateLimit = response.status === 429 || errorCode === 130429 || errorCode === 80007;
      const isPermanent = errorCode === 100 || errorCode === 190 || errorCode === 131026; // Invalid parameter, expired token, etc.

      const err = new Error(errorMsg);
      err.metaCode = errorCode;
      err.metaSubcode = errorSubcode;
      err.isRateLimit = isRateLimit;
      err.isPermanent = isPermanent;
      err.providerResponse = data;
      throw err;
    }

    const messageId = data?.messages?.[0]?.id || null;
    return {
      success: true,
      messageId,
      providerResponse: data,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      const err = new Error("Meta WhatsApp Cloud API request timed out after 15 seconds.");
      err.isTimeout = true;
      throw err;
    }
    throw error;
  }
}

/**
 * Validates a Meta incoming webhook payload signature using SHA256 HMAC.
 */
function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !appSecret) return true; // If no app secret configured, pass
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expectedSignature = signatureHeader.slice(7);
  const hmac = crypto.createHmac("sha256", appSecret);
  const digest = hmac.update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(expectedSignature, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Recommended default templates for an academy.
 */
function getDefaultTemplates(academyName = "MyAcademy") {
  return [
    {
      name: "Upcoming Fee Reminder (3 Days)",
      category: "due_soon",
      providerTemplateName: "fee_due_soon",
      messageBody: `Dear {{parentName}},\n\nThis is a friendly reminder from {{academyName}} that the fee installment for {{studentName}} ({{className}}) is due in 3 days.\n\n• Installment: {{installmentName}}\n• Due Date: {{dueDate}}\n• Outstanding Amount: ₹{{pendingAmount}}\n\nPlease ensure timely payment to avoid late fees. Thank you for your continued support!\n\nRegards,\n{{academyName}}`,
      isDefault: true,
    },
    {
      name: "Fee Due Today Notice",
      category: "due_today",
      providerTemplateName: "fee_due_today",
      messageBody: `Dear {{parentName}},\n\nThis is to notify you that the fee installment for {{studentName}} ({{className}}) is due TODAY, {{dueDate}}.\n\n• Installment: {{installmentName}}\n• Amount Due: ₹{{pendingAmount}}\n\nKindly make the payment today via online portal or at the academy accounts desk.\n\nThank you,\n{{academyName}}`,
      isDefault: true,
    },
    {
      name: "Overdue Fee Alert",
      category: "overdue",
      providerTemplateName: "fee_overdue_notice",
      messageBody: `URGENT: Fee Overdue Notice\n\nDear {{parentName}},\n\nThe fee installment for {{studentName}} was due on {{dueDate}} and remains unpaid.\n\n• Overdue Amount: ₹{{pendingAmount}}\n• Total Pending: ₹{{pendingAmount}}\n\nPlease clear the outstanding dues immediately to avoid late penalties or disruption in academic batches.\n\nIf you have already paid, please contact {{supportPhone}}.\n\n{{academyName}}`,
      isDefault: true,
    },
    {
      name: "Consolidated Outstanding Balance",
      category: "general",
      providerTemplateName: "fee_consolidated_summary",
      messageBody: `Fee Statement from {{academyName}}\n\nHello {{parentName}},\n\nHere is the current fee ledger summary for {{studentName}} ({{className}}):\n\n• Total Payable: ₹{{feeAmount}}\n• Amount Paid: ₹{{paidAmount}}\n• Outstanding Balance: ₹{{pendingAmount}}\n\nPlease contact the academy office or use the payment portal to clear the balance.\n\nBest regards,\n{{academyName}}`,
      isDefault: true,
    },
  ];
}

module.exports = {
  normalizePhoneNumber,
  renderTemplateMessage,
  generateClickToChatUrl,
  sendMetaCloudMessage,
  verifyWebhookSignature,
  getDefaultTemplates,
};
