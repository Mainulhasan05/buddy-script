require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { connectRedis } = require('./src/config/redis');
const { connectRabbitMQ } = require('./src/config/rabbitmq');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');

const PORT = env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB — required, will crash if unavailable
    await connectDB();

    // Connect to optional services — graceful degradation
    await connectRedis();
    await connectRabbitMQ();

    // Start async workers only if RabbitMQ is connected
    if (env.RABBITMQ_URL) {
      try {
        const { startLikeWorker } = require('./src/workers/like.worker');
        const { startNotificationWorker } = require('./src/workers/notification.worker');
        startLikeWorker();
        startNotificationWorker();
        logger.info('RabbitMQ workers started');
      } catch (err) {
        logger.warn(`Workers failed to start: ${err.message} — counter updates will be synchronous`);
      }
    } else {
      logger.warn('RabbitMQ not configured — workers not started (counters update directly on write)');
    }

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
