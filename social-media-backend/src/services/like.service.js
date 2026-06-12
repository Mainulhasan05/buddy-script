const mongoose = require('mongoose');
const Like = require('../models/Like.model');
const Post = require('../models/Post.model');
const Comment = require('../models/Comment.model');
const cacheService = require('./cache.service');
const { publish } = require('../config/rabbitmq');
const { ROUTING_KEYS } = require('../constants/queue.constants');
const { CACHE_KEYS } = require('../constants/cache.constants');
const logger = require('../utils/logger');

/**
 * Toggle like on a post or comment.
 * Write to likes collection → publish RabbitMQ event → update Redis set.
 * Returns optimistic { isLiked, likeCount }.
 */
const toggle = async ({ userId, targetId, targetType }) => {
  const existing = await Like.findOne({ userId, targetId, targetType });

  let isLiked;
  let delta;

  if (existing) {
    // Unlike
    await Like.deleteOne({ _id: existing._id });
    isLiked = false;
    delta = -1;
    await cacheService.sRem(CACHE_KEYS.LIKES(targetType, targetId), userId.toString());
    publish(ROUTING_KEYS.LIKE_DELETED, { targetId: targetId.toString(), targetType, delta: -1 });
  } else {
    // Like
    await Like.create({ userId, targetId, targetType });
    isLiked = true;
    delta = 1;
    await cacheService.sAdd(CACHE_KEYS.LIKES(targetType, targetId), userId.toString());
    publish(ROUTING_KEYS.LIKE_CREATED, { targetId: targetId.toString(), targetType, delta: 1 });
  }

  // Optimistic count — read from DB (worker will sync async)
  const likeCount = await Like.countDocuments({ targetId, targetType });

  return { isLiked, likeCount };
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
 * Check if a user has liked a target.
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
    await cacheService.sAdd(cacheKey, userId.toString());
    return true;
  }

  return false;
};

module.exports = { toggle, getLikers, getLikeState };
