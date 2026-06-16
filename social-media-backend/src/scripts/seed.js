require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model');
const Post = require('../models/Post.model');
const Comment = require('../models/Comment.model');
const Like = require('../models/Like.model');
const RefreshToken = require('../models/RefreshToken.model');
const connectDB = require('../config/db');
const logger = require('../utils/logger');

const NUM_USERS = 1000;
const NUM_POSTS = 10000;
const SEED_PASSWORD = 'Password123';
const BCRYPT_ROUNDS = 12;

// Post dates must be strictly before June 10, 2026
const START_DATE = new Date('2026-01-01T00:00:00.000Z').getTime();
const END_DATE = new Date('2026-06-09T23:59:59.000Z').getTime();

const randomDate = () => {
  const time = START_DATE + Math.random() * (END_DATE - START_DATE);
  return new Date(time);
};

const clearCollection = async (model) => {
  try {
    await model.collection.drop();
    logger.info(`Dropped collection: ${model.collection.collectionName}`);
  } catch (err) {
    // Code 26 (NamespaceNotFound) means the collection does not exist yet; we can safely ignore it
    if (err.code === 26 || err.message.includes('ns not found')) {
      logger.info(`Collection ${model.collection.collectionName} does not exist — skipping drop.`);
    } else {
      logger.warn(`Failed to drop collection ${model.collection.collectionName}: ${err.message} — falling back to deleteMany`);
      await model.deleteMany({});
    }
  }
  // Ensure Mongoose re-creates indexes on the empty collection immediately
  await model.createIndexes();
};

const seed = async () => {
  try {
    logger.info('Starting database seeding...');
    await connectDB();

    // 1. Drop existing collections to maintain integrity and rebuild unique indexes instantly
    logger.info('Clearing existing collections using drop() to prevent connection timeout...');
    
    await clearCollection(RefreshToken);
    await clearCollection(Like);
    await clearCollection(Comment);
    await clearCollection(Post);
    await clearCollection(User);
    
    logger.info('Collections cleared successfully.');

    // 2. Generate password hash once to save significant CPU execution time
    logger.info('Generating password hash (this takes a moment)...');
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

    // 3. Generate and insert 1000 users
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

    logger.info('Inserting users into database...');
    const createdUsers = await User.insertMany(usersData);
    logger.info(`Successfully seeded ${createdUsers.length} users.`);

    // 4. Generate and insert 10,000 posts and their associated likes
    logger.info(`Generating ${NUM_POSTS} posts and associated likes before June 10, 2026...`);
    const postsData = [];
    const likesData = [];

    for (let i = 1; i <= NUM_POSTS; i++) {
      const randomUser = createdUsers[Math.floor(Math.random() * createdUsers.length)];
      const postDate = randomDate();
      const postId = new mongoose.Types.ObjectId();

      // Pick N random unique users to like this post
      const numLikesForPost = Math.floor(Math.random() * 20); // 0 to 19 likes
      const postLikers = new Set();
      while (postLikers.size < numLikesForPost) {
        const randUserIdx = Math.floor(Math.random() * createdUsers.length);
        postLikers.add(createdUsers[randUserIdx]._id.toString());
      }

      // Generate Like documents matching the likeCount
      postLikers.forEach((likerId) => {
        // Like date is the post date or slightly after (up to 1 day after, capped by END_DATE)
        const postTime = postDate.getTime();
        const likeTime = Math.min(postTime + Math.random() * 24 * 60 * 60 * 1000, END_DATE);
        likesData.push({
          userId: new mongoose.Types.ObjectId(likerId),
          targetId: postId,
          targetType: 'post',
          createdAt: new Date(likeTime),
        });
      });

      postsData.push({
        _id: postId,
        author: {
          _id: randomUser._id,
          firstName: randomUser.firstName,
          lastName: randomUser.lastName,
          avatarUrl: randomUser.avatar.url,
        },
        content: `This is seeded post number ${i}. It is a simulated post containing educational text, student discussions, and explore comments. #seeded${i}`,
        image: null,
        visibility: Math.random() > 0.1 ? 'public' : 'private', // 90% public, 10% private
        likeCount: postLikers.size,
        commentCount: 0,
        deletedAt: null,
        createdAt: postDate,
        updatedAt: postDate,
      });
    }

    logger.info('Inserting posts in batches...');
    const postBatchSize = 1000;
    for (let i = 0; i < postsData.length; i += postBatchSize) {
      const batch = postsData.slice(i, i + postBatchSize);
      await Post.insertMany(batch);
      logger.info(`Inserted posts ${i + 1} to ${Math.min(i + postBatchSize, postsData.length)}...`);
    }

    logger.info('Inserting likes in batches...');
    const likeBatchSize = 5000;
    for (let i = 0; i < likesData.length; i += likeBatchSize) {
      const batch = likesData.slice(i, i + likeBatchSize);
      await Like.insertMany(batch);
      logger.info(`Inserted likes ${i + 1} to ${Math.min(i + likeBatchSize, likesData.length)}...`);
    }

    logger.info('Database seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  }
};

seed();
