/**
 * Zod validation middleware factory.
 * Can be passed a direct Zod schema (validates req.body) or an object
 * containing 'body', 'params', and/or 'query' schemas.
 * On failure, forwards a ZodError to the global error handler.
 *
 * Usage: 
 *   router.post('/register', validate(registerSchema), controller.register)
 *   router.get('/:id', validate({ params: idParamSchema }), controller.get)
 */
const validate = (schemas) => (req, res, next) => {
  if (schemas && typeof schemas.safeParse === 'function') {
    const result = schemas.safeParse(req.body);
    if (!result.success) {
      return next(result.error); // ZodError — caught by error.middleware.js
    }
    req.body = result.data; // replace with coerced/trimmed data
    return next();
  }

  if (schemas.body) {
    const result = schemas.body.safeParse(req.body);
    if (!result.success) {
      return next(result.error);
    }
    req.body = result.data;
  }

  if (schemas.params) {
    const result = schemas.params.safeParse(req.params);
    if (!result.success) {
      return next(result.error);
    }
    req.params = result.data;
  }

  if (schemas.query) {
    const result = schemas.query.safeParse(req.query);
    if (!result.success) {
      return next(result.error);
    }
    req.query = result.data;
  }

  return next();
};

module.exports = validate;

