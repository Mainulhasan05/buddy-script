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
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });
    channel.prefetch(10);

    logger.info('RabbitMQ connected and exchange asserted');

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
 * Silently drops if RabbitMQ is not connected (graceful degradation).
 */
const publish = (routingKey, payload) => {
  const ch = getChannel();
  if (!ch) {
    logger.warn(`RabbitMQ not available — dropping event: ${routingKey}`);
    return;
  }
  const content = Buffer.from(JSON.stringify(payload));
  ch.publish(EXCHANGE_NAME, routingKey, content, {
    persistent: true,
    contentType: 'application/json',
  });
};

module.exports = { connectRabbitMQ, getChannel, publish, EXCHANGE_NAME };
