const cloudinary = require('cloudinary').v2;
const env = require('./env');
const logger = require('../utils/logger');

if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info('Cloudinary configured');
} else {
  logger.warn('Cloudinary not configured — image uploads will fail (set CLOUDINARY_* env vars)');
}

module.exports = cloudinary;
