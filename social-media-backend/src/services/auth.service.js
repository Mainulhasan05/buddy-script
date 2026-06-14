const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User.model');
const RefreshToken = require('../models/RefreshToken.model');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } = require('../utils/jwt.util');
const env = require('../config/env');

const BCRYPT_ROUNDS = 12;
const DEFAULT_AVATAR_BASE_URL = 'https://xsgames.co/randomusers/assets/avatars/male';
const DEFAULT_AVATAR_COUNT = 50;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

// Maximum active refresh tokens per user — prevents unbounded token collection growth
// from many devices, frequent refreshes, or long-lived sessions.
const MAX_ACTIVE_SESSIONS = 5;

// Cookie options for the httpOnly refresh token
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'Lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
};

/**
 * Issue a token pair and persist the hashed refresh token in DB.
 * Also sets the httpOnly cookie on the response.
 * Enforces max active sessions per user — deletes oldest tokens beyond the cap.
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

  // Enforce max active sessions — delete oldest tokens beyond the cap
  const activeTokens = await RefreshToken.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();

  if (activeTokens.length > MAX_ACTIVE_SESSIONS) {
    const idsToDelete = activeTokens.slice(MAX_ACTIVE_SESSIONS).map((t) => t._id);
    await RefreshToken.deleteMany({ _id: { $in: idsToDelete } });
  }

  // Set httpOnly cookie
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

  return accessToken;
};

const getDefaultAvatarUrl = () => {
  const avatarNumber = Math.floor(Math.random() * DEFAULT_AVATAR_COUNT) + 1;
  return `${DEFAULT_AVATAR_BASE_URL}/${avatarNumber}.jpg`;
};

const getGoogleCallbackUrl = (req) => {
  if (env.GOOGLE_CALLBACK_URL) return env.GOOGLE_CALLBACK_URL;
  return `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
};

const encodeOAuthState = (state) => {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
};

const decodeOAuthState = (state) => {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
};

const assertGoogleConfigured = () => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    const err = new Error('Google login is not configured');
    err.statusCode = 503;
    err.code = 'GOOGLE_AUTH_NOT_CONFIGURED';
    throw err;
  }
};

const getGoogleAuthUrl = (req) => {
  assertGoogleConfigured();

  const redirectTo = typeof req.query?.redirectTo === 'string' && req.query.redirectTo.startsWith('/')
    ? req.query.redirectTo
    : '/feed';

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleCallbackUrl(req),
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: encodeOAuthState({ redirectTo }),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

const exchangeGoogleCode = async (req, code) => {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: getGoogleCallbackUrl(req),
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const body = await response.json();
      errorDetail = ` (${body.error}: ${body.error_description || 'no description'})`;
    } catch { /* ignore parse errors */ }
    console.error(`Google token exchange failed: ${response.status}${errorDetail}`);
    const err = new Error('Google login failed');
    err.statusCode = 401;
    err.code = 'GOOGLE_TOKEN_EXCHANGE_FAILED';
    throw err;
  }

  return response.json();
};

const fetchGoogleProfile = async (accessToken) => {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = new Error('Google profile fetch failed');
    err.statusCode = 401;
    err.code = 'GOOGLE_PROFILE_FAILED';
    throw err;
  }

  return response.json();
};

const findOrCreateGoogleUser = async (profile) => {
  if (!profile.email || profile.email_verified === false) {
    const err = new Error('Google email is not verified');
    err.statusCode = 401;
    err.code = 'GOOGLE_EMAIL_NOT_VERIFIED';
    throw err;
  }

  const existing = await User.findOne({ email: profile.email.toLowerCase().trim() });
  if (existing) {
    let shouldSave = false;
    if (!existing.avatar?.url && profile.picture) {
      existing.avatar = { url: profile.picture, publicId: null };
      shouldSave = true;
    }
    if (shouldSave) await existing.save();
    return existing;
  }

  const [firstNameFromName, ...lastNameParts] = (profile.name || '').trim().split(/\s+/);
  const firstName = profile.given_name || firstNameFromName || 'Google';
  const lastName = profile.family_name || lastNameParts.join(' ') || 'User';
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

  return User.create({
    firstName,
    lastName,
    email: profile.email.toLowerCase().trim(),
    passwordHash,
    avatar: {
      url: profile.picture || await getDefaultAvatarUrl(),
      publicId: null,
    },
  });
};

const googleCallback = async (req, res) => {
  assertGoogleConfigured();

  const { code, state } = req.query;
  if (!code) {
    const err = new Error('Google login was cancelled');
    err.statusCode = 400;
    err.code = 'GOOGLE_AUTH_CANCELLED';
    throw err;
  }

  const tokenResult = await exchangeGoogleCode(req, code);
  const profile = await fetchGoogleProfile(tokenResult.access_token);
  const user = await findOrCreateGoogleUser(profile);
  const accessToken = await issueTokens(user, res, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  const decodedState = decodeOAuthState(state);
  const redirectTo = typeof decodedState.redirectTo === 'string' && decodedState.redirectTo.startsWith('/')
    ? decodedState.redirectTo
    : '/feed';

  const callbackUrl = new URL('/auth/google/callback', env.CLIENT_URL);
  callbackUrl.searchParams.set('accessToken', accessToken);
  callbackUrl.searchParams.set('redirectTo', redirectTo);

  return { redirectUrl: callbackUrl.toString() };
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

module.exports = { register, login, refresh, logout, getMe, getGoogleAuthUrl, googleCallback };
