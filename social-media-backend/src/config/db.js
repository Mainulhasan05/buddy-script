const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const MONGO_OPTIONS = {
  maxPoolSize: Number(env.MONGO_MAX_POOL_SIZE),
  minPoolSize: Number(env.MONGO_MIN_POOL_SIZE),
  socketTimeoutMS: 45000,     // close idle sockets after 45s
  serverSelectionTimeoutMS: 5000, // fail fast if DB unreachable
  heartbeatFrequencyMS: 10000,    // check replica set health every 10s
  retryWrites: true,          // automatically retry transient write errors
  w: 'majority',              // write concern — data survives primary failover
};

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, MONGO_OPTIONS);
    isConnected = true;
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB disconnected — attempting reconnect...');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB error: ${err.message}`);
});

module.exports = connectDB;
