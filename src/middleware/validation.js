function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: false,
    });

    if (error) {
      const validationError = new Error('Validation failed');
      validationError.statusCode = 400;
      validationError.details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return next(validationError);
    }

    req[source] = value;
    return next();
  };
}

module.exports = validate;
