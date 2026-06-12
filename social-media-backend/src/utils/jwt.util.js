const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

const JWT_ALGORITHM = 'HS256';

const signAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
    algorithm: JWT_ALGORITHM,
  });
};

const signRefreshToken = (payload) => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
    algorithm: JWT_ALGORITHM,
  });
};

const verifyAccessToken = (token) => {
  // Explicitly restrict algorithms — prevents 'none' algorithm confusion attack
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] });
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] });
};

/**
 * SHA-256 hex hash of a token — used when storing refresh tokens in DB
 * so the raw token is never persisted.
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, hashToken };

