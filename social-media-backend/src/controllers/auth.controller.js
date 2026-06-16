const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response.util');

const register = async (req, res, next) => {
  try {
    const result = await authService.register(req, res);
    sendSuccess(res, 'Registration successful', result, 201);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req, res);
    sendSuccess(res, 'Login successful', result);
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const result = await authService.refresh(req, res);
    sendSuccess(res, 'Token refreshed', result);
  } catch (err) {
    // Refresh failed (expired/reused/unknown token). Clear the httpOnly refresh
    // cookie so the browser stops resending a dead token. Without this the client
    // cannot remove it (httpOnly), and the route middleware keeps treating the user
    // as authenticated — bouncing /login → /feed → refresh → 401 in an infinite loop.
    res.clearCookie('refreshToken', { path: '/' });
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req, res);
    sendSuccess(res, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req);
    sendSuccess(res, 'User fetched', user);
  } catch (err) {
    next(err);
  }
};

const googleStart = (req, res, next) => {
  try {
    const authUrl = authService.getGoogleAuthUrl(req);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
};

const googleCallback = async (req, res, next) => {
  try {
    const result = await authService.googleCallback(req, res);
    res.redirect(result.redirectUrl);
  } catch (err) {
    // For OAuth callback failures, redirect to the frontend with an error
    // instead of showing a JSON error page to the user
    const env = require('../config/env');
    const errorUrl = new URL('/auth/google/callback', env.CLIENT_URL);
    errorUrl.searchParams.set('error', err.code || 'GOOGLE_AUTH_FAILED');
    errorUrl.searchParams.set('message', err.message || 'Google login failed');
    res.redirect(errorUrl.toString());
  }
};

module.exports = { register, login, refresh, logout, getMe, googleStart, googleCallback };
