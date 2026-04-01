const { verifyAccessToken } = require('../utils/jwt.util');
const { sendError } = require('../utils/response.util');

/**
 * Protect routes — verifies the Bearer access token in the Authorization header.
 * Attaches req.user = { id, email } on success.
 * Returns 401 with specific error codes so the frontend can react correctly.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'No token provided', 401, 'AUTH_TOKEN_MISSING');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.id, email: decoded.email };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'Token expired', 401, 'AUTH_TOKEN_EXPIRED');
    }
    return sendError(res, 'Invalid token', 401, 'AUTH_TOKEN_INVALID');
  }
};

module.exports = { authenticate };
