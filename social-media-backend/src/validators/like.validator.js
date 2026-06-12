const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const targetIdSchema = z
  .string({ required_error: 'targetId is required' })
  .regex(objectIdRegex, 'Invalid targetId format (must be a 24-character hex string)');

const targetTypeSchema = z.enum(['post', 'comment'], {
  errorMap: () => ({ message: 'targetType must be post or comment' }),
});

const toggleSchema = z.object({
  targetId: targetIdSchema,
  targetType: targetTypeSchema,
});

const getLikersSchema = {
  params: z.object({
    targetId: targetIdSchema,
    targetType: targetTypeSchema,
  }),
  query: z.object({
    cursor: z.string().optional(),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined))
      .pipe(z.number().min(1).max(100).optional()),
  }),
};

module.exports = {
  toggleSchema,
  getLikersSchema,
};
