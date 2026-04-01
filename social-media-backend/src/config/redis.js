const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

const RECONNECT_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;

const redis = new Redis(env.REDIS_URL, {
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
redis.on('ready', () => logger.info('Redis ready'));
redis.on('error', (err) => logger.error(`Redis error: ${err.message}`));
redis.on('close', () => logger.warn('Redis connection closed'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

const connectRedis = async () => {
  await redis.connect();
};

module.exports = { redis, connectRedis };
