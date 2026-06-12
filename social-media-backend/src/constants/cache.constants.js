/**
 * Redis cache key patterns and TTLs.
 * All key functions are centralized here — never construct keys inline.
 */

const CACHE_KEYS = {
  FEED: (cursor) => `feed:public:${cursor || 'first'}`,
  POST: (postId) => `post:${postId}`,
  POST_COMMENTS: (postId) => `post:${postId}:comments`,
  LIKES: (type, id) => `likes:${type}:${id}`,
  USER_SESSION: (userId) => `user:${userId}:session`,
};

const CACHE_TTL = {
  FEED: 60,       // 60 seconds
  POST: 300,      // 5 minutes
  COMMENTS: 120,  // 2 minutes
  LIKES: 86400,   // 24 hours — like state sets expire and rebuild from DB on miss
};

module.exports = { CACHE_KEYS, CACHE_TTL };
