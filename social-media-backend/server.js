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
    // Connect to all external services before accepting traffic
    await connectDB();
    await connectRedis();
    await connectRabbitMQ();

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
