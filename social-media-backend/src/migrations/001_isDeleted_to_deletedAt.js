/**
 * Migration: Convert isDeleted (Boolean) → deletedAt (Date) on posts and comments.
 * 
 * Idempotent — safe to run multiple times.
 * Run against a running MongoDB with:
 *   node src/migrations/001_isDeleted_to_deletedAt.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../utils/logger');

const run = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    logger.info('Migration: connected to MongoDB');

    const db = mongoose.connection.db;

    // ── Posts ──────────────────────────────────────────────────────────────────
    const postsCollection = db.collection('posts');

    // Convert isDeleted: true → deletedAt: new Date()
    const deletedPosts = await postsCollection.updateMany(
      { isDeleted: true, deletedAt: { $exists: false } },
      [{ $set: { deletedAt: '$updatedAt' } }, { $unset: 'isDeleted' }]
    );
    logger.info(`Posts (deleted): ${deletedPosts.modifiedCount} documents migrated`);

    // Convert isDeleted: false → deletedAt: null
    const activePosts = await postsCollection.updateMany(
      { isDeleted: false, deletedAt: { $exists: false } },
      { $set: { deletedAt: null }, $unset: { isDeleted: '' } }
    );
    logger.info(`Posts (active): ${activePosts.modifiedCount} documents migrated`);

    // Clean up any remaining isDeleted fields
    const remainingPosts = await postsCollection.updateMany(
      { isDeleted: { $exists: true } },
      { $unset: { isDeleted: '' } }
    );
    logger.info(`Posts (cleanup): ${remainingPosts.modifiedCount} documents cleaned`);

    // ── Comments ──────────────────────────────────────────────────────────────
    const commentsCollection = db.collection('comments');

    const deletedComments = await commentsCollection.updateMany(
      { isDeleted: true, deletedAt: { $exists: false } },
      [{ $set: { deletedAt: '$updatedAt' } }, { $unset: 'isDeleted' }]
    );
    logger.info(`Comments (deleted): ${deletedComments.modifiedCount} documents migrated`);

    const activeComments = await commentsCollection.updateMany(
      { isDeleted: false, deletedAt: { $exists: false } },
      { $set: { deletedAt: null }, $unset: { isDeleted: '' } }
    );
    logger.info(`Comments (active): ${activeComments.modifiedCount} documents migrated`);

    const remainingComments = await commentsCollection.updateMany(
      { isDeleted: { $exists: true } },
      { $unset: { isDeleted: '' } }
    );
    logger.info(`Comments (cleanup): ${remainingComments.modifiedCount} documents cleaned`);

    // ── Drop old indexes ──────────────────────────────────────────────────────
    // Attempt to drop old indexes — ignore errors if they don't exist
    const oldPostIndexes = [
      'visibility_1_isDeleted_1_createdAt_-1',
      'isDeleted_1_visibility_1__id_-1',
      'createdAt_-1__id_-1',
    ];
    for (const name of oldPostIndexes) {
      try {
        await postsCollection.dropIndex(name);
        logger.info(`Dropped old post index: ${name}`);
      } catch {
        // Index may not exist — safe to ignore
      }
    }

    const oldCommentIndexes = [
      'postId_1_parentId_1_createdAt_1',
      'postId_1_depth_1_createdAt_1',
    ];
    for (const name of oldCommentIndexes) {
      try {
        await commentsCollection.dropIndex(name);
        logger.info(`Dropped old comment index: ${name}`);
      } catch {
        // Index may not exist — safe to ignore
      }
    }

    logger.info('Migration complete ✅');
  } catch (err) {
    logger.error(`Migration failed: ${err.message}`);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

run();
