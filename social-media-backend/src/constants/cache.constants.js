/**
 * Redis cache key patterns and TTLs.
 * All key functions are centralized here — never construct keys inline.
 */

const CACHE_KEYS = {
  FEED_VERSION: 'feed:version',
  // Fixed key (no version in the key). The current version is stored *inside* the
  // cached value and validated on read, so version + payload can be fetched in a
  // single Redis pipeline instead of two sequential GETs. Invalidation still works:
  // incrementing the version makes any stored payload's embedded version stale.
  FEED_DATA: (cursor) => `feed:public:${cursor || 'first'}`,
  POST: (postId) => `post:${postId}`,
  POST_COMMENTS_VERSION: (postId) => `post:${postId}:comments:version`,
  // Fixed per-cursor key; embedded version validated on read (see FEED_DATA note).
  POST_COMMENTS_DATA: (postId, cursor) => `post:${postId}:comments:${cursor || 'first'}`,
  LIKES: (type, id) => `likes:${type}:${id}`,
  LIKES_PAGE: (type, id) => `likes:${type}:${id}:page1`,
  USER_LIKE_STATE: (userId, targetType, targetId) => `user:${userId}:liked:${targetType}:${targetId}`,
  USER_SESSION: (userId) => `user:${userId}:session`,
};

const CACHE_TTL = {
  FEED: 30,       // 30 seconds (reduced from 60 — versioned keys expire naturally)
  POST: 300,      // 5 minutes
  COMMENTS: 120,  // 2 minutes
  LIKES: 86400,   // 24 hours — like state sets expire and rebuild from DB on miss
  LIKES_PAGE: 120, // 2 minutes
  USER_LIKE_STATE: 300, // 5 minutes
};

module.exports = { CACHE_KEYS, CACHE_TTL };
