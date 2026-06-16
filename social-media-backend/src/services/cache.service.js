const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Get a JSON-serialized value from Redis.
 * Returns null on miss or error (cache errors must never crash the app).
 */
const get = async (key) => {
  try {
    const data = await getRedis().get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.error(`Cache GET error [${key}]: ${err.message}`);
    return null;
  }
};

/**
 * Set a JSON-serialized value in Redis with a TTL (seconds).
 */
const set = async (key, data, ttlSeconds) => {
  try {
    await getRedis().set(key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch (err) {
    logger.error(`Cache SET error [${key}]: ${err.message}`);
  }
};

/**
 * Delete one or more keys.
 */
const del = async (...keys) => {
  try {
    if (keys.length) await getRedis().del(...keys);
  } catch (err) {
    logger.error(`Cache DEL error [${keys}]: ${err.message}`);
  }
};

/**
 * Read a version counter and a versioned payload in a SINGLE round trip.
 *
 * The payload is stored as { v, data } under a fixed key. We fetch the version
 * key and the data key together in one pipeline, then validate that the payload's
 * embedded version matches the current version. A mismatch (or missing payload) is
 * treated as a miss — this is how O(1) invalidation works without versioned keys.
 *
 * Returns { version, data }. `data` is null on miss/stale/error.
 */
const getVersioned = async (versionKey, dataKey) => {
  try {
    const redis = getRedis();

    let versionRaw = null;
    let dataRaw = null;

    if (typeof redis.pipeline === 'function') {
      // Real Redis — one round trip for both GETs
      const results = await redis.pipeline().get(versionKey).get(dataKey).exec();
      versionRaw = results?.[0]?.[1] ?? null;
      dataRaw = results?.[1]?.[1] ?? null;
    } else {
      // Noop stub / clients without pipeline — fall back to direct reads
      versionRaw = await redis.get(versionKey);
      dataRaw = await redis.get(dataKey);
    }

    const version = versionRaw || '0';
    if (!dataRaw) return { version, data: null };

    const parsed = JSON.parse(dataRaw);
    if (parsed && parsed.v === version) return { version, data: parsed.data };
    return { version, data: null }; // stale — version was bumped since this was cached
  } catch (err) {
    logger.error(`Cache getVersioned error [${versionKey}/${dataKey}]: ${err.message}`);
    return { version: '0', data: null };
  }
};

/**
 * Store a payload tagged with the version it was built against (TTL in seconds).
 * Pairs with getVersioned().
 */
const setVersioned = async (dataKey, version, data, ttlSeconds) => {
  try {
    await getRedis().set(dataKey, JSON.stringify({ v: version, data }), 'EX', ttlSeconds);
  } catch (err) {
    logger.error(`Cache setVersioned error [${dataKey}]: ${err.message}`);
  }
};

/**
 * Add a member to a Redis Set (used for like state tracking).
 * Optionally sets a TTL on the key (seconds) to prevent unbounded growth.
 */
const sAdd = async (key, member, ttlSeconds) => {
  try {
    const redis = getRedis();
    if (ttlSeconds && typeof redis.pipeline === 'function') {
      // Pipeline: send SADD + EXPIRE in a single round trip
      const pipeline = redis.pipeline();
      pipeline.sadd(key, member);
      pipeline.expire(key, ttlSeconds);
      await pipeline.exec();
    } else {
      await redis.sadd(key, member);
      if (ttlSeconds) await redis.expire(key, ttlSeconds);
    }
  } catch (err) {
    logger.error(`Cache SADD error [${key}]: ${err.message}`);
  }
};

/**
 * Check if a member exists in a Redis Set.
 * Returns boolean.
 */
const sIsMember = async (key, member) => {
  try {
    const result = await getRedis().sismember(key, member);
    return result === 1;
  } catch (err) {
    logger.error(`Cache SISMEMBER error [${key}]: ${err.message}`);
    return false;
  }
};

/**
 * Remove a member from a Redis Set.
 */
const sRem = async (key, member) => {
  try {
    await getRedis().srem(key, member);
  } catch (err) {
    logger.error(`Cache SREM error [${key}]: ${err.message}`);
  }
};

/**
 * Delete all keys matching a glob pattern using SCAN (non-blocking, safe at scale).
 * Used for wildcard feed cache invalidation: scanDel('feed:public:*')
 */
const scanDel = async (pattern) => {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await getRedis().scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length) await getRedis().del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.error(`Cache SCAN DEL error [${pattern}]: ${err.message}`);
  }
};

/**
 * Get the current feed cache version (O(1) GET).
 * Returns '0' if not set yet.
 */
const getFeedVersion = async () => {
  try {
    const v = await getRedis().get('feed:version');
    return v || '0';
  } catch (err) {
    logger.error(`Cache feed version GET error: ${err.message}`);
    return '0';
  }
};

/**
 * Increment the feed cache version (O(1) INCR).
 * All old feed keys (keyed with previous version) expire naturally via TTL.
 * This replaces the O(N) SCAN-based invalidation.
 */
const incrFeedVersion = async () => {
  try {
    return await getRedis().incr('feed:version');
  } catch (err) {
    logger.error(`Cache feed version INCR error: ${err.message}`);
    return null;
  }
};

/**
 * Get the current comments cache version for a post (O(1) GET).
 * Returns '0' if not set yet.
 */
const getCommentVersion = async (postId) => {
  try {
    const v = await getRedis().get(`post:${postId}:comments:version`);
    return v || '0';
  } catch (err) {
    logger.error(`Cache comment version GET error for post ${postId}: ${err.message}`);
    return '0';
  }
};

/**
 * Increment the comments cache version for a post (O(1) INCR).
 * All old comment pages (keyed with previous version) expire naturally via TTL.
 */
const incrCommentVersion = async (postId) => {
  try {
    return await getRedis().incr(`post:${postId}:comments:version`);
  } catch (err) {
    logger.error(`Cache comment version INCR error for post ${postId}: ${err.message}`);
    return null;
  }
};

module.exports = {
  get,
  set,
  del,
  getVersioned,
  setVersioned,
  sAdd,
  sIsMember,
  sRem,
  scanDel,
  getFeedVersion,
  incrFeedVersion,
  getCommentVersion,
  incrCommentVersion,
};

