const mongoose = require('mongoose');
const Like = require('../models/Like.model');
const Post = require('../models/Post.model');
const Comment = require('../models/Comment.model');
const cacheService = require('./cache.service');
const { publish } = require('../config/rabbitmq');
const { ROUTING_KEYS } = require('../constants/queue.constants');
const { CACHE_KEYS, CACHE_TTL } = require('../constants/cache.constants');
const logger = require('../utils/logger');

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
    // Atomically decrement the parent counter
    const Model = targetType === 'post' ? Post : Comment;
    await Model.updateOne({ _id: targetId }, { $inc: { likeCount: -1 } });

    await cacheService.sRem(CACHE_KEYS.LIKES(targetType, targetId), userId.toString());
    publish(ROUTING_KEYS.LIKE_DELETED, { targetId: targetId.toString(), targetType, delta: -1 });

    return { isLiked: false, delta: -1 };
  }

  // Like — create new document (unique index prevents duplicates)
  try {
    await Like.create({ userId, targetId, targetType });
  } catch (err) {
    // Duplicate key error (11000) — user already liked (race condition handled gracefully)
    if (err.code === 11000) {
      return { isLiked: true, delta: 0 };
    }
    throw err;
  }

  // Atomically increment the parent counter
  const Model = targetType === 'post' ? Post : Comment;
  await Model.updateOne({ _id: targetId }, { $inc: { likeCount: 1 } });

  await cacheService.sAdd(CACHE_KEYS.LIKES(targetType, targetId), userId.toString(), CACHE_TTL.LIKES);
  publish(ROUTING_KEYS.LIKE_CREATED, { targetId: targetId.toString(), targetType, delta: 1 });

  return { isLiked: true, delta: 1 };
};

/**
 * Get paginated list of users who liked a target.
 * Uses $lookup to join user info — acceptable here since "Who Liked" is not a hot path.
 */
const getLikers = async ({ targetId, targetType, cursor, limit = 20 }) => {
  limit = Math.min(Number(limit), 50);

  const matchStage = { targetId: new mongoose.Types.ObjectId(targetId), targetType };
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const { createdAt } = JSON.parse(decoded);
      matchStage.createdAt = { $lt: new Date(createdAt) };
    } catch {
      // Invalid cursor — ignore and start from beginning
    }
  }

  const likers = await Like.aggregate([
    { $match: matchStage },
    { $sort: { createdAt: -1 } },
    { $limit: limit + 1 },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        createdAt: 1,
        user: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          avatarUrl: '$user.avatar.url',
        },
      },
    },
  ]);

  const hasMore = likers.length > limit;
  if (hasMore) likers.pop();

  const last = likers[likers.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt })).toString('base64')
      : null;

  return { likers, pagination: { nextCursor, hasMore } };
};

/**
 * Check if a user has liked a target (single item — used for individual post views).
 * Redis SISMEMBER first — DB fallback on cache miss.
 */
const getLikeState = async ({ userId, targetId, targetType }) => {
  const cacheKey = CACHE_KEYS.LIKES(targetType, targetId);

  // Check Redis set first
  const inCache = await cacheService.sIsMember(cacheKey, userId.toString());
  if (inCache) return true;

  // Cache miss — check DB
  const exists = await Like.exists({ userId, targetId, targetType });
  if (exists) {
    // Back-populate Redis for future checks
    await cacheService.sAdd(cacheKey, userId.toString(), CACHE_TTL.LIKES);
    return true;
  }

  return false;
};

/**
 * Batch check if a user has liked multiple targets — eliminates N+1 queries.
 * Returns a Set of targetId strings that the user has liked.
 *
 * Usage:
 *   const likedSet = await getBatchLikeState({ userId, targetIds: postIds, targetType: 'post' });
 *   posts.forEach(p => p.isLiked = likedSet.has(p._id.toString()));
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

