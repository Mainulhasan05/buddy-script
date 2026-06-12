const { z } = require('zod');

const createPostSchema = z.object({
  content: z
    .string({ required_error: 'Post content is required' })
    .trim()
    .min(1, 'Post content cannot be empty')
    .max(2000, 'Post content cannot exceed 2000 characters'),
  visibility: z
    .enum(['public', 'private'], { errorMap: () => ({ message: 'Visibility must be public or private' }) })
    .default('public'),
});

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const postIdSchema = z
  .string({ required_error: 'postId is required' })
  .regex(objectIdRegex, 'Invalid postId format (must be a 24-character hex string)');

const getPostSchema = {
  params: z.object({
    postId: postIdSchema,
  }),
};

const deletePostSchema = {
  params: z.object({
    postId: postIdSchema,
  }),
};

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().min(1).max(100).optional()),
});

const getFeedSchema = {
  query: querySchema,
};

const getMyPostsSchema = {
  query: querySchema,
};

module.exports = {
  createPostSchema,
  getPostSchema,
  deletePostSchema,
  getFeedSchema,
  getMyPostsSchema,
};

