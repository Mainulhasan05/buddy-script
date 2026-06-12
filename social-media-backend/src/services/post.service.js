const Post = require('../models/Post.model');
const User = require('../models/User.model');
const cacheService = require('./cache.service');
const uploadService = require('./upload.service');
const likeService = require('./like.service');
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
  // publish() is safe — silently drops if RabbitMQ is not connected
  publish(ROUTING_KEYS.POST_CREATED, { postId: post._id.toString() });

  // Eagerly invalidate feed cache without waiting for worker
  await cacheService.scanDel('feed:public:*');

  return post;
};

/**
 * Get paginated public feed (cache-first).
 */
const getFeed = async ({ cursor, limit = 20, userId }) => {
  limit = Math.min(Number(limit), 50); // cap at 50
  const cacheKey = CACHE_KEYS.FEED(cursor);

  const cached = await cacheService.get(cacheKey);
  let result;
  if (cached) {
    result = JSON.parse(JSON.stringify(cached));
  } else {
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
    result = { posts, pagination: { nextCursor, hasMore } };

    await cacheService.set(cacheKey, result, CACHE_TTL.FEED);
  }

  // Populate isLiked for this user
  if (userId && result.posts.length > 0) {
    const postsWithLikes = await Promise.all(
      result.posts.map(async (post) => {
        const isLiked = await likeService.getLikeState({
          userId,
          targetId: post._id,
          targetType: 'post',
        });
        return { ...post, isLiked };
      })
    );
    result.posts = postsWithLikes;
  }

  return result;
};

/**
 * Get a single post by ID (cache-first).
 * Private posts are only visible to their author.
 */
const getPost = async (postId, requesterId) => {
  const cacheKey = CACHE_KEYS.POST(postId);

  const cached = await cacheService.get(cacheKey);
  let post;
  if (cached) {
    post = JSON.parse(JSON.stringify(cached));
  } else {
    post = await Post.findOne({ _id: postId, isDeleted: false }).lean();
    if (!post) {
      const err = new Error('Post not found');
      err.statusCode = 404;
      err.code = 'POST_NOT_FOUND';
      throw err;
    }
    await cacheService.set(cacheKey, post, CACHE_TTL.POST);
  }

  // Enforce private visibility — only the author can see their own private posts
  if (post.visibility === 'private' && post.author._id.toString() !== requesterId) {
    const err = new Error('Post not found');
    err.statusCode = 404;
    err.code = 'POST_NOT_FOUND';
    throw err;
  }

  // Populate isLiked
  if (requesterId) {
    post.isLiked = await likeService.getLikeState({
      userId: requesterId,
      targetId: post._id,
      targetType: 'post',
    });
  }

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

  // Populate isLiked for this user
  const postsWithLikes = await Promise.all(
    posts.map(async (post) => {
      const isLiked = await likeService.getLikeState({
        userId,
        targetId: post._id,
        targetType: 'post',
      });
      return { ...post, isLiked };
    })
  );

  return { posts: postsWithLikes, pagination: { nextCursor, hasMore } };
};

module.exports = { createPost, getFeed, getPost, deletePost, getMyPosts };
