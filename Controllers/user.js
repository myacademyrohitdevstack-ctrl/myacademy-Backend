
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

  // Get current user
  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  const oldPublicId = user.profileImage?.publicId;

  // Upload new image first
  const result = await uploadToCloudinary(
    req.file.buffer,
    "students/profile"
  );

  // Update database
  user.profileImage = {
    url: result.secure_url,
    publicId: result.public_id,
  };

  await user.save();

  // Delete old image after successful upload & DB update
  if (oldPublicId) {
    try {
      await cloudinary.uploader.destroy(oldPublicId);
    } catch (err) {
      console.error("Failed to delete old image:", err.message);
    }
  }

  return res.status(200).json({
    success: true,
    message: "Profile image updated successfully.",
    user: {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profileImage: user.profileImage,
      role:user.role
    },
  });
});

module.exports = {
  updateProfileImage,
};