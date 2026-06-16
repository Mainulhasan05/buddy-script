const amqplib = require('amqplib');
const env = require('./env');
const logger = require('../utils/logger');

const EXCHANGE_NAME = 'social.events';
const EXCHANGE_TYPE = 'topic';
const RECONNECT_DELAY_MS = 5000;

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
  if (!env.RABBITMQ_URL) {
    if (env.NODE_ENV === 'production') {
      logger.error('CRITICAL: RABBITMQ_URL is not set in production. App must fail-fast.');
      throw new Error('RABBITMQ_URL is required in production environment.');
    }
    logger.warn('Skipping RabbitMQ connection — RABBITMQ_URL not set (events will be dropped)');
    return;
  }

  try {
    connection = await amqplib.connect(env.RABBITMQ_URL);

    // Use a confirm channel — publish() calls return a promise that resolves
    // only after the broker confirms receipt. This prevents silent message loss.
    channel = await connection.createConfirmChannel();

    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });
    channel.prefetch(10);

    logger.info('RabbitMQ connected with confirm channel and exchange asserted');

    connection.on('error', (err) => {
      logger.error(`RabbitMQ connection error: ${err.message}`);
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed — reconnecting in 5s...');
      connection = null;
      channel = null;
      setTimeout(connectRabbitMQ, RECONNECT_DELAY_MS);
    });
  } catch (err) {
    if (env.NODE_ENV === 'production') {
      logger.error(`CRITICAL: RabbitMQ connection failed in production: ${err.message}`);
      throw err;
    }
    logger.error(`RabbitMQ connect failed: ${err.message} — retrying in 5s...`);
    setTimeout(connectRabbitMQ, RECONNECT_DELAY_MS);
  }
};

const getChannel = () => {
  if (!channel) return null; // Return null instead of throwing when not available
  return channel;
};

/**
 * Publish a message to the topic exchange.
 *
 * The channel is a confirm channel, but we DO NOT await per-message confirmation
 * in the request path. `waitForConfirms()` blocks until the broker acks (and with
 * `persistent: true` on a durable queue that includes a disk fsync), and because
 * it waits on every outstanding publish on the shared channel, concurrent requests
 * serialize each other's latency. The like-toggle endpoint is the hottest write in
 * the app, so that round-trip directly inflated its p50/p95 and capped throughput.
 *
 * Instead we hand the message to the broker and observe ack/nack asynchronously via
 * the confirm callback (logged, not awaited). Counters are eventually-consistent and
 * owned by the worker; the synchronous fallback in the services covers the
 * channel-down case (when this returns false).
 *
 * Returns true if the message was handed to a live channel, false if no channel.
 */
const publish = (routingKey, payload) => {
  const ch = getChannel();
  if (!ch) {
    logger.warn(`RabbitMQ not available — dropping event: ${routingKey}`);
    return false;
  }

  try {
    const content = Buffer.from(JSON.stringify(payload));
    // Confirm callback fires on broker ack/nack without blocking the request.
    ch.publish(
      EXCHANGE_NAME,
      routingKey,
      content,
      { persistent: true, contentType: 'application/json' },
      (err) => {
        if (err) {
          logger.error(`RabbitMQ publish nacked for ${routingKey}: ${err.message}`);
        }
      }
    );
    return true;
  } catch (err) {
    logger.error(`RabbitMQ publish failed for ${routingKey}: ${err.message}`);
    return false;
  }
};

module.exports = { connectRabbitMQ, getChannel, publish, EXCHANGE_NAME };
