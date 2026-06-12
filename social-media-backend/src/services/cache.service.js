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
 * Add a member to a Redis Set (used for like state tracking).
 * Optionally sets a TTL on the key (seconds) to prevent unbounded growth.
 */
const sAdd = async (key, member, ttlSeconds) => {
  try {
    await getRedis().sadd(key, member);
    if (ttlSeconds) {
      await getRedis().expire(key, ttlSeconds);
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

module.exports = { get, set, del, sAdd, sIsMember, sRem, scanDel };

