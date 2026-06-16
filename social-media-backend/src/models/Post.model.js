const mongoose = require('mongoose');

const { Schema } = mongoose;

// Denormalized author snapshot — avoids $lookup on every feed read
const authorSnapshotSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    avatarUrl: { type: String, default: null },
  },
  { _id: false }
);

const postSchema = new Schema(
  {
    author: {
      type: authorSnapshotSchema,
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Post content is required'],
      maxlength: [2000, 'Post content cannot exceed 2000 characters'],
      trim: true,
    },
    image: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    // Denormalized counters — async-updated by RabbitMQ workers
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    // Soft delete — null means active, Date means deleted (with timestamp for audit trail)
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// Feed query: { deletedAt: null, visibility: 'public' } sorted by { createdAt: -1, _id: -1 }
postSchema.index({ deletedAt: 1, visibility: 1, createdAt: -1, _id: -1 });

// User's own posts: { 'author._id': userId, deletedAt: null } sorted by { createdAt: -1 }
postSchema.index({ 'author._id': 1, deletedAt: 1, createdAt: -1, _id: -1 });

// Partial index for soft-deleted documents — only indexes deleted posts (small, for admin queries)
postSchema.index(
  { deletedAt: 1 },
  { partialFilterExpression: { deletedAt: { $type: 'date' } } }
);

const Post = mongoose.model('Post', postSchema);

module.exports = Post;

