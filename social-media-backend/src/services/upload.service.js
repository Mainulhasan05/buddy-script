const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');

/**
 * Upload an image buffer to Cloudinary.
 * @param {Express.Multer.File} file  — multer file object (memoryStorage)
 * @returns {{ url: string, publicId: string, width: number, height: number }}
 */
const uploadImage = (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'social-media/posts',
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (err, result) => {
        if (err) {
          logger.error(`Cloudinary upload error: ${err.message}`);
          return reject(err);
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      }
    );

    uploadStream.end(file.buffer);
  });
};

/**
 * Delete an image from Cloudinary by its publicId.
 * Failures are logged but not thrown — deletion is best-effort.
 */
const deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.error(`Cloudinary delete error [${publicId}]: ${err.message}`);
  }
};

module.exports = { uploadImage, deleteImage };
