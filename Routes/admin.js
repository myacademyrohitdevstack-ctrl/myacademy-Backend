const express = require("express");
const { getUsers, approveUser, rejectUser, blockUser, unblockUser, getUserById, updateUserByAdmin, getDashboardStats, getRecentEnrollments, getallClasses, getallAnnouncement, createStudent, deleteUserByAdmin } = require("../Controllers/admin");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");

const router = express.Router();
router.get('/users',protect,authorize("admin"),getUsers)
router.get('/user/:id',protect,authorize("admin"),getUserById)
router.get('/dashboard-stats',protect,authorize("admin"),getDashboardStats)
router.get('/recent-activties',protect,authorize("admin"),getRecentEnrollments)
router.get('/all-classes',protect,authorize("admin"),getallClasses)
router.get('/all-announcements',protect,authorize("admin"),getallAnnouncement)
router.patch('/user/:id/approve',protect,authorize("admin"),approveUser)
router.patch('/user/:id/reject',protect,authorize("admin"),rejectUser)
router.patch('/user/:id/block',protect,authorize("admin"),blockUser)
router.patch('/user/:id/unblock',protect,authorize("admin"),unblockUser)
router.patch('/user/:id/update',protect,authorize("admin"),updateUserByAdmin)
router.post('/create-student',protect,authorize("admin"),createStudent)
router.delete('/user/:id',protect,authorize("admin"),deleteUserByAdmin)
module.exports = router;