const uploadToCloudinary = require("../Utils/Cloudinary");
const cloudinary = require("../Config/cloudinary");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");

const updateProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Image is required.",
    });
  }

  const user = await User.findOne({
    _id: req.user._id,
    academyId: req.academy._id,
      isDeleted:false
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  const oldPublicId = user.profileImage?.publicId;

  let uploadedImage;

  try {
    // Upload new image
    uploadedImage = await uploadToCloudinary(
      req.file.buffer,
      `academies/${req.academy._id}/users/profile`
    );

    // Update database
    user.profileImage = {
      url: uploadedImage.secure_url,
      publicId: uploadedImage.public_id,
    };

    await user.save();

    // Delete old image only after successful DB update
    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (err) {
        console.error(
          "Failed to delete old profile image:",
          err.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile image updated successfully.",
      user: {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profileImage: user.profileImage,
      },
    });
  } catch (err) {
    // Rollback uploaded image if DB update failed
    if (uploadedImage?.public_id) {
      try {
        await cloudinary.uploader.destroy(uploadedImage.public_id);
      } catch (rollbackError) {
        console.error(
          "Failed to rollback uploaded image:",
          rollbackError.message
        );
      }
    }

    throw err;
  }
});

module.exports = {
  updateProfileImage,
};