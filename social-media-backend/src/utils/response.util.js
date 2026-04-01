/**
 * Send a successful JSON response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {*} data
 * @param {number} statusCode
 * @param {{ nextCursor: string|null, hasMore: boolean }|null} pagination
 */
exports.sendSuccess = (res, message, data = null, statusCode = 200, pagination = null) => {
  const payload = { success: true, message, data };
  if (pagination) payload.pagination = pagination;
  return res.status(statusCode).json(payload);
};

/**
 * Send an error JSON response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} statusCode
 * @param {string} code
 * @param {Array} errors
 */
exports.sendError = (res, message, statusCode = 500, code = 'SERVER_ERROR', errors = []) => {
  return res.status(statusCode).json({ success: false, message, code, errors });
};
