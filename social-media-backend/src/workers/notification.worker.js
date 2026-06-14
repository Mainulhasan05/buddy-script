const amqplib = require('amqplib');
const cacheService = require('../services/cache.service');
const { EXCHANGES, QUEUES, ROUTING_KEYS } = require('../constants/queue.constants');
const logger = require('../utils/logger');
const env = require('../config/env');

/**
 * Notification / feed-invalidation worker.
 * Listens on q.feed.invalidate — on post.created events, flushes the
 * public feed cache so the next read re-builds from DB.
 *
 * Stub: notification fan-out (push/email) can be added here in future.
 */
const startNotificationWorker = async () => {
  try {
    const connection = await amqplib.connect(env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGES.SOCIAL_EVENTS, 'topic', { durable: true });

    await channel.assertQueue(QUEUES.FEED_INVALIDATE, {
      durable: true,
      deadLetterExchange: 'social.dlq',
    });

    channel.bindQueue(QUEUES.FEED_INVALIDATE, EXCHANGES.SOCIAL_EVENTS, ROUTING_KEYS.POST_CREATED);

    channel.prefetch(10);

    logger.info('notification.worker: listening on ' + QUEUES.FEED_INVALIDATE);

    channel.consume(QUEUES.FEED_INVALIDATE, async (msg) => {
      if (!msg) return;

      try {
        const payload = JSON.parse(msg.content.toString());
        logger.info(`notification.worker: invalidating feed cache for post ${payload.postId}`);
        await cacheService.incrFeedVersion();
        channel.ack(msg);
      } catch (err) {
        logger.error(`notification.worker: failed to process message — ${err.message}`);
        channel.nack(msg, false, false); // discard malformed messages
      }
    });

    connection.on('close', () => {
      logger.warn('notification.worker: connection closed — worker stopped');
    });
    connection.on('error', (err) => {
      logger.error(`notification.worker: connection error — ${err.message}`);
    });
  } catch (err) {
    logger.error(`notification.worker: failed to start — ${err.message}`);
    setTimeout(startNotificationWorker, 10_000);
  }
};

module.exports = { startNotificationWorker };
