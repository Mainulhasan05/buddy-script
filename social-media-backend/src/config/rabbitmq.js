const amqplib = require('amqplib');
const env = require('./env');
const logger = require('../utils/logger');

const EXCHANGE_NAME = 'social.events';
const EXCHANGE_TYPE = 'topic';
const RECONNECT_DELAY_MS = 5000;

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
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
    logger.error(`RabbitMQ connect failed: ${err.message} — retrying in 5s...`);
    setTimeout(connectRabbitMQ, RECONNECT_DELAY_MS);
  }
};

const getChannel = () => {
  if (!channel) throw new Error('RabbitMQ channel not available');
  return channel;
};

const publish = (routingKey, payload) => {
  const ch = getChannel();
  const content = Buffer.from(JSON.stringify(payload));
  ch.publish(EXCHANGE_NAME, routingKey, content, {
    persistent: true,
    contentType: 'application/json',
  });
};

module.exports = { connectRabbitMQ, getChannel, publish, EXCHANGE_NAME };
