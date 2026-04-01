const Comment = require('../models/Comment.model');
const Post = require('../models/Post.model');
const User = require('../models/User.model');
const cacheService = require('./cache.service');
const { publish } = require('../config/rabbitmq');
const { ROUTING_KEYS } = require('../constants/queue.constants');
const { CACHE_KEYS, CACHE_TTL } = require('../constants/cache.constants');
const { buildCursorQuery, encodeCursor } = require('../utils/pagination.util');
const logger = require('../utils/logger');

const fetchUserSnap = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatar?.url || null,
  };
};

/**
 * Add a top-level comment (depth=0) to a post.
 */
const addComment = async ({ postId, userId, content }) => {
  const post = await Post.findOne({ _id: postId, isDeleted: false }).lean();
  if (!post) {
    const err = new Error('Post not found');
    err.statusCode = 404;
    err.code = 'POST_NOT_FOUND';
    throw err;
  }

  const author = await fetchUserSnap(userId);

  const comment = await Comment.create({
    postId,
    parentId: null,
    depth: 0,
    author,
    content,
  });

  // Publish async event — worker will $inc post.commentCount
  try {
    publish(ROUTING_KEYS.COMMENT_CREATED, {
      postId: postId.toString(),
      commentId: comment._id.toString(),
      delta: 1,
    });
  } catch (err) {
    logger.error(`Failed to publish comment.created: ${err.message}`);
  }

  // Invalidate comment cache for this post
  await cacheService.del(CACHE_KEYS.POST_COMMENTS(postId));

  return comment;
};

/**
 * Add a reply (depth=1) to a top-level comment.
 * Max depth is 1 — replies to replies are rejected.
 */
const addReply = async ({ commentId, userId, content }) => {
  const parent = await Comment.findOne({ _id: commentId, isDeleted: false }).lean();
  if (!parent) {
    const err = new Error('Comment not found');
    err.statusCode = 404;
    err.code = 'COMMENT_NOT_FOUND';
    throw err;
  }

  if (parent.depth !== 0) {
    const err = new Error('Replies to replies are not allowed');
    err.statusCode = 400;
    err.code = 'MAX_DEPTH_EXCEEDED';
    throw err;
  }

  const author = await fetchUserSnap(userId);

  const reply = await Comment.create({
    postId: parent.postId,
    parentId: commentId,
    depth: 1,
    author,
    content,
  });

  // Increment replyCount on the parent comment async
  try {
    publish(ROUTING_KEYS.COMMENT_CREATED, {
      postId: parent.postId.toString(),
      commentId: commentId.toString(),
      replyDelta: 1,
    });
  } catch (err) {
    logger.error(`Failed to publish reply comment.created: ${err.message}`);
  }

  return reply;
};

/**
 * Get top-level comments for a post (parentId=null), cursor-paginated, cache-first.
 */
const getComments = async ({ postId, cursor, limit = 20 }) => {
  limit = Math.min(Number(limit), 50);
  const cacheKey = CACHE_KEYS.POST_COMMENTS(`${postId}:${cursor || 'first'}`);

  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;

  const cursorQuery = buildCursorQuery(cursor);

  const comments = await Comment.find({
    ...cursorQuery,
    postId,
    parentId: null,
    isDeleted: false,
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = comments.length > limit;
  if (hasMore) comments.pop();
  const nextCursor = hasMore ? encodeCursor(comments[comments.length - 1]) : null;

  const result = { comments, pagination: { nextCursor, hasMore } };
  await cacheService.set(cacheKey, result, CACHE_TTL.COMMENTS);
  return result;
};

/**
 * Get replies for a comment (parentId=commentId), cursor-paginated.
 */
const getReplies = async ({ commentId, cursor, limit = 10 }) => {
  limit = Math.min(Number(limit), 50);
  const cursorQuery = buildCursorQuery(cursor);

  const replies = await Comment.find({
    ...cursorQuery,
    parentId: commentId,
    isDeleted: false,
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = replies.length > limit;
  if (hasMore) replies.pop();
  const nextCursor = hasMore ? encodeCursor(replies[replies.length - 1]) : null;

  return { replies, pagination: { nextCursor, hasMore } };
};

module.exports = { addComment, addReply, getComments, getReplies };
