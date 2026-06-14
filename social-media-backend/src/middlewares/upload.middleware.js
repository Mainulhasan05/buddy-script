const multer = require('multer');
const FileType = require('file-type');
const { sendError } = require('../utils/response.util');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

// First-pass filter — checks Content-Type header (fast but attacker-controlled)
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
 * Second-pass validation — reads file buffer magic bytes to verify actual content type.
 * This prevents uploading malicious files with a spoofed Content-Type header.
 */
const validateMagicBytes = async (req, res, next) => {
  if (!req.file) return next(); // no file uploaded — skip

  try {
    const type = await FileType.fromBuffer(req.file.buffer);

    if (!type || !ALLOWED_MIME_TYPES.includes(type.mime)) {
      return sendError(
        res,
        'Invalid file content. Only JPEG, PNG, and WebP images are allowed.',
        415,
        'UNSUPPORTED_MEDIA_TYPE'
      );
    }

    // Override the client-provided mimetype with the verified one
    req.file.mimetype = type.mime;
    return next();
  } catch (err) {
    return sendError(res, 'Failed to validate file type', 400, 'UPLOAD_ERROR');
  }
};

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
  validateMagicBytes,
};

