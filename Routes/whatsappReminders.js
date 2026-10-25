const express = require("express");
const router = express.Router();
const protect = require("../Middleware/protect");
const {
  requirePermissionOrRole,
} = require("../Middleware/authorizePermission");
const controller = require("../Controllers/whatsappReminders");

// All reminder routes require authentication
router.use(protect);

// Dashboard & Metrics
router.get("/dashboard", requirePermissionOrRole("reminders.read", "admin"), controller.getDashboard);

// History & Listing
router.get("/", requirePermissionOrRole("reminders.read", "admin"), controller.listReminders);
router.get("/:reminderId", requirePermissionOrRole("reminders.read", "admin"), controller.getReminderById);

// Manual & Bulk Reminders
router.post("/preview", requirePermissionOrRole("reminders.send", "admin"), controller.previewReminder);
router.post("/send", requirePermissionOrRole("reminders.send", "admin"), controller.sendManualReminder);
router.post("/bulk-send", requirePermissionOrRole("reminders.send", "admin"), controller.sendBulkReminders);
router.post("/:reminderId/confirm-manual-send", requirePermissionOrRole("reminders.send", "admin"), controller.confirmManualSend);
router.post("/:reminderId/retry", requirePermissionOrRole("reminders.send", "admin"), controller.retryReminder);
router.post("/:reminderId/cancel", requirePermissionOrRole("reminders.send", "admin"), controller.cancelReminder);

// Settings & Automation Rules
router.get("/settings/rules", requirePermissionOrRole("reminders.read", "admin"), controller.getSettings);
router.patch("/settings/rules", requirePermissionOrRole("reminders.send", "admin"), controller.updateSettings);
router.post("/settings/trigger-run", requirePermissionOrRole("reminders.send", "admin"), controller.triggerAutomaticRun);

// Message Templates
router.get("/templates/all", requirePermissionOrRole("reminders.read", "admin"), controller.listTemplates);
router.post("/templates", requirePermissionOrRole("reminders.send", "admin"), controller.createTemplate);
router.patch("/templates/:templateId", requirePermissionOrRole("reminders.send", "admin"), controller.updateTemplate);
router.delete("/templates/:templateId", requirePermissionOrRole("reminders.send", "admin"), controller.deleteTemplate);
router.post("/templates/reset-defaults", requirePermissionOrRole("reminders.send", "admin"), controller.resetDefaultTemplates);

// WhatsApp Integration (Credentials & Gateway setup)
router.get("/integration/status", requirePermissionOrRole("reminders.read", "admin"), controller.getIntegration);
router.post("/integration/save", requirePermissionOrRole("academy_settings.update", "admin"), controller.saveIntegration);
router.post("/integration/test", requirePermissionOrRole("academy_settings.update", "admin"), controller.testIntegrationConnection);
router.delete("/integration/disconnect", requirePermissionOrRole("academy_settings.update", "admin"), controller.disconnectIntegration);

// Scheduled Reminders
router.get("/scheduled/list", requirePermissionOrRole("reminders.read", "admin"), controller.listScheduled);
router.post("/scheduled/create", requirePermissionOrRole("reminders.send", "admin"), controller.scheduleReminder);
router.delete("/scheduled/:reminderId", requirePermissionOrRole("reminders.send", "admin"), controller.cancelReminder);

module.exports = router;
