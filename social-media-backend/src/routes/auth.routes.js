const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const createLimiter = require('../utils/rate-limiter.util');
const { registerSchema, loginSchema } = require('../validators/auth.validator');

const router = Router();

// Login rate limit — 10 attempts per 15 min per IP
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts, please try again later.', code: 'RATE_LIMITED' },
});

// Register rate limit — 5 attempts per 1 hour per IP
const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many registration attempts, please try again later.', code: 'RATE_LIMITED' },
});


router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.get('/google', authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
