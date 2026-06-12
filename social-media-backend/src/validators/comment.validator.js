const { z } = require('zod');

const addCommentSchema = z.object({
  content: z
    .string({ required_error: 'Comment content is required' })
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment cannot exceed 1000 characters'),
});

// Replies use the same shape
const addReplySchema = addCommentSchema;

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const postIdSchema = z
  .string({ required_error: 'postId is required' })
  .regex(objectIdRegex, 'Invalid postId format (must be a 24-character hex string)');

const commentIdSchema = z
  .string({ required_error: 'commentId is required' })
  .regex(objectIdRegex, 'Invalid commentId format (must be a 24-character hex string)');

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().min(1).max(100).optional()),
});

const getCommentsSchema = {
  params: z.object({
    postId: postIdSchema,
  }),
  query: querySchema,
};

const createCommentSchema = {
  params: z.object({
    postId: postIdSchema,
  }),
  body: addCommentSchema,
};

const getRepliesSchema = {
  params: z.object({
    commentId: commentIdSchema,
  }),
  query: querySchema,
};

const createReplySchema = {
  params: z.object({
    commentId: commentIdSchema,
  }),
  body: addReplySchema,
};

module.exports = {
  addCommentSchema,
  addReplySchema,
  getCommentsSchema,
  createCommentSchema,
  getRepliesSchema,
  createReplySchema,
};

