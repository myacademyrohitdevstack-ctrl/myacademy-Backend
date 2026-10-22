const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const controller = require("../Controllers/whatsappReminders");

// All admin reminder routes require authentication and admin role
router.use(protect, authorize("admin"));

// Dashboard & Metrics
router.get("/dashboard", controller.getDashboard);

// History & Listing
router.get("/", controller.listReminders);
router.get("/:reminderId", controller.getReminderById);

// Manual & Bulk Reminders
router.post("/preview", controller.previewReminder);
router.post("/send", controller.sendManualReminder);
router.post("/bulk-send", controller.sendBulkReminders);
router.post("/:reminderId/confirm-manual-send", controller.confirmManualSend);
router.post("/:reminderId/retry", controller.retryReminder);
router.post("/:reminderId/cancel", controller.cancelReminder);

// Settings & Automation Rules
router.get("/settings/rules", controller.getSettings);
router.patch("/settings/rules", controller.updateSettings);
router.post("/settings/trigger-run", controller.triggerAutomaticRun);

// Message Templates
router.get("/templates/all", controller.listTemplates);
router.post("/templates", controller.createTemplate);
router.patch("/templates/:templateId", controller.updateTemplate);
router.delete("/templates/:templateId", controller.deleteTemplate);
router.post("/templates/reset-defaults", controller.resetDefaultTemplates);

// WhatsApp Integration
router.get("/integration/status", controller.getIntegration);
router.post("/integration/save", controller.saveIntegration);
router.post("/integration/test", controller.testIntegrationConnection);
router.delete("/integration/disconnect", controller.disconnectIntegration);

// Scheduled Reminders
router.get("/scheduled/list", controller.listScheduled);
router.post("/scheduled/create", controller.scheduleReminder);
router.delete("/scheduled/:reminderId", controller.cancelReminder);

module.exports = router;
