const Post = require('../models/Post.model');
const User = require('../models/User.model');
const cacheService = require('./cache.service');
const uploadService = require('./upload.service');
const { publish } = require('../config/rabbitmq');
const { ROUTING_KEYS } = require('../constants/queue.constants');
const { CACHE_KEYS, CACHE_TTL } = require('../constants/cache.constants');
const { buildCursorQuery, encodeCursor } = require('../utils/pagination.util');
const logger = require('../utils/logger');

/**
 * Create a new post.
 * Uploads image (if present), saves post, publishes post.created event,
 * then invalidates all feed cache pages.
 */
const createPost = async ({ userId, content, file, visibility = 'public' }) => {
  // Fetch author snapshot — denormalized onto the post to avoid future lookups
  const user = await User.findById(userId).lean();
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  let image = null;
  if (file) {
    image = await uploadService.uploadImage(file);
  }

  const post = await Post.create({
    author: {
      _id: userId,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatar?.url || null,
    },
    content,
    image,
    visibility,
  });

  // Publish async event — feed invalidation worker handles cache clearing
  try {
    publish(ROUTING_KEYS.POST_CREATED, { postId: post._id.toString() });
  } catch (err) {
    // RabbitMQ failure must not break post creation
    logger.error(`Failed to publish post.created: ${err.message}`);
  }

  // Eagerly invalidate feed cache without waiting for worker
  await cacheService.scanDel('feed:public:*');

  return post;
};

/**
 * Get paginated public feed (cache-first).
 */
const getFeed = async ({ cursor, limit = 20 }) => {
  limit = Math.min(Number(limit), 50); // cap at 50
  const cacheKey = CACHE_KEYS.FEED(cursor);

  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;

  const cursorQuery = buildCursorQuery(cursor);
  const posts = await Post.find({
    ...cursorQuery,
    visibility: 'public',
    isDeleted: false,
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = posts.length > limit;
  if (hasMore) posts.pop();

  const nextCursor = hasMore ? encodeCursor(posts[posts.length - 1]) : null;
  const result = { posts, pagination: { nextCursor, hasMore } };

  await cacheService.set(cacheKey, result, CACHE_TTL.FEED);
  return result;
};

/**
 * Get a single post by ID (cache-first).
 */
const getPost = async (postId) => {
  const cacheKey = CACHE_KEYS.POST(postId);

  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;

  const post = await Post.findOne({ _id: postId, isDeleted: false }).lean();
  if (!post) {
    const err = new Error('Post not found');
    err.statusCode = 404;
    err.code = 'POST_NOT_FOUND';
    throw err;
  }

  await cacheService.set(cacheKey, post, CACHE_TTL.POST);
  return post;
};

/**
 * Soft-delete a post. Only the author can delete their own post.
 */
const deletePost = async ({ postId, userId }) => {
  const post = await Post.findOne({ _id: postId, isDeleted: false });
  if (!post) {
    const err = new Error('Post not found');
    err.statusCode = 404;
    err.code = 'POST_NOT_FOUND';
    throw err;
  }

  if (post.author._id.toString() !== userId) {
    const err = new Error('Forbidden — you can only delete your own posts');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  post.isDeleted = true;
  await post.save();

  // Invalidate caches for this post and the feed
  await Promise.all([
    cacheService.del(CACHE_KEYS.POST(postId)),
    cacheService.scanDel('feed:public:*'),
  ]);
};

/**
 * Get the authenticated user's own posts (both public and private), cursor-paginated.
 */
const getMyPosts = async ({ userId, cursor, limit = 20 }) => {
  limit = Math.min(Number(limit), 50);
  const cursorQuery = buildCursorQuery(cursor);

  const posts = await Post.find({
    ...cursorQuery,
    'author._id': userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = posts.length > limit;
  if (hasMore) posts.pop();
  const nextCursor = hasMore ? encodeCursor(posts[posts.length - 1]) : null;

  return { posts, pagination: { nextCursor, hasMore } };
};

module.exports = { createPost, getFeed, getPost, deletePost, getMyPosts };
