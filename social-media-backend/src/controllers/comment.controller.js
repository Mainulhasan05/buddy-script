const commentService = require('../services/comment.service');
const { sendSuccess } = require('../utils/response.util');

const addComment = async (req, res, next) => {
  try {
    const comment = await commentService.addComment({
      postId: req.params.postId,
      userId: req.user.id,
      content: req.body.content,
    });
    sendSuccess(res, 'Comment added', comment, 201);
  } catch (err) {
    next(err);
  }
};

const getComments = async (req, res, next) => {
  try {
    const { cursor, limit } = req.query;
    const result = await commentService.getComments({
      postId: req.params.postId,
      cursor,
      limit,
    });
    sendSuccess(res, 'Comments fetched', result.comments, 200, result.pagination);
  } catch (err) {
    next(err);
  }
};

const addReply = async (req, res, next) => {
  try {
    const reply = await commentService.addReply({
      commentId: req.params.commentId,
      userId: req.user.id,
      content: req.body.content,
    });
    sendSuccess(res, 'Reply added', reply, 201);
  } catch (err) {
    next(err);
  }
};

const getReplies = async (req, res, next) => {
  try {
    const { cursor, limit } = req.query;
    const result = await commentService.getReplies({
      commentId: req.params.commentId,
      cursor,
      limit,
    });
    sendSuccess(res, 'Replies fetched', result.replies, 200, result.pagination);
  } catch (err) {
    next(err);
  }
};

module.exports = { addComment, getComments, addReply, getReplies };
