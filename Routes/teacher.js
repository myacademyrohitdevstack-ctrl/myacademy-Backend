const express = require("express");

const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { getTeacherDashboardStats, getTeacherRecentEnrollments, getTeacherClasses, getTeacherAnnouncements, getTeacherCourses } = require("../Controllers/teacher");

const router = express.Router();

router.get('/dashboard-stats',protect,authorize("teacher"),getTeacherDashboardStats)
router.get('/dashboard-enrollments',protect,authorize("teacher"),getTeacherRecentEnrollments)
router.get('/dashboard-classes',protect,authorize("teacher"),getTeacherClasses)
router.get('/dashboard-anouncements',protect,authorize("teacher"),getTeacherAnnouncements)
router.get('/courses',protect,authorize("teacher"),getTeacherCourses)
module.exports = router;