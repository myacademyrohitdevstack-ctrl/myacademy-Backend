const express = require('express');
const protect = require('../Middleware/protect');
const requireSuperAdmin = require('../Middleware/requireSuperAdmin');
const controller = require('../Controllers/superAdmin');
const router = express.Router();

router.use(protect, requireSuperAdmin);
router.get('/dashboard', controller.getDashboard);
router.get('/academies', controller.listAcademies);
router.patch('/academies/:academyId/status', controller.setAcademyStatus);
router.get('/plans', controller.listPlans);
router.post('/plans', controller.createPlan);
router.patch('/plans/:planId', controller.updatePlan);
router.get('/subscriptions', controller.listSubscriptions);
router.post('/subscriptions', controller.assignSubscription);
router.get('/audit-logs', controller.getAuditLogs);
module.exports = router;
