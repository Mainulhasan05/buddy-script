const mongoose = require('mongoose');
const Like = require('../models/Like.model');
const Post = require('../models/Post.model');
const Comment = require('../models/Comment.model');
const User = require('../models/User.model');
const cacheService = require('./cache.service');
const { CACHE_KEYS, CACHE_TTL } = require('../constants/cache.constants');
const logger = require('../utils/logger');
const { publish } = require('../config/rabbitmq');
const { ROUTING_KEYS } = require('../constants/queue.constants');

/**
 * Toggle like on a post or comment.
 * Uses atomic operations to prevent race conditions at high concurrency.
 * Returns { isLiked, delta } — the frontend already does optimistic count updates.
 */
const toggle = async ({ userId, targetId, targetType }) => {
  // Attempt atomic delete first — if a like exists, remove it
  const deleted = await Like.findOneAndDelete({ userId, targetId, targetType });

  if (deleted) {
    // Unlike — document was removed
    // Try to publish async event — worker handles counter updates if connected
    const published = await publish(ROUTING_KEYS.LIKE_DELETED, {
      targetId: targetId.toString(),
      targetType,
      delta: -1,
    });

    if (!published) {
      // Fallback to synchronous counter decrement if RabbitMQ is not available
      const Model = targetType === 'post' ? Post : Comment;
      await Model.updateOne({ _id: targetId }, { $inc: { likeCount: -1 } });
    }

    // Invalidate caches sequentially
    await Promise.all([
      cacheService.del(CACHE_KEYS.LIKES_PAGE(targetType, targetId)),
      cacheService.set(CACHE_KEYS.USER_LIKE_STATE(userId, targetType, targetId), 'false', CACHE_TTL.USER_LIKE_STATE),
    ]);

    return { isLiked: false, delta: -1 };
  }

  // Like — create new document (unique index prevents duplicates)
  try {
    await Like.create({ userId, targetId, targetType });
  } catch (err) {
    // Duplicate key error (11000) — user already liked (race condition handled gracefully)
    if (err.code === 11000) {
      await cacheService.set(CACHE_KEYS.USER_LIKE_STATE(userId, targetType, targetId), 'true', CACHE_TTL.USER_LIKE_STATE);
      return { isLiked: true, delta: 0 };
    }
    throw err;
  }

  // Try to publish async event — worker handles counter updates if connected
  const published = await publish(ROUTING_KEYS.LIKE_CREATED, {
    targetId: targetId.toString(),
    targetType,
    delta: 1,
  });

  if (!published) {
    // Fallback to synchronous counter increment if RabbitMQ is not available
    const Model = targetType === 'post' ? Post : Comment;
    await Model.updateOne({ _id: targetId }, { $inc: { likeCount: 1 } });
  }

  // Invalidate list page cache and set state cache to true
  await Promise.all([
    cacheService.del(CACHE_KEYS.LIKES_PAGE(targetType, targetId)),
    cacheService.set(CACHE_KEYS.USER_LIKE_STATE(userId, targetType, targetId), 'true', CACHE_TTL.USER_LIKE_STATE),
  ]);

  return { isLiked: true, delta: 1 };
};

/**
 * Get paginated list of users who liked a target.
 * Replaced $lookup aggregate with Application-Level Hydration to prevent database locks.
 * Caches first page of likes for high-volume engagement.
 */
const getLikers = async ({ targetId, targetType, cursor, limit = 20 }) => {
  limit = Math.min(Number(limit), 50);

  const isFirstPage = !cursor;
  let cacheKey = null;

  if (isFirstPage) {
    cacheKey = CACHE_KEYS.LIKES_PAGE(targetType, targetId);
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;
  }

  const query = { targetId: new mongoose.Types.ObjectId(targetId), targetType };
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const { createdAt } = JSON.parse(decoded);
      query.createdAt = { $lt: new Date(createdAt) };
    } catch {
      // Invalid cursor — ignore and start from beginning
    }
  }

  // Step 1: Query raw likes (select only userId and createdAt)
  const rawLikes = await Like.find(query)
    .select('userId createdAt')
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rawLikes.length > limit;
  if (hasMore) rawLikes.pop();

  let likers = [];
  if (rawLikes.length > 0) {
    // Step 2: Extract unique userIds
    const userIds = rawLikes.map((l) => l.userId);

    // Step 3: Query profile snapshots in a single bulk $in lookup
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id firstName lastName avatar.url')
      .lean();

    // Map profiles back to reaction records
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    likers = rawLikes
      .map((l) => {
        const user = userMap.get(l.userId.toString());
        if (!user) return null;
        return {
          createdAt: l.createdAt,
          user: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatar?.url || null,
          },
        };
      })
      .filter(Boolean);
  }

  const last = rawLikes[rawLikes.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt })).toString('base64')
      : null;

  const result = { likers, pagination: { nextCursor, hasMore } };

  // Cache first page only if results exist
  if (cacheKey && result.likers.length > 0) {
    await cacheService.set(cacheKey, result, CACHE_TTL.LIKES_PAGE);
  }

  return result;
};

/**
 * Check if a user has liked a target (single item — used for individual post views).
 * Checks a localized session key first, falling back to a quick MongoDB exists query.
 */
const getLikeState = async ({ userId, targetId, targetType }) => {
  const cacheKey = CACHE_KEYS.USER_LIKE_STATE(userId, targetType, targetId);

  // Check Redis session state first
  const cachedVal = await cacheService.get(cacheKey);
  if (cachedVal === 'true') return true;
  if (cachedVal === 'false') return false;

  // Cache miss — check DB via compound unique index
  const exists = await Like.exists({ userId, targetId, targetType });
  const existsStr = exists ? 'true' : 'false';

  // Back-populate session cache
  await cacheService.set(cacheKey, existsStr, CACHE_TTL.USER_LIKE_STATE);

  return !!exists;
};

/**
 * Batch check if a user has liked multiple targets — eliminates N+1 queries.
 * Returns a Set of targetId strings that the user has liked.
 */
const getBatchLikeState = async ({ userId, targetIds, targetType }) => {
  if (!userId || !targetIds.length) return new Set();

  const likes = await Like.find({
    userId,
    targetId: { $in: targetIds },
    targetType,
  })
    .select('targetId')
    .lean();

  return new Set(likes.map((l) => l.targetId.toString()));
};

module.exports = { toggle, getLikers, getLikeState, getBatchLikeState };

