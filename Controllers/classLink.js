const ClassLink = require("../Modals/ClassLink");
const Batch = require("../Modals/Batches");
const asyncHandler = require("../Utils/asyncHandler");

const createClassLink = asyncHandler(async (req, res) => {
 
  const batch = await Batch.findOne({
   _id: req.params.batchId,
   academyId:req.academy._id,
     isDeleted:false
});

  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Batch not found.",
    });
  }
  
if (
  req.user.role === "teacher" &&
  !batch.trainers.some(
    trainer => trainer.toString() === req.user._id.toString()
  )
) {
  return res.status(403).json({
    success: false,
    message: "You are not authorized to create class links for this batch.",
  });
}
  const existingClassLinks=await ClassLink.countDocuments({
    batch: batch._id,
    academyId:req.academy._id,
      isDeleted:false
  });
  const classLink = await ClassLink.create({
    title: req.body.title,
    meetingLink: req.body.meetingLink,
    meetingDate: req.body.meetingDate,
    description: req.body.description,
    batch: batch._id,
    createdBy: req.user._id,
    classNumber:existingClassLinks+1,
    academyId:req.academy._id
  });

  res.status(201).json({
    success: true,
    message: "Class link created successfully.",
    classLink,
  });
});
const getClassLinks = asyncHandler(
  async (req, res) => {
    const batch = await Batch.findOne({
  _id: req.params.batchId,
  academyId: req.academy._id,
    isDeleted:false
});

if (!batch) {
  return res.status(404).json({
    success: false,
    message: "Batch not found.",
  });
}
    const classLinks = await ClassLink.find({
      batch: req.params.batchId,
      academyId:req.academy._id,
        isDeleted:false
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
    const classLink = await ClassLink.findOne({
      _id:req.params.classLinkId,
      academyId:req.academy._id,
        isDeleted:false

  });

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
      await ClassLink.findOneAndUpdate({
        _id:req.params.classLinkId,
        academyId:req.academy._id,
          isDeleted:false
      },{
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
const deleteClassLink = asyncHandler(async (req, res) => {
  const classLink = await ClassLink.findOne({
    _id: req.params.classLinkId,
    academyId: req.academy._id,
    isDeleted: false,
  });

  if (!classLink) {
    return res.status(404).json({
      success: false,
      message: "Class link not found.",
    });
  }

  // Teachers can delete only their own class links
  if (
    req.user.role === "teacher" &&
    classLink.createdBy.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to delete this class link.",
    });
  }

  classLink.isDeleted = true;
  classLink.deletedAt = new Date();
  classLink.deletedBy = req.user._id;

  await classLink.save();

  return res.status(200).json({
    success: true,
    message: "Class link deleted successfully.",
  });
});
module.exports={createClassLink,getClassLinks,getClassLinkById,deleteClassLink,updateClassLink}