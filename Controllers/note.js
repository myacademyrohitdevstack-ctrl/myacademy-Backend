const Note = require("../Modals/Note");
const Batch = require("../Modals/Batches");

const createNote = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(
    req.params.batchId
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found.",
    });
  }

  const note = await Note.create({
    title: req.body.title,
    description: req.body.description,
    batch: batch._id,

    file: {
      public_id: req.body.public_id,
      url: req.body.url,
      originalName: req.body.originalName,
      size: req.body.size,
    },

    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: "Note uploaded successfully.",
    note,
  });
});
const getNotes = asyncHandler(async (req, res) => {
  const notes = await Note.find({
    batch: req.params.batchId,
  })
    .populate("createdBy", "fullName")
    .sort("-createdAt");

  res.status(200).json({
    success: true,
    count: notes.length,
    notes,
  });
});
const getNoteById = asyncHandler(async (req, res) => {
  const note = await Note.findById(
    req.params.noteId
  );

  if (!note) {
    return res.status(404).json({
      success: false,
      message: "Note not found.",
    });
  }

  res.status(200).json({
    success: true,
    note,
  });
});
const updateNote = asyncHandler(async (req, res) => {
  const note = await Note.findByIdAndUpdate(
    req.params.noteId,
    {
      $set: req.body,
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!note) {
    return res.status(404).json({
      success: false,
      message: "Note not found.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Note updated successfully.",
    note,
  });
});
const deleteNote = asyncHandler(async (req, res) => {
  const note = await Note.findByIdAndDelete(
    req.params.noteId
  );

  if (!note) {
    return res.status(404).json({
      success: false,
      message: "Note not found.",
    });
  }

  res.status(200).json({
    success: true,
    message: "Note deleted successfully.",
  });
});
module.exports={createNote,getNotes,getNoteById,updateNote,deleteNote}