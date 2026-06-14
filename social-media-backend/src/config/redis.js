const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

const RECONNECT_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;

let redis = null;
let isAvailable = false;

/**
 * Creates a no-op Redis stub for when Redis is not configured.
 * All operations silently succeed/return defaults so the app works without Redis.
 */
const createNoopRedis = () => ({
  get: async () => null,
  set: async () => 'OK',
  del: async () => 0,
  sadd: async () => 0,
  sismember: async () => 0,
  srem: async () => 0,
  scan: async () => ['0', []],
  expire: async () => 1,
  status: 'noop',
});

if (env.REDIS_URL) {
  redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * RECONNECT_DELAY_MS, MAX_RETRY_DELAY_MS);
      logger.warn(`Redis reconnect attempt #${times} in ${delay}ms`);
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
      if (targetErrors.some((e) => err.message.includes(e))) return true;
      return false;
    },
  });

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('ready', () => {
    isAvailable = true;
    logger.info('Redis ready');
  });
  redis.on('error', (err) => {
    isAvailable = false;
    logger.error(`Redis error: ${err.message}`);
  });
  redis.on('close', () => {
    isAvailable = false;
    logger.warn('Redis connection closed');
  });
  redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));
} else {
  if (env.NODE_ENV === 'production') {
    logger.error('CRITICAL: REDIS_URL is not configured in production environment.');
    throw new Error('REDIS_URL is required in production environment.');
  }
  redis = createNoopRedis();
  logger.warn('Redis not configured — running without cache (REDIS_URL is empty)');
}

const connectRedis = async () => {
  if (!env.REDIS_URL) {
    if (env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL is required in production environment.');
    }
    logger.warn('Skipping Redis connection — REDIS_URL not set');
    return;
  }
  try {
    await redis.connect();
  } catch (err) {
    if (env.NODE_ENV === 'production') {
      logger.error(`CRITICAL: Redis connection failed in production: ${err.message}`);
      throw err;
    }
    logger.error(`Redis connect failed: ${err.message} — running without cache`);
    // Don't crash — fall back to noop
    redis = createNoopRedis();
  }
};

const getRedis = () => redis;

module.exports = { redis, getRedis, connectRedis };
