const ClassLink = require("../Modals/ClassLink");
const Batch = require("../Modals/Batches");

const createClassLink = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(
    req.params.batchId
  );

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found.",
    });
  }

  const classLink = await ClassLink.create({
    title: req.body.title,
    meetingLink: req.body.meetingLink,
    meetingDate: req.body.meetingDate,
    description: req.body.description,
    batch: batch._id,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: "Class link created successfully.",
    classLink,
  });
});
const getClassLinks = asyncHandler(
  async (req, res) => {
    const classLinks = await ClassLink.find({
      batch: req.params.batchId,
    })
      .populate("createdBy", "fullName")
      .sort({ meetingDate: 1 });

    res.status(200).json({
      success: true,
      count: classLinks.length,
      classLinks,
    });
  }
);
const getClassLinkById = asyncHandler(
  async (req, res) => {
    const classLink = await ClassLink.findById(
      req.params.classLinkId
    );

    if (!classLink) {
      return res.status(404).json({
        success: false,
        message: "Class link not found.",
      });
    }

    res.status(200).json({
      success: true,
      classLink,
    });
  }
);
const updateClassLink = asyncHandler(
  async (req, res) => {
    const classLink =
      await ClassLink.findByIdAndUpdate(
        req.params.classLinkId,
        {
          $set: req.body,
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!classLink) {
      return res.status(404).json({
        success: false,
        message: "Class link not found.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Class link updated successfully.",
      classLink,
    });
  }
);
const deleteClassLink = asyncHandler(
  async (req, res) => {
    const classLink =
      await ClassLink.findByIdAndDelete(
        req.params.classLinkId
      );

    if (!classLink) {
      return res.status(404).json({
        success: false,
        message: "Class link not found.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Class link deleted successfully.",
    });
  }
);
module.exports={createClassLink,getClassLinks,getClassLinkById,deleteClassLink,updateClassLink}