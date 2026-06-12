const { Router } = require('express');
const commentController = require('../controllers/comment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const createLimiter = require('../utils/rate-limiter.util');
const {
  getCommentsSchema,
  createCommentSchema,
  getRepliesSchema,
  createReplySchema,
} = require('../validators/comment.validator');

// Comment creation rate limit — 60 per hour per userId
const commentLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req.user ? req.user.id : req.ip),
  message: { success: false, message: 'Too many comments, please slow down.', code: 'RATE_LIMITED' },
});

// Mounted at:
//   /api/posts/:postId/comments
//   /api/comments/:commentId/replies
// The router uses mergeParams: true so :postId / :commentId are accessible.

const postCommentRouter = Router({ mergeParams: true });
postCommentRouter.use(authenticate);
postCommentRouter.get('/', validate(getCommentsSchema), commentController.getComments);
postCommentRouter.post('/', commentLimiter, validate(createCommentSchema), commentController.addComment);

const replyRouter = Router({ mergeParams: true });
replyRouter.use(authenticate);
replyRouter.get('/', validate(getRepliesSchema), commentController.getReplies);
replyRouter.post('/', commentLimiter, validate(createReplySchema), commentController.addReply);

module.exports = { postCommentRouter, replyRouter };


