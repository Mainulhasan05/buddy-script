/**
 * Redis cache key patterns and TTLs.
 * All key functions are centralized here — never construct keys inline.
 */

const CACHE_KEYS = {
  FEED_VERSION: 'feed:version',
  FEED: (version, cursor) => `feed:public:v${version}:${cursor || 'first'}`,
  POST: (postId) => `post:${postId}`,
  POST_COMMENTS: (postId) => `post:${postId}:comments`,
  LIKES: (type, id) => `likes:${type}:${id}`,
  USER_SESSION: (userId) => `user:${userId}:session`,
};

const CACHE_TTL = {
  FEED: 30,       // 30 seconds (reduced from 60 — versioned keys expire naturally)
  POST: 300,      // 5 minutes
  COMMENTS: 120,  // 2 minutes
  LIKES: 86400,   // 24 hours — like state sets expire and rebuild from DB on miss
};

// Only cache the first N pages of feed — deeper pages bypass cache (low hit rate)
const MAX_CACHED_FEED_PAGES = 5;

module.exports = { CACHE_KEYS, CACHE_TTL, MAX_CACHED_FEED_PAGES };
