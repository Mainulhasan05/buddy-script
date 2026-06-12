const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const commentController = require('../controllers/comment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { addCommentSchema, addReplySchema } = require('../validators/comment.validator');

// Comment creation rate limit — 60 per hour per IP
const commentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many comments, please slow down.', code: 'RATE_LIMITED' },
});

// Mounted at:
//   /api/posts/:postId/comments
//   /api/comments/:commentId/replies
// The router uses mergeParams: true so :postId / :commentId are accessible.

const postCommentRouter = Router({ mergeParams: true });
postCommentRouter.use(authenticate);
postCommentRouter.get('/', commentController.getComments);
postCommentRouter.post('/', commentLimiter, validate(addCommentSchema), commentController.addComment);

const replyRouter = Router({ mergeParams: true });
replyRouter.use(authenticate);
replyRouter.get('/', commentController.getReplies);
replyRouter.post('/', commentLimiter, validate(addReplySchema), commentController.addReply);

module.exports = { postCommentRouter, replyRouter };

