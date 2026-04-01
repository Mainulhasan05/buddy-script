const { Router } = require('express');

const router = Router();

const { postCommentRouter, replyRouter } = require('./comment.routes');

router.use('/auth', require('./auth.routes'));
router.use('/posts', require('./post.routes'));
router.use('/posts/:postId/comments', postCommentRouter);
router.use('/comments/:commentId/replies', replyRouter);
router.use('/likes', require('./like.routes'));

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'API is running', timestamp: new Date().toISOString() });
});

module.exports = router;
