const mongoose = require('mongoose');

const { Schema } = mongoose;

const likeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Can reference a Post._id or a Comment._id
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    // 'comment' covers both top-level comments and replies
    targetType: {
      type: String,
      enum: ['post', 'comment'],
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound unique index — prevents duplicate likes (idempotent toggles rely on this)
likeSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });

// Fetch all likers for a target (used by "Who Liked" feature)
likeSchema.index({ targetId: 1, targetType: 1, createdAt: -1 });

// User's full like history
likeSchema.index({ userId: 1, targetType: 1, createdAt: -1 });

const Like = mongoose.model('Like', likeSchema);

module.exports = Like;
