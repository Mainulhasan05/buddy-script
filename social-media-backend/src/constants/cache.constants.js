/**
 * Redis cache key patterns and TTLs.
 * All key functions are centralized here — never construct keys inline.
 */

const CACHE_KEYS = {
  FEED_VERSION: 'feed:version',
  FEED: (version, cursor) => `feed:public:v${version}:${cursor || 'first'}`,
  POST: (postId) => `post:${postId}`,
  POST_COMMENTS_VERSION: (postId) => `post:${postId}:comments:version`,
  POST_COMMENTS: (postId, version, cursor) => `post:${postId}:comments:v${version}:${cursor || 'first'}`,
  LIKES: (type, id) => `likes:${type}:${id}`,
  USER_SESSION: (userId) => `user:${userId}:session`,
};

const CACHE_TTL = {
  FEED: 30,       // 30 seconds (reduced from 60 — versioned keys expire naturally)
  POST: 300,      // 5 minutes
  COMMENTS: 120,  // 2 minutes
  LIKES: 86400,   // 24 hours — like state sets expire and rebuild from DB on miss
};

module.exports = { CACHE_KEYS, CACHE_TTL };
