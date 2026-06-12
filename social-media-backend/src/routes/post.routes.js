const { Router } = require('express');
const postController = require('../controllers/post.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadSingle, validateMagicBytes } = require('../middlewares/upload.middleware');
const { createPostSchema } = require('../validators/post.validator');

const router = Router();

// All post routes require authentication
router.use(authenticate);

router.get('/feed', postController.getFeed);
router.get('/my', postController.getMyPosts);
router.post('/', uploadSingle, validateMagicBytes, validate(createPostSchema), postController.createPost);
router.get('/:postId', postController.getPost);
router.delete('/:postId', postController.deletePost);

module.exports = router;
