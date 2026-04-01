const { Router } = require('express');
const { z } = require('zod');
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

router.post('/toggle', validate(toggleSchema), likeController.toggle);
router.get('/:targetType/:targetId', likeController.getLikers);

module.exports = router;
