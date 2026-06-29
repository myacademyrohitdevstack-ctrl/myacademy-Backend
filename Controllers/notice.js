const Notice = require("../Modals/Notice");
const Batch = require("../Modals/Batches");

const createNotice = asyncHandler(async (req, res) => {
  const batch = await Batch.findOne({
    _id:req.params.batchId,
    academy:req.academy._id,
      isDeleted:false
});

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
    academyId:req.academy._id
  });

  res.status(201).json({
    success: true,
    message: "Notice created successfully.",
    notice,
  });
});
const getNotices = asyncHandler(async (req, res) => {
  const batch = await Batch.findOne({
    _id: req.params.batchId,
    academy: req.academy._id,
      isDeleted:false
});

if (!batch) {
    return res.status(404).json({
        success:false,
        message:"Batch not found."
    });
}
  const notices = await Notice.find({
    batch: req.params.batchId,
    academyId:req.academy._id,
      isDeleted:false
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
    const notice = await Notice.findOne({
      _id:req.params.noticeId,
      academyId:req.academy._id,
        isDeleted:false
  }).populate(
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
  const { title, content } = req.body;

const notice = await Notice.findOneAndUpdate(
  {
    _id: req.params.noticeId,
    academyId: req.academy._id,
      isDeleted:false
  },
  {
    title,
    content,
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
  const notice = await Notice.findOneAndUpdate(
  {
    _id: req.params.noticeId,
    academyId: req.academy._id,
    isDeleted: false,
  },
  {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: req.user._id,
  },
  {
    new: true,
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
        "Notice deleted successfully.",
    });
  }
);

module.exports={createNotice,getNoticeById,getNotices,updateNotice,deleteNotice}