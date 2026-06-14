const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors, json } = format;

const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) => {
    return stack
      ? `[${timestamp}] ${level}: ${message}\n${stack}`
      : `[${timestamp}] ${level}: ${message}`;
  })
);

const fileFormat = combine(timestamp(), errors({ stack: true }), json());

const isProduction = process.env.NODE_ENV === 'production';

// In production, log only to stdout/stderr — containers should use log aggregators
// (CloudWatch, Datadog, etc.). File I/O under high load creates bottlenecks.
const fileTransports = isProduction
  ? []
  : [
      new transports.File({
        filename: path.join('logs', 'error.log'),
        level: 'error',
        format: fileFormat,
      }),
      new transports.File({
        filename: path.join('logs', 'combined.log'),
        format: fileFormat,
      }),
    ];

const logger = createLogger({
  level: isProduction ? 'warn' : 'info',
  transports: [
    new transports.Console({ format: consoleFormat }),
    ...fileTransports,
  ],
  exceptionHandlers: isProduction
    ? [new transports.Console({ format: consoleFormat })]
    : [new transports.File({ filename: path.join('logs', 'exceptions.log') })],
  rejectionHandlers: isProduction
    ? [new transports.Console({ format: consoleFormat })]
    : [new transports.File({ filename: path.join('logs', 'rejections.log') })],
});

module.exports = logger;
