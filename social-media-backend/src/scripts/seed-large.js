require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model');
const Post = require('../models/Post.model');
const Comment = require('../models/Comment.model');
const Like = require('../models/Like.model');
const RefreshToken = require('../models/RefreshToken.model');
const connectDB = require('../config/db');
const { connectRedis, getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const NUM_USERS = 11000;
const NUM_NORMAL_POSTS = 90;
const NUM_MEGA_POSTS = 10;
const SEED_PASSWORD = 'Password123';
const BCRYPT_ROUNDS = 12;

// Post dates must be strictly before June 10, 2026
const START_DATE = new Date('2026-01-01T00:00:00.000Z').getTime();
const END_DATE = new Date('2026-06-09T23:59:59.000Z').getTime();

// Normal posts are created between START_DATE and 3 days before END_DATE
const randomNormalDate = () => {
  const endThreshold = END_DATE - 3 * 24 * 60 * 60 * 1000;
  const time = START_DATE + Math.random() * (endThreshold - START_DATE);
  return new Date(time);
};

const clearCollection = async (model) => {
  try {
    await model.collection.drop();
    logger.info(`Dropped collection: ${model.collection.collectionName}`);
  } catch (err) {
    // Code 26 (NamespaceNotFound) means the collection does not exist yet; safe to ignore
    if (err.code === 26 || err.message.includes('ns not found')) {
      logger.info(`Collection ${model.collection.collectionName} does not exist — skipping drop.`);
    } else {
      logger.warn(`Failed to drop collection ${model.collection.collectionName}: ${err.message} — falling back to deleteMany`);
      await model.deleteMany({});
    }
  }
  // Ensure Mongoose re-creates indexes immediately
  await model.createIndexes();
};

const seed = async () => {
  try {
    logger.info('Starting large-scale database seeding...');
    await connectDB();

    // 1. Drop existing collections to maintain integrity and rebuild unique indexes instantly
    logger.info('Clearing existing collections using drop()...');
    await clearCollection(RefreshToken);
    await clearCollection(Like);
    await clearCollection(Comment);
    await clearCollection(Post);
    await clearCollection(User);
    logger.info('Collections cleared successfully.');

    // 2. Generate password hash once to save CPU time
    logger.info('Generating password hash (this takes a moment)...');
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

    // 3. Generate and insert 11,000 users
    logger.info(`Generating data for ${NUM_USERS} users...`);
    const usersData = [];
    for (let i = 1; i <= NUM_USERS; i++) {
      usersData.push({
        firstName: `UserFirstName${i}`,
        lastName: `UserLastName${i}`,
        email: `seeded.user.${i}@example.com`,
        passwordHash,
        avatar: {
          url: `https://xsgames.co/randomusers/assets/avatars/male/${(i % 50) + 1}.jpg`,
          publicId: null,
        },
      });
    }

    logger.info('Inserting users into database in batches...');
    const userBatchSize = 2000;
    const createdUsers = [];
    for (let i = 0; i < usersData.length; i += userBatchSize) {
      const batch = usersData.slice(i, i + userBatchSize);
      const inserted = await User.insertMany(batch);
      createdUsers.push(...inserted);
      logger.info(`Inserted users ${i + 1} to ${Math.min(i + userBatchSize, usersData.length)}...`);
    }
    logger.info(`Successfully seeded ${createdUsers.length} users.`);

    // 4. Generate posts, comments, and likes
    const postsData = [];
    const likesData = [];
    const commentsData = [];

    // First generate the 10 mega-posts
    logger.info(`Generating ${NUM_MEGA_POSTS} mega-posts (with 10k likes and 500+ comments each)...`);
    for (let i = 1; i <= NUM_MEGA_POSTS; i++) {
      const authorUser = createdUsers[Math.floor(Math.random() * createdUsers.length)];
      // Spaced out in the last 24 hours of the range (ensuring they are the newest posts)
      const postTime = END_DATE - (24 * 60 * 60 * 1000) + (i * 2 * 60 * 60 * 1000);
      const postDate = new Date(postTime);
      const postId = new mongoose.Types.ObjectId();

      // Mega-posts need at least 10,000 likes from unique users.
      // We assign likes from the first 10,000 users.
      const numLikes = 10000;
      for (let u = 0; u < numLikes; u++) {
        const liker = createdUsers[u];
        // Like time is between postTime and postTime + 10 mins (ensuring it's <= END_DATE)
        const likeTime = postTime + Math.random() * 10 * 60 * 1000;
        likesData.push({
          userId: liker._id,
          targetId: postId,
          targetType: 'post',
          createdAt: new Date(likeTime),
        });
      }

      // Mega-posts need at least 500 comments (including nested replies).
      let commentCountForPost = 0;
      while (commentCountForPost < 500) {
        const commentId = new mongoose.Types.ObjectId();
        const commentAuthor = createdUsers[Math.floor(Math.random() * createdUsers.length)];
        const numReplies = Math.floor(Math.random() * 21); // 0 to 20 replies

        // Comment time is between postTime and postTime + 30 mins
        const commentTime = postTime + Math.random() * 30 * 60 * 1000;

        commentsData.push({
          _id: commentId,
          postId: postId,
          parentId: null,
          depth: 0,
          author: {
            _id: commentAuthor._id,
            firstName: commentAuthor.firstName,
            lastName: commentAuthor.lastName,
            avatarUrl: commentAuthor.avatar.url,
          },
          content: `Mega-post #${i} top-level comment #${commentsData.length + 1}. Scale test comment content.`,
          likeCount: Math.floor(Math.random() * 100),
          replyCount: numReplies,
          deletedAt: null,
          createdAt: new Date(commentTime),
          updatedAt: new Date(commentTime),
        });
        commentCountForPost++;

        for (let r = 0; r < numReplies; r++) {
          const replyId = new mongoose.Types.ObjectId();
          const replyAuthor = createdUsers[Math.floor(Math.random() * createdUsers.length)];
          // Reply time is between commentTime and commentTime + 15 mins
          const replyTime = commentTime + Math.random() * 15 * 60 * 1000;

          commentsData.push({
            _id: replyId,
            postId: postId,
            parentId: commentId,
            depth: 1,
            author: {
              _id: replyAuthor._id,
              firstName: replyAuthor.firstName,
              lastName: replyAuthor.lastName,
              avatarUrl: replyAuthor.avatar.url,
            },
            content: `Reply #${r + 1} to comment on mega-post #${i}.`,
            likeCount: Math.floor(Math.random() * 20),
            replyCount: 0,
            deletedAt: null,
            createdAt: new Date(replyTime),
            updatedAt: new Date(replyTime),
          });
          commentCountForPost++;
        }
      }

      postsData.push({
        _id: postId,
        author: {
          _id: authorUser._id,
          firstName: authorUser.firstName,
          lastName: authorUser.lastName,
          avatarUrl: authorUser.avatar.url,
        },
        content: `This is mega-post number ${i}. Prepared for large-scale performance testing with 10k+ likes and 500+ comments. #megapost${i}`,
        image: null,
        visibility: 'public',
        likeCount: numLikes,
        commentCount: commentCountForPost,
        deletedAt: null,
        createdAt: postDate,
        updatedAt: postDate,
      });
    }

    // Now generate the 90 normal posts
    logger.info(`Generating ${NUM_NORMAL_POSTS} normal posts...`);
    for (let i = 1; i <= NUM_NORMAL_POSTS; i++) {
      const authorUser = createdUsers[Math.floor(Math.random() * createdUsers.length)];
      const postDate = randomNormalDate();
      const postId = new mongoose.Types.ObjectId();

      // Normal posts have random likes from 0 to 50
      const numLikes = Math.floor(Math.random() * 51);
      const postLikers = new Set();
      while (postLikers.size < numLikes) {
        const randUserIdx = Math.floor(Math.random() * createdUsers.length);
        postLikers.add(createdUsers[randUserIdx]._id.toString());
      }

      postLikers.forEach((likerId) => {
        const postTime = postDate.getTime();
        const likeTime = Math.min(postTime + Math.random() * 24 * 60 * 60 * 1000, END_DATE);
        likesData.push({
          userId: new mongoose.Types.ObjectId(likerId),
          targetId: postId,
          targetType: 'post',
          createdAt: new Date(likeTime),
        });
      });

      // Normal posts have random comments from 0 to 10
      const numComments = Math.floor(Math.random() * 11);
      let commentsCount = 0;
      for (let c = 0; c < numComments; c++) {
        const commentId = new mongoose.Types.ObjectId();
        const commentAuthor = createdUsers[Math.floor(Math.random() * createdUsers.length)];
        const numReplies = Math.random() > 0.7 ? Math.floor(Math.random() * 5) : 0;

        const commentTime = Math.min(postDate.getTime() + Math.random() * 24 * 60 * 60 * 1000, END_DATE);

        commentsData.push({
          _id: commentId,
          postId: postId,
          parentId: null,
          depth: 0,
          author: {
            _id: commentAuthor._id,
            firstName: commentAuthor.firstName,
            lastName: commentAuthor.lastName,
            avatarUrl: commentAuthor.avatar.url,
          },
          content: `Comment #${c + 1} on normal post #${i}.`,
          likeCount: Math.floor(Math.random() * 5),
          replyCount: numReplies,
          deletedAt: null,
          createdAt: new Date(commentTime),
          updatedAt: new Date(commentTime),
        });
        commentsCount++;

        for (let r = 0; r < numReplies; r++) {
          const replyId = new mongoose.Types.ObjectId();
          const replyAuthor = createdUsers[Math.floor(Math.random() * createdUsers.length)];
          const replyTime = Math.min(commentTime + Math.random() * 12 * 60 * 60 * 1000, END_DATE);

          commentsData.push({
            _id: replyId,
            postId: postId,
            parentId: commentId,
            depth: 1,
            author: {
              _id: replyAuthor._id,
              firstName: replyAuthor.firstName,
              lastName: replyAuthor.lastName,
              avatarUrl: replyAuthor.avatar.url,
            },
            content: `Reply #${r + 1} to comment on normal post #${i}.`,
            likeCount: Math.floor(Math.random() * 2),
            replyCount: 0,
            deletedAt: null,
            createdAt: new Date(replyTime),
            updatedAt: new Date(replyTime),
          });
          commentsCount++;
        }
      }

      postsData.push({
        _id: postId,
        author: {
          _id: authorUser._id,
          firstName: authorUser.firstName,
          lastName: authorUser.lastName,
          avatarUrl: authorUser.avatar.url,
        },
        content: `This is normal seeded post number ${i}. It is a simulated post. #normalpost${i}`,
        image: null,
        visibility: Math.random() > 0.1 ? 'public' : 'private',
        likeCount: numLikes,
        commentCount: commentsCount,
        deletedAt: null,
        createdAt: postDate,
        updatedAt: postDate,
      });
    }

    // 5. Batch insert the generated data
    logger.info('Inserting posts in batches...');
    const postBatchSize = 100;
    for (let i = 0; i < postsData.length; i += postBatchSize) {
      const batch = postsData.slice(i, i + postBatchSize);
      await Post.insertMany(batch);
      logger.info(`Inserted posts ${i + 1} to ${Math.min(i + postBatchSize, postsData.length)}...`);
    }

    logger.info('Inserting comments in batches...');
    const commentBatchSize = 2000;
    for (let i = 0; i < commentsData.length; i += commentBatchSize) {
      const batch = commentsData.slice(i, i + commentBatchSize);
      await Comment.insertMany(batch);
      logger.info(`Inserted comments ${i + 1} to ${Math.min(i + commentBatchSize, commentsData.length)}...`);
    }

    logger.info('Inserting likes in batches...');
    const likeBatchSize = 5000;
    for (let i = 0; i < likesData.length; i += likeBatchSize) {
      const batch = likesData.slice(i, i + likeBatchSize);
      await Like.insertMany(batch);
      logger.info(`Inserted likes ${i + 1} to ${Math.min(i + likeBatchSize, likesData.length)}...`);
    }

    // 6. Redis Flush
    try {
      logger.info('Attempting to connect to Redis to invalidate caches...');
      await connectRedis();
      const redisClient = getRedis();
      if (redisClient && typeof redisClient.flushall === 'function' && redisClient.status !== 'noop') {
        logger.info('Flushing Redis cache...');
        await redisClient.flushall();
        logger.info('Redis cache flushed.');
        await redisClient.quit();
      } else {
        logger.info('Redis client is a noop or not ready — skipped flush.');
      }
    } catch (redisErr) {
      logger.warn(`Redis flush failed (non-critical): ${redisErr.message}`);
    }

    logger.info('Database large seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  }
};

seed();
