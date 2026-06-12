const { Router } = require('express');
const likeController = require('../controllers/like.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const createLimiter = require('../utils/rate-limiter.util');
const { toggleSchema, getLikersSchema } = require('../validators/like.validator');

const router = Router();

router.use(authenticate);

// Like rate limit — 200 toggles per hour per userId
const likeLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => (req.user ? req.user.id : req.ip),
  message: { success: false, message: 'Too many like actions, please slow down.', code: 'RATE_LIMITED' },
});

router.post('/toggle', likeLimiter, validate(toggleSchema), likeController.toggle);
router.get('/:targetType/:targetId', validate(getLikersSchema), likeController.getLikers);

module.exports = router;


