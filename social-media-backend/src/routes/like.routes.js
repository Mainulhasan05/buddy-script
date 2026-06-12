const { Router } = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const likeController = require('../controllers/like.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

const router = Router();

router.use(authenticate);

const toggleSchema = z.object({
  targetId: z.string().min(1, 'targetId is required'),
  targetType: z.enum(['post', 'comment'], {
    errorMap: () => ({ message: 'targetType must be post or comment' }),
  }),
});

// Like rate limit — 200 toggles per hour per IP
const likeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many like actions, please slow down.', code: 'RATE_LIMITED' },
});

router.post('/toggle', likeLimiter, validate(toggleSchema), likeController.toggle);
router.get('/:targetType/:targetId', likeController.getLikers);

module.exports = router;

