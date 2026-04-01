const logger = require('../utils/logger');
const { sendError } = require('../utils/response.util');

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, { stack: err.stack });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return sendError(res, 'Validation failed', 422, 'VALIDATION_ERROR', errors);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return sendError(res, `${field} already exists`, 409, 'DUPLICATE_KEY');
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === 'CastError') {
    return sendError(res, 'Invalid ID format', 400, 'INVALID_ID');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token', 401, 'AUTH_TOKEN_INVALID');
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'Token expired', 401, 'AUTH_TOKEN_EXPIRED');
  }

  // Zod validation (passed via next(err) from validate middleware)
  if (err.name === 'ZodError') {
    const errors = err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }));
    return sendError(res, 'Validation failed', 422, 'VALIDATION_ERROR', errors);
  }

  // Application-level errors with explicit status
  if (err.statusCode) {
    return sendError(res, err.message, err.statusCode, err.code || 'APP_ERROR');
  }

  // Fallback
  return sendError(res, 'Internal server error', 500, 'SERVER_ERROR');
};

module.exports = errorMiddleware;
