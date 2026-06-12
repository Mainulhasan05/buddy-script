require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { connectRedis, getRedis } = require('./src/config/redis');
const { connectRabbitMQ } = require('./src/config/rabbitmq');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');

const PORT = env.PORT || 5000;
const SHUTDOWN_TIMEOUT_MS = 30_000;

let server; // http.Server instance — needed for graceful shutdown

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

    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

// ── Graceful Shutdown ──────────────────────────────────────────────────────────
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return; // prevent double-shutdown
  isShuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);

  // Hard deadline — force exit if cleanup takes too long
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // don't keep event loop alive

  try {
    // 1. Stop accepting new connections, wait for in-flight requests
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info('HTTP server closed — no new connections');
    }

    // 2. Close MongoDB connection
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');

    // 3. Close Redis connection (if real, not noop)
    const redis = getRedis();
    if (redis && typeof redis.quit === 'function') {
      await redis.quit();
      logger.info('Redis connection closed');
    }

    // 4. RabbitMQ connections are closed by the amqplib connection.close()
    //    Workers manage their own connections — they will stop on process exit

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error(`Error during shutdown: ${err.message}`);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Process-Level Error Handlers ───────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
  // Trigger graceful shutdown — the rejection may have left state inconsistent
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception — process is in an undefined state:', error);
  // Must exit immediately — cannot guarantee consistent state
  process.exit(1);
});

startServer();
