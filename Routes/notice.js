const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { createNotice, getNotices, getNoticeById, updateNotice, deleteNotice } = require("../Controllers/notice");




const router = express.Router();
router.post(
  "/batches/:batchId/notices",
  protect,
  createNotice
);

router.get(
  "/batches/:batchId/notices",
  protect,
  getNotices
);

router.get(
  "/batches/:batchId/notices/:noticeId",
  protect,
  getNoticeById
);

router.patch(
  "/batches/:batchId/notices/:noticeId",
  protect,
  updateNotice
);

router.delete(
  "/batches/:batchId/notices/:noticeId",
  protect,
  deleteNotice
);
module.exports=router