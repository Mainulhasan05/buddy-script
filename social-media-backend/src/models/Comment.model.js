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
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes
commentSchema.index({ postId: 1, parentId: 1, createdAt: 1 }); // fetch top-level comments or replies
commentSchema.index({ postId: 1, depth: 1, createdAt: 1 });    // filter by depth
commentSchema.index({ 'author._id': 1 });

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
