require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const logger = require('./utils/logger');
const errorMiddleware = require('./middlewares/error.middleware');
const routes = require('./routes/index');

const app = express();

// Security headers
app.use(helmet());

// CORS — allow only the configured client origin
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// HTTP request logging (skip in test env)
if (env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

// Global rate limit — 100 requests / 15 min per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.', code: 'RATE_LIMITED' },
});
app.use('/api', globalLimiter);

// Body parsers
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// API routes
app.use('/api', routes);

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});

// Global error handler (must be last)
app.use(errorMiddleware);

module.exports = app;
