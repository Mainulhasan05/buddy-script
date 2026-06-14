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
 * Uses confirm channel — waits for broker ACK before resolving.
 * Silently drops if RabbitMQ is not connected (graceful degradation).
 * Returns true if the message was confirmed, false otherwise.
 */
const publish = async (routingKey, payload) => {
  const ch = getChannel();
  if (!ch) {
    logger.warn(`RabbitMQ not available — dropping event: ${routingKey}`);
    return false;
  }

  try {
    const content = Buffer.from(JSON.stringify(payload));
    // waitForConfirms() resolves when broker confirms all outstanding publishes
    ch.publish(EXCHANGE_NAME, routingKey, content, {
      persistent: true,
      contentType: 'application/json',
    });
    await ch.waitForConfirms();
    return true;
  } catch (err) {
    logger.error(`RabbitMQ publish failed for ${routingKey}: ${err.message}`);
    return false;
  }
};

module.exports = { connectRabbitMQ, getChannel, publish, EXCHANGE_NAME };
