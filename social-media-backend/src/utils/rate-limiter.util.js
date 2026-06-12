const rateLimit = require('express-rate-limit');
const { getRedis } = require('../config/redis');
const logger = require('./logger');

let RedisStore;
try {
  RedisStore = require('rate-limit-redis').default || require('rate-limit-redis');
} catch (err) {
  logger.warn('rate-limit-redis module not loaded, will fallback to MemoryStore');
}

/**
 * Creates a rate limiter.
 * If Redis is configured and connected, it uses RedisStore.
 * Otherwise, it falls back to the in-memory store.
 */
const createLimiter = ({ windowMs, max, message, keyGenerator, skip }) => {
  const redisClient = getRedis();
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: message || { success: false, message: 'Too many requests, please slow down.', code: 'RATE_LIMITED' },
  };

  if (keyGenerator) {
    options.keyGenerator = keyGenerator;
  }

  if (skip) {
    options.skip = skip;
  }

  // Use RedisStore only if Redis is available, not a noop stub, and the module was loaded
  if (RedisStore && redisClient && redisClient.status !== 'noop') {
    try {
      options.store = new RedisStore({
        sendCommand: async (...args) => {
          return redisClient.call(args[0], ...args.slice(1));
        },
      });
      logger.info(`Initialized Redis-backed rate limiter (limit: ${max} per ${windowMs / 1000}s)`);
    } catch (err) {
      logger.warn(`Failed to initialize Redis store for rate limiter: ${err.message}. Falling back to MemoryStore.`);
    }
  } else {
    logger.warn(`Redis not available. Using MemoryStore for rate limiter (limit: ${max} per ${windowMs / 1000}s)`);
  }

  return rateLimit(options);
};

module.exports = createLimiter;
