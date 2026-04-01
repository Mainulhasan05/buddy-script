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

module.exports = { register, login, refresh, logout, getMe };
