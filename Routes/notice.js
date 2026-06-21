const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { createNotice, getNotices, getNoticeById, updateNotice, deleteNotice } = require("../Controllers/notice");




const router = express.Router();
router.post(
  "/batches/:batchId/notices",
  createNotice
);

router.get(
  "/batches/:batchId/notices",
  getNotices
);

router.get(
  "/batches/:batchId/notices/:noticeId",
  getNoticeById
);

router.patch(
  "/batches/:batchId/notices/:noticeId",
  updateNotice
);

router.delete(
  "/batches/:batchId/notices/:noticeId",
  deleteNotice
);
module.exports=router