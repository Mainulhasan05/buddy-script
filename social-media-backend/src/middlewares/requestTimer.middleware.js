const logger = require('../utils/logger');

// Threshold in ms — only log slow requests above this limit
const SLOW_REQUEST_THRESHOLD_MS = 500;

/**
 * Lightweight request timing middleware.
 * Logs the duration of every API request. Warns for slow requests.
 *
 * This enables:
 * - Identifying slow endpoints without external APM tooling
 * - Establishing baseline latency for performance comparisons
 * - Detecting latency regressions in development/staging
 */
const requestTimer = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1_000_000;

    const method = req.method;
    const url = req.originalUrl;
    const status = res.statusCode;
    const rounded = Math.round(durationMs * 100) / 100;

    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      logger.warn(`SLOW ${method} ${url} ${status} ${rounded}ms`);
    } else {
      logger.info(`${method} ${url} ${status} ${rounded}ms`);
    }
  });

  next();
};

module.exports = requestTimer;
