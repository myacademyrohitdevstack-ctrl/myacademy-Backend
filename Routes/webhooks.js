const express = require("express");
const router = express.Router();
const controller = require("../Controllers/whatsappReminders");

// Meta Cloud API Webhook routes (Public endpoints)
router.get("/whatsapp", controller.verifyWebhook);
router.post("/whatsapp", controller.handleWebhookEvent);

module.exports = router;
