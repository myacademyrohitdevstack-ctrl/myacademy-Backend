const express = require('express');
const protect = require('../Middleware/protect');
const authorize = require('../Middleware/authorize');
const controller = require('../Controllers/parent');
const router = express.Router();

router.use(protect, authorize('parent'));
router.get('/children', controller.getMyChildren);
router.get('/children/:studentUserId/dashboard', controller.getChildDashboard);
router.get('/children/:studentUserId/attendance', controller.getChildAttendance);
router.get('/children/:studentUserId/fees', controller.getChildFees);
module.exports = router;
