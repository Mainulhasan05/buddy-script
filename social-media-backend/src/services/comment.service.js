const Comment = require('../models/Comment.model');
const Post = require('../models/Post.model');
const User = require('../models/User.model');
const cacheService = require('./cache.service');
const likeService = require('./like.service');
const { CACHE_KEYS, CACHE_TTL } = require('../constants/cache.constants');
const { buildCursorQuery, encodeCursor } = require('../utils/pagination.util');
const logger = require('../utils/logger');

// Projections
const COMMENT_PROJECTION = '_id postId parentId depth author content likeCount replyCount createdAt';
const USER_SNAPSHOT_PROJECTION = '_id firstName lastName avatar.url';

const fetchUserSnap = async (userId) => {
  const user = await User.findById(userId).select(USER_SNAPSHOT_PROJECTION).lean();
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
  const [post, author] = await Promise.all([
    Post.findOne({ _id: postId, deletedAt: null }).select('_id').lean(),
    fetchUserSnap(userId),
  ]);

  if (!post) {
    const err = new Error('Post not found');
    err.statusCode = 404;
    err.code = 'POST_NOT_FOUND';
    throw err;
  }

  const comment = await Comment.create({
    postId,
    parentId: null,
    depth: 0,
    author,
    content,
  });

  // Synchronous counter update — no async worker exists for comment counting
  await Post.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });

  // Invalidate comment cache for this post by incrementing comments version
  await cacheService.incrCommentVersion(postId);

  return comment;
};

/**
 * Add a reply (depth=1) to a top-level comment.
 * Max depth is 1 — replies to replies are rejected.
 */
const addReply = async ({ commentId, userId, content }) => {
  const [parent, author] = await Promise.all([
    Comment.findOne({ _id: commentId, deletedAt: null }).select('_id postId depth').lean(),
    fetchUserSnap(userId),
  ]);

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

  const reply = await Comment.create({
    postId: parent.postId,
    parentId: commentId,
    depth: 1,
    author,
    content,
  });

  // Synchronous counter update — no async worker exists for reply counting
  await Comment.updateOne({ _id: commentId }, { $inc: { replyCount: 1 } });

  // Invalidate comment cache for this post by incrementing comments version
  await cacheService.incrCommentVersion(parent.postId);

  return reply;
};

/**
 * Get top-level comments for a post (parentId=null), cursor-paginated, cache-first.
 * N+1 eliminated: isLiked resolved with a single batch query.
 */
const getComments = async ({ postId, cursor, limit = 20, userId }) => {
  limit = Math.min(Number(limit), 50);

  const dataKey = CACHE_KEYS.POST_COMMENTS_DATA(postId, cursor);

  // One round trip fetches both the comments version and the cached page, then
  // validates the page was built against the current version.
  const versioned = await cacheService.getVersioned(
    CACHE_KEYS.POST_COMMENTS_VERSION(postId),
    dataKey
  );
  let result = versioned.data;

  if (!result) {
    const cursorQuery = buildCursorQuery(cursor);

    const comments = await Comment.find({
      ...cursorQuery,
      postId,
      parentId: null,
      deletedAt: null,
    })
      .select(COMMENT_PROJECTION)
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit + 1)
      .lean();

    const hasMore = comments.length > limit;
    if (hasMore) comments.pop();
    const nextCursor = hasMore ? encodeCursor(comments[comments.length - 1]) : null;

    result = { comments, pagination: { nextCursor, hasMore } };
    await cacheService.setVersioned(dataKey, versioned.version, result, CACHE_TTL.COMMENTS);
  }

  // Batch resolve isLiked — single $in query instead of N+1
  if (userId && result.comments.length > 0) {
    const commentIds = result.comments.map((c) => c._id);
    const likedSet = await likeService.getBatchLikeState({
      userId,
      targetIds: commentIds,
      targetType: 'comment',
    });
    result.comments = result.comments.map((comment) => ({
      ...comment,
      isLiked: likedSet.has(comment._id.toString()),
    }));
  }

  return result;
};

/**
 * Get replies for a comment (parentId=commentId), cursor-paginated.
 * N+1 eliminated: isLiked resolved with a single batch query.
 */
const getReplies = async ({ commentId, cursor, limit = 10, userId }) => {
  limit = Math.min(Number(limit), 50);
  const cursorQuery = buildCursorQuery(cursor);

  const replies = await Comment.find({
    ...cursorQuery,
    parentId: commentId,
    deletedAt: null,
  })
    .select(COMMENT_PROJECTION)
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = replies.length > limit;
  if (hasMore) replies.pop();
  const nextCursor = hasMore ? encodeCursor(replies[replies.length - 1]) : null;

  // Batch resolve isLiked — single $in query instead of N+1
  let repliesWithLikes = replies;
  if (userId && replies.length > 0) {
    const replyIds = replies.map((r) => r._id);
    const likedSet = await likeService.getBatchLikeState({
      userId,
      targetIds: replyIds,
      targetType: 'comment',
    });
    repliesWithLikes = replies.map((reply) => ({
      ...reply,
      isLiked: likedSet.has(reply._id.toString()),
    }));
  }

  return { replies: repliesWithLikes, pagination: { nextCursor, hasMore } };
};

module.exports = { addComment, addReply, getComments, getReplies };

