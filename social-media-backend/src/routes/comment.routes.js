const { Router } = require('express');
const commentController = require('../controllers/comment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { addCommentSchema, addReplySchema } = require('../validators/comment.validator');

// Mounted at:
//   /api/posts/:postId/comments
//   /api/comments/:commentId/replies
// The router uses mergeParams: true so :postId / :commentId are accessible.

const postCommentRouter = Router({ mergeParams: true });
postCommentRouter.use(authenticate);
postCommentRouter.get('/', commentController.getComments);
postCommentRouter.post('/', validate(addCommentSchema), commentController.addComment);

const replyRouter = Router({ mergeParams: true });
replyRouter.use(authenticate);
replyRouter.get('/', commentController.getReplies);
replyRouter.post('/', validate(addReplySchema), commentController.addReply);

module.exports = { postCommentRouter, replyRouter };
