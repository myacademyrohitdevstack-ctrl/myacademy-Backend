const express = require("express");
const { getUsers, approveUser, rejectUser, blockUser, unblockUser } = require("../Controllers/admin");

const router = express.Router();
router.get('/users',getUsers)
router.patch('/user/:id/approve',approveUser)
router.patch('/user/:id/reject',rejectUser)
router.patch('/user/:id/block',blockUser)
router.patch('/user/:id/unblock',unblockUser)
module.exports = router;