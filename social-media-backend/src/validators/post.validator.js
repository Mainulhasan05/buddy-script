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

module.exports = { createPostSchema };
