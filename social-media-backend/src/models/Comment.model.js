const mongoose = require('mongoose');

const { Schema } = mongoose;

// Denormalized author snapshot — same pattern as Post
const authorSnapshotSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    avatarUrl: { type: String, default: null },
  },
  { _id: false }
);

const commentSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    // null = top-level comment; ObjectId = reply to a comment
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    // 0 = top-level comment, 1 = reply — max depth enforced at API/validator level
    depth: {
      type: Number,
      enum: [0, 1],
      required: true,
      default: 0,
    },
    author: {
      type: authorSnapshotSchema,
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
      trim: true,
    },
    likeCount: { type: Number, default: 0, min: 0 },
    // Only meaningful on depth-0 comments; ignored on replies
    replyCount: { type: Number, default: 0, min: 0 },
    // Soft delete — null means active, Date means deleted (with timestamp for audit trail)
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// Top-level comments for a post: { postId, parentId: null, deletedAt: null } sorted by { createdAt, _id }
commentSchema.index({ postId: 1, parentId: 1, deletedAt: 1, createdAt: 1, _id: 1 });

// Replies for a comment: { parentId: commentId, deletedAt: null } sorted by { createdAt, _id }
// parentId as first field — prevents COLLSCAN on getReplies
commentSchema.index({ parentId: 1, deletedAt: 1, createdAt: 1, _id: 1 });

// User's comment history
commentSchema.index({ 'author._id': 1 });

// Partial index for soft-deleted comments (admin/cleanup queries)
commentSchema.index(
  { deletedAt: 1 },
  { partialFilterExpression: { deletedAt: { $ne: null } }, sparse: true }
);

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;

