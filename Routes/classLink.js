const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { deleteClassLink, updateClassLink, getClassLinkById, getClassLinks, createClassLink } = require("../Controllers/classLink");
const router = express.Router();
router.post(
  "/:batchId/add",
  protect,
  authorize("admin"),
  createClassLink
);

router.get(
  "/:batchId/class-links",
  protect,
  getClassLinks
);

router.get(
  "/batches/:batchId/class-links/:classLinkId",
  protect,
  getClassLinkById
);

router.patch(
  "/batches/:batchId/class-links/:classLinkId",
  protect,
  updateClassLink
);

router.delete(
  "/:classLinkId/delete",
  protect,
  deleteClassLink
);
module.exports=router