const express = require("express");
const { getUsers, approveUser } = require("../Controllers/admin");

const router = express.Router();
router.get('/users',getUsers)
router.patch('/user/:id/approve',approveUser)
module.exports = router;