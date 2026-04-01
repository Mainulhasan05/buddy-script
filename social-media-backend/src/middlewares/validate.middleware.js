/**
 * Zod validation middleware factory.
 * Validates req.body against the given Zod schema.
 * On failure, forwards a ZodError to the global error handler.
 *
 * Usage: router.post('/register', validate(registerSchema), controller.register)
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(result.error); // ZodError — caught by error.middleware.js
  }
  req.body = result.data; // replace with coerced/trimmed data
  return next();
};

module.exports = validate;
