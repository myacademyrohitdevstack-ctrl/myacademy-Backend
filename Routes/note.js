const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { createNote, getNotes, getNoteById, updateNote, deleteNote } = require("../Controllers/note");
const upload = require("../Middleware/upload");





const router = express.Router();
router.post(
  "/:batchId/add",
  protect,
  authorize("admin"),
  upload.single("file"),
  createNote
);

router.get(
  "/:batchId/notes",
  protect,
  getNotes
);

router.get(
  "/batches/:batchId/notes/:noteId",
  protect,
  getNoteById
);

router.patch(
  "/batches/:batchId/notes/:noteId",
  protect,
  updateNote
);

router.delete(
  "/:noteId/delete",
  protect,
  deleteNote
);
module.exports=router