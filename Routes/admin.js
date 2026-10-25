const { createParent } = require("../Controllers/parent");
const express = require("express");
const {
  getSubscriptionUsage,
  getAcademyProfile,
  updateAcademyProfile,
  getUsers,
  approveUser,
  rejectUser,
  blockUser,
  unblockUser,
  getUserById,
  updateUserByAdmin,
  getDashboardStats,
  getRecentEnrollments,
  getallClasses,
  getallAnnouncement,
  createStudent,
  deleteUserByAdmin,
  createTeacher,
  bulkCreateStudents,
  bulkCreateTeachers,
} = require("../Controllers/admin");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const upload = require("../Middleware/upload");

const router = express.Router();
router.get('/academy', protect, authorize("admin"), getAcademyProfile);
router.put('/academy', protect, authorize("admin"), upload.single('logo'), updateAcademyProfile);
router.get('/academy-public', protect, getAcademyProfile);
router.get('/users', protect, authorize("admin"), getUsers);
router.get('/user/:id', protect, authorize("admin"), getUserById);
router.get('/dashboard-stats', protect, authorize("admin"), getDashboardStats);
router.get('/subscription-usage', protect, authorize("admin"), getSubscriptionUsage);
router.get('/recent-activties', protect, authorize("admin"), getRecentEnrollments);
router.get('/all-classes', protect, authorize("admin"), getallClasses);
router.get('/all-announcements', protect, authorize("admin"), getallAnnouncement);
router.patch('/user/:id/approve', protect, authorize("admin"), approveUser);
router.patch('/user/:id/reject', protect, authorize("admin"), rejectUser);
router.patch('/user/:id/block', protect, authorize("admin"), blockUser);
router.patch('/user/:id/unblock', protect, authorize("admin"), unblockUser);
router.patch('/user/:id/update', protect, authorize("admin"), updateUserByAdmin);
router.post('/create-student', protect, authorize("admin"), createStudent);
router.post('/create-teacher', protect, authorize("admin"), createTeacher);
router.post('/bulk-create-students', protect, authorize("admin"), bulkCreateStudents);
router.post('/bulk-create-teachers', protect, authorize("admin"), bulkCreateTeachers);
router.post('/create-parent', protect, authorize("admin"), createParent);
router.delete('/user/:id', protect, authorize("admin"), deleteUserByAdmin);

module.exports = router;
