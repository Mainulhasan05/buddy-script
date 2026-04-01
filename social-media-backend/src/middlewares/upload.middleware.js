const multer = require('multer');
const { sendError } = require('../utils/response.util');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter,
});

/**
 * Wraps multer errors so they flow through the global error handler
 * with the correct HTTP status instead of crashing.
 */
const handleUploadError = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 'File too large. Maximum size is 5 MB', 413, 'FILE_TOO_LARGE');
    }
    if (err instanceof multer.MulterError) {
      return sendError(res, err.message, 400, 'UPLOAD_ERROR');
    }
    // fileFilter rejection
    return sendError(res, err.message, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });
};

module.exports = {
  uploadSingle: handleUploadError(upload.single('image')),
};
