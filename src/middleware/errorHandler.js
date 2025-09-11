const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500,
    code: err.code || 'INTERNAL_ERROR'
  };

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Invalid token',
      status: 401,
      code: 'INVALID_TOKEN'
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expired',
      status: 401,
      code: 'TOKEN_EXPIRED'
    };
  }

  // Validation errors
  if (err.isJoi) {
    error = {
      message: 'Validation error',
      status: 400,
      code: 'VALIDATION_ERROR',
      details: err.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    };
  }

  // Database errors
  if (err.code === '23505') { // Unique violation
    error = {
      message: 'Resource already exists',
      status: 409,
      code: 'DUPLICATE_RESOURCE'
    };
  }

  if (err.code === '23503') { // Foreign key violation
    error = {
      message: 'Referenced resource not found',
      status: 400,
      code: 'REFERENCE_ERROR'
    };
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = {
      message: 'File too large',
      status: 413,
      code: 'FILE_TOO_LARGE'
    };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = {
      message: 'Unexpected file field',
      status: 400,
      code: 'INVALID_FILE_FIELD'
    };
  }

  // OpenAI API errors
  if (err.type === 'insufficient_quota') {
    error = {
      message: 'AI service quota exceeded',
      status: 503,
      code: 'AI_QUOTA_EXCEEDED'
    };
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && error.status === 500) {
    error.message = 'Internal Server Error';
    error.details = undefined;
  }

  res.status(error.status).json({
    error: error.message,
    code: error.code,
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { errorHandler };
