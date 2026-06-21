const express = require("express");
const protect = require("../Middleware/protect");
const authorize = require("../Middleware/authorize");
const { createNote, getNotes, getNoteById, updateNote, deleteNote } = require("../Controllers/note");





const router = express.Router();
router.post(
  "/batches/:batchId/notes",
  createNote
);

router.get(
  "/batches/:batchId/notes",
  getNotes
);

router.get(
  "/batches/:batchId/notes/:noteId",
  getNoteById
);

router.patch(
  "/batches/:batchId/notes/:noteId",
  updateNote
);

router.delete(
  "/batches/:batchId/notes/:noteId",
  deleteNote
);
module.exports=router