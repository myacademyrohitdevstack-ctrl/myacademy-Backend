

const User  = require("../Modals/User");
const mongoose=require('mongoose')
const Student  = require("../Modals/Student");
const asyncHandler = require("../Utils/asyncHandler");
const flatten = require("../Utils/flattenobject");
const Batches = require("../Modals/Batches");
const USER_FIELDS = [
  "fullName",
  "email",
  "phone",
];
 const getMyProfile = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    user: req.user._id,
  }).populate(
    "user",
    "fullName email profileImage role approvalStatus"
  );

  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found.",
    });
  }

  res.json({
    success: true,
    student,
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const userId = req.user._id;
    const body = req.body;

    const userUpdates = {};
    const studentUpdates = {};

    for (const [key, value] of Object.entries(body)) {
      if (USER_FIELDS.includes(key)) {
        userUpdates[key] = value;
      } else {
        studentUpdates[key] = value;
      }
    }
  
    if (Object.keys(userUpdates).length) {
      await User.findByIdAndUpdate(
        userId,
        { $set: userUpdates },
        {
          session,
          runValidators: true,
        }
      );
    }

    if (Object.keys(studentUpdates).length) {
      await Student.findOneAndUpdate(
        { user: userId },
        {
          $set: flatten(studentUpdates),
        },
        {
          session,
          runValidators: true,
        }
      );
    }

    await session.commitTransaction();

    const [updatedUser, updatedStudent] = await Promise.all([
      User.findById(userId).select(
        "fullName email phone profileImage"
      ),
      Student.findOne({ user: userId }).select(
        "dateOfBirth gender languageLevel address guardian emergencyContact"
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        user: updatedUser,
        profile: updatedStudent,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});
 const getStudentById = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate("user");

  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found.",
    });
  }

  res.json({
    success: true,
    student,
  });
});
const getStudentBatches = asyncHandler(
  async (req, res) => {
    const batches = await Batches.find({
      students: req.params.studentId,
    })
      .populate("course", "title")
      .sort("-createdAt");

    res.status(200).json({
      success: true,
      count: batches.length,
      batches,
    });
  }
);
// export const getAllStudents = asyncHandler(async (req, res) => {
//   const students = await Student.find()
//     .populate("user", "fullName email profileImage")
//     .sort("-createdAt");

//   res.json({
//     success: true,
//     count: students.length,
//     students,
//   });
// });
module.exports={getMyProfile,updateProfile,getStudentById,getStudentBatches}