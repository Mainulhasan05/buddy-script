const { Router } = require('express');
const postController = require('../controllers/post.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadSingle, validateMagicBytes } = require('../middlewares/upload.middleware');
const createLimiter = require('../utils/rate-limiter.util');
const {
  createPostSchema,
  getPostSchema,
  deletePostSchema,
  getFeedSchema,
  getMyPostsSchema,
} = require('../validators/post.validator');

const router = Router();

// All post routes require authentication
router.use(authenticate);

// Limiters for post creation
const textPostLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => (req.user ? req.user.id : req.ip),
  skip: (req) => req.headers['content-type']?.includes('multipart/form-data'),
  message: { success: false, message: 'Too many posts created, please slow down.', code: 'RATE_LIMITED' },
});

const uploadPostLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => (req.user ? req.user.id : req.ip),
  skip: (req) => !req.headers['content-type']?.includes('multipart/form-data'),
  message: { success: false, message: 'Too many file uploads, please slow down.', code: 'RATE_LIMITED' },
});

router.get('/feed', validate(getFeedSchema), postController.getFeed);
router.get('/my', validate(getMyPostsSchema), postController.getMyPosts);
router.post(
  '/',
  textPostLimiter,
  uploadPostLimiter,
  uploadSingle,
  validateMagicBytes,
  validate(createPostSchema),
  postController.createPost
);
router.get('/:postId', validate(getPostSchema), postController.getPost);
router.delete('/:postId', validate(deletePostSchema), postController.deletePost);

module.exports = router;

