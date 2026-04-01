const { Router } = require('express');

const router = Router();

router.use('/auth', require('./auth.routes'));
router.use('/posts', require('./post.routes'));
// router.use('/comments', require('./comment.routes'));
// router.use('/likes', require('./like.routes'));

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'API is running', timestamp: new Date().toISOString() });
});

module.exports = router;
