const cloudinary = require("../Config/cloudinary");
const streamifier = require("streamifier");

const uploadToCloudinary = (buffer, folder,resource_type="auto") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type
      },
      (err, result) => {
        if (err) return reject(err);

        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

module.exports = uploadToCloudinary;