const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User.model');
const RefreshToken = require('../models/RefreshToken.model');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } = require('../utils/jwt.util');
const env = require('../config/env');

const BCRYPT_ROUNDS = 12;
const DEFAULT_AVATAR_BASE_URL = 'https://xsgames.co/randomusers/assets/avatars/male';
const DEFAULT_AVATAR_COUNT = 50;

// Cookie options for the httpOnly refresh token
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'Strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
};

/**
 * Issue a token pair and persist the hashed refresh token in DB.
 * Also sets the httpOnly cookie on the response.
 */
const issueTokens = async (user, res, meta = {}) => {
  const payload = {
    id: user._id.toString(),
    email: user.email,
    jti: crypto.randomUUID(),
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Persist hashed refresh token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({
    userId: user._id,
    token: hashToken(refreshToken),
    expiresAt,
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
  });

  // Set httpOnly cookie
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

  return accessToken;
};

const getDefaultAvatarUrl = async () => {
  const userCount = await User.estimatedDocumentCount();
  const avatarNumber = (userCount % DEFAULT_AVATAR_COUNT) + 1;
  return `${DEFAULT_AVATAR_BASE_URL}/${avatarNumber}.jpg`;
};

/**
 * Register a new user.
 */
const register = async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('Email already in use');
    err.statusCode = 409;
    err.code = 'EMAIL_TAKEN';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({
    firstName,
    lastName,
    email,
    passwordHash,
    avatar: {
      url: await getDefaultAvatarUrl(),
      publicId: null,
    },
  });

  const accessToken = await issueTokens(user, res, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  return { user: user.toPublicJSON(), accessToken };
};

/**
 * Login an existing user.
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findByEmail(email);
  if (!user || !user.isActive) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const accessToken = await issueTokens(user, res, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  return { user: user.toPublicJSON(), accessToken };
};

/**
 * Refresh token rotation.
 * Verifies the cookie, checks the hash in DB, deletes the old token, issues a new pair.
 */
const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    const err = new Error('No refresh token');
    err.statusCode = 401;
    err.code = 'AUTH_TOKEN_MISSING';
    throw err;
  }

  // Verify JWT signature and expiry first (cheap check)
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    err.code = 'AUTH_TOKEN_INVALID';
    throw err;
  }

  // Verify hash exists in DB (detects token reuse after logout)
  const hashed = hashToken(token);
  const stored = await RefreshToken.findOne({ token: hashed });
  if (!stored) {
    const err = new Error('Refresh token not recognised — please log in again');
    err.statusCode = 401;
    err.code = 'AUTH_TOKEN_REUSED';
    throw err;
  }

  // Rotate: delete old, issue new pair
  await RefreshToken.deleteOne({ _id: stored._id });

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    const err = new Error('User not found');
    err.statusCode = 401;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const accessToken = await issueTokens(user, res, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  return { accessToken };
};

/**
 * Logout — delete refresh token from DB and clear cookie.
 */
const logout = async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    await RefreshToken.deleteOne({ token: hashToken(token) });
  }

  res.clearCookie('refreshToken', { path: '/' });
};

/**
 * Get current authenticated user.
 */
const getMe = async (req) => {
  const user = await User.findById(req.user.id);
  if (!user || !user.isActive) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  return user.toPublicJSON();
};

module.exports = { register, login, refresh, logout, getMe };
