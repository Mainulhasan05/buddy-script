const amqplib = require('amqplib');
const mongoose = require('mongoose');
const Post = require('../models/Post.model');
const Comment = require('../models/Comment.model');
const { EXCHANGES, QUEUES, ROUTING_KEYS } = require('../constants/queue.constants');
const logger = require('../utils/logger');
const env = require('../config/env');

const BATCH_SIZE = 100;
const BATCH_INTERVAL_MS = 500;
const MAX_RETRIES = 3;
const RETRY_HEADER = 'x-retry-count';

// In-memory batch: { key → { model, targetId, delta, msgs[] } }
let batch = new Map();
let batchTimer = null;

const flushBatch = async (channel) => {
  if (batch.size === 0) return;

  const current = batch;
  batch = new Map();

  const postOps = [];
  const commentOps = [];

  for (const [, item] of current) {
    const op = {
      updateOne: {
        filter: { _id: item.targetId },
        update: { $inc: { likeCount: item.delta } },
      },
    };
    if (item.targetType === 'post') postOps.push(op);
    else commentOps.push(op);
  }

  try {
    if (postOps.length) await Post.bulkWrite(postOps, { ordered: false });
    if (commentOps.length) await Comment.bulkWrite(commentOps, { ordered: false });

    // ACK all messages in batch — each batch entry may hold multiple messages
    for (const [, item] of current) {
      item.msgs.forEach((m) => channel.ack(m));
    }
    logger.info(`like.worker: flushed ${current.size} updates`);
  } catch (err) {
    logger.error(`like.worker: bulkWrite failed — ${err.message}`);
    // Republish with incremented retry header, then ACK original so they are not requeued infinitely
    for (const [, item] of current) {
      item.msgs.forEach((m) => {
        const headers = m.properties.headers || {};
        const retries = (headers[RETRY_HEADER] || 0) + 1;
        if (retries >= MAX_RETRIES) {
          logger.error(`like.worker: max retries reached for msg, dead-lettering`);
          channel.nack(m, false, false); // discard/DLQ
        } else {
          const updatedHeaders = { ...headers, [RETRY_HEADER]: retries };
          channel.publish(EXCHANGES.SOCIAL_EVENTS, m.fields.routingKey, m.content, {
            headers: updatedHeaders,
            persistent: true,
          });
          channel.ack(m);
        }
      });
    }
  }
};

const scheduleBatchFlush = (channel) => {
  if (batchTimer) return;
  batchTimer = setTimeout(async () => {
    batchTimer = null;
    await flushBatch(channel);
  }, BATCH_INTERVAL_MS);
};

const startLikeWorker = async () => {
  try {
    const connection = await amqplib.connect(env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGES.SOCIAL_EVENTS, 'topic', { durable: true });

    await channel.assertQueue(QUEUES.LIKE_COUNTER, {
      durable: true,
      deadLetterExchange: 'social.dlq',
    });

    channel.bindQueue(QUEUES.LIKE_COUNTER, EXCHANGES.SOCIAL_EVENTS, ROUTING_KEYS.LIKE_CREATED);
    channel.bindQueue(QUEUES.LIKE_COUNTER, EXCHANGES.SOCIAL_EVENTS, ROUTING_KEYS.LIKE_DELETED);

    channel.prefetch(10);

    logger.info('like.worker: listening on ' + QUEUES.LIKE_COUNTER);

    channel.consume(QUEUES.LIKE_COUNTER, async (msg) => {
      if (!msg) return;

      let payload;
      try {
        payload = JSON.parse(msg.content.toString());
      } catch {
        logger.error('like.worker: failed to parse message, discarding');
        channel.nack(msg, false, false);
        return;
      }

      const { targetId, targetType, delta } = payload;
      const key = `${targetType}:${targetId}`;

      // Accumulate delta — multiple events for same target collapse into one update
      const existing = batch.get(key);
      if (existing) {
        existing.delta += delta;
        existing.msgs.push(msg); // accumulate ALL messages for proper ACK
      } else {
        batch.set(key, { targetId: new mongoose.Types.ObjectId(targetId), targetType, delta, msgs: [msg] });
      }

      if (batch.size >= BATCH_SIZE) {
        if (batchTimer) {
          clearTimeout(batchTimer);
          batchTimer = null;
        }
        await flushBatch(channel);
      } else {
        scheduleBatchFlush(channel);
      }
    });

    connection.on('close', () => {
      logger.warn('like.worker: connection closed — worker stopped');
    });
    connection.on('error', (err) => {
      logger.error(`like.worker: connection error — ${err.message}`);
    });
  } catch (err) {
    logger.error(`like.worker: failed to start — ${err.message}`);
    // Retry after 10s
    setTimeout(startLikeWorker, 10_000);
  }
};

module.exports = { startLikeWorker };
