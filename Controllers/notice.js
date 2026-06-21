const Notice = require("../Modals/Notice");
const Batch = require("../Modals/Batches");

const createNotice = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(
    req.params.batchId
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found.",
    });
  }

  const notice = await Notice.create({
    title: req.body.title,
    content: req.body.content,
    batch: batch._id,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: "Notice created successfully.",
    notice,
  });
});
const getNotices = asyncHandler(async (req, res) => {
  const notices = await Notice.find({
    batch: req.params.batchId,
  })
    .populate("createdBy", "fullName")
    .sort("-createdAt");

  res.status(200).json({
    success: true,
    count: notices.length,
    notices,
  });
});
const getNoticeById = asyncHandler(
  async (req, res) => {
    const notice = await Notice.findById(
      req.params.noticeId
    ).populate(
      "createdBy",
      "fullName email"
    );

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found.",
      });
    }

    res.status(200).json({
      success: true,
      notice,
    });
  }
);
const updateNotice = asyncHandler(
  async (req, res) => {
    const notice =
      await Notice.findByIdAndUpdate(
        req.params.noticeId,
        {
          $set: req.body,
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Notice updated successfully.",
      notice,
    });
  }
);
const deleteNotice = asyncHandler(
  async (req, res) => {
    const notice =
      await Notice.findByIdAndDelete(
        req.params.noticeId
      );

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Notice deleted successfully.",
    });
  }
);

module.exports={createNotice,getNoticeById,getNotices,updateNotice,deleteNotice}