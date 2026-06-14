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

// Fields returned in feed/list views (excludes internals like image.publicId)
const POST_LIST_PROJECTION = '_id author content image.url image.width image.height visibility likeCount commentCount createdAt';
// Fields returned in single post view (includes full content)
const POST_DETAIL_PROJECTION = POST_LIST_PROJECTION;
// Fields needed from User for author snapshot
const USER_SNAPSHOT_PROJECTION = '_id firstName lastName avatar.url';

/**
 * Create a new post.
 * Uploads image (if present), saves post, publishes post.created event,
 * then invalidates all feed cache pages.
 */
const createPost = async ({ userId, content, file, visibility = 'public' }) => {
  // Fetch author snapshot — denormalized onto the post to avoid future lookups
  const user = await User.findById(userId).select(USER_SNAPSHOT_PROJECTION).lean();
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

  // Invalidate feed cache — O(1) version increment replaces O(N) SCAN+DEL
  await cacheService.incrFeedVersion();

  // Return sanitized response — exclude internal fields like image.publicId
  return {
    _id: post._id,
    author: post.author,
    content: post.content,
    image: post.image ? { url: post.image.url, width: post.image.width, height: post.image.height } : null,
    visibility: post.visibility,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
  };
};

/**
 * Get paginated public feed (cache-first).
 * N+1 eliminated: isLiked resolved with a single batch query.
 */
const getFeed = async ({ cursor, limit = 20, userId }) => {
  limit = Math.min(Number(limit), 50); // cap at 50

  // Only cache the first page (no cursor). Deeper pages have low reuse and
  // cursors are unique per position, so caching them wastes Redis memory.
  const isFirstPage = !cursor;
  let cacheKey = null;
  if (isFirstPage) {
    const feedVersion = await cacheService.getFeedVersion();
    cacheKey = CACHE_KEYS.FEED(feedVersion, null);
  }

  const cached = cacheKey ? await cacheService.get(cacheKey) : null;
  let result;
  if (cached) {
    result = cached; // cacheService.get() already returns a fresh parsed object
  } else {
    const cursorQuery = buildCursorQuery(cursor);
    const posts = await Post.find({
      ...cursorQuery,
      visibility: 'public',
      deletedAt: null,
    })
      .select(POST_LIST_PROJECTION)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();

    const nextCursor = hasMore ? encodeCursor(posts[posts.length - 1]) : null;
    result = { posts, pagination: { nextCursor, hasMore } };

    if (cacheKey) {
      await cacheService.set(cacheKey, result, CACHE_TTL.FEED);
    }
  }

  // Batch resolve isLiked — single $in query instead of N+1
  if (userId && result.posts.length > 0) {
    const postIds = result.posts.map((p) => p._id);
    const likedSet = await likeService.getBatchLikeState({
      userId,
      targetIds: postIds,
      targetType: 'post',
    });
    result.posts = result.posts.map((post) => ({
      ...post,
      isLiked: likedSet.has(post._id.toString()),
    }));
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
    post = cached; // cacheService.get() already returns a fresh parsed object
  } else {
    post = await Post.findOne({ _id: postId, deletedAt: null })
      .select(POST_DETAIL_PROJECTION)
      .lean();
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

  // Populate isLiked (single item — acceptable for detail view)
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
 * Uses $set: { deletedAt: new Date() } instead of boolean flag.
 */
const deletePost = async ({ postId, userId }) => {
  const post = await Post.findOne({ _id: postId, deletedAt: null })
    .select('_id author._id')
    .lean();
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

  await Post.updateOne({ _id: postId }, { $set: { deletedAt: new Date() } });

  // Invalidate caches for this post and the feed
  await Promise.all([
    cacheService.del(CACHE_KEYS.POST(postId)),
    cacheService.incrFeedVersion(),
  ]);
};

/**
 * Get the authenticated user's own posts (both public and private), cursor-paginated.
 * N+1 eliminated: isLiked resolved with a single batch query.
 */
const getMyPosts = async ({ userId, cursor, limit = 20 }) => {
  limit = Math.min(Number(limit), 50);
  const cursorQuery = buildCursorQuery(cursor);

  const posts = await Post.find({
    ...cursorQuery,
    'author._id': userId,
    deletedAt: null,
  })
    .select(POST_LIST_PROJECTION)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = posts.length > limit;
  if (hasMore) posts.pop();
  const nextCursor = hasMore ? encodeCursor(posts[posts.length - 1]) : null;

  // Batch resolve isLiked — single $in query instead of N+1
  const postIds = posts.map((p) => p._id);
  const likedSet = await likeService.getBatchLikeState({
    userId,
    targetIds: postIds,
    targetType: 'post',
  });
  const postsWithLikes = posts.map((post) => ({
    ...post,
    isLiked: likedSet.has(post._id.toString()),
  }));

  return { posts: postsWithLikes, pagination: { nextCursor, hasMore } };
};

module.exports = { createPost, getFeed, getPost, deletePost, getMyPosts };

