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

module.exports = { addCommentSchema, addReplySchema };
