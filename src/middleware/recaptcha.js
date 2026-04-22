/**
 * Middleware to validate Google reCAPTCHA v3 tokens
 */
const validateRecaptcha = async (req, res, next) => {
  // Skip reCAPTCHA check in test environment if needed
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const { recaptcha_token } = req.body;

  if (!recaptcha_token) {
    return res.status(400).json({
      error: 'reCAPTCHA token is required',
      code: 'RECAPTCHA_TOKEN_MISSING',
    });
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const minScore = parseFloat(process.env.RECAPTCHA_MIN_SCORE) || 0.5;

  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY is not defined in environment variables');
    // In development, we might want to skip this if not configured, 
    // but in production it's a critical error.
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({
        error: 'Service configuration error',
        code: 'CONFIG_ERROR',
      });
    }
    return next();
  }

  try {
    const response = await fetch(
      'https://www.google.com/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `secret=${secretKey}&response=${recaptcha_token}`,
      },
    );

    const data = await response.json();

    if (!data.success) {
      console.warn('reCAPTCHA verification failed:', data['error-codes']);
      return res.status(403).json({
        error: 'reCAPTCHA verification failed',
        code: 'RECAPTCHA_FAILED',
        details: data['error-codes'],
      });
    }

    if (data.score < minScore) {
      console.warn(`reCAPTCHA score too low: ${data.score} (min: ${minScore})`);
      return res.status(403).json({
        error: 'Suspicious activity detected',
        code: 'RECAPTCHA_LOW_SCORE',
        score: data.score,
      });
    }

    // Optionally store reCAPTCHA data in request for further use
    req.recaptcha = data;
    next();
  } catch (error) {
    console.error('Error during reCAPTCHA verification:', error);
    res.status(500).json({
      error: 'Failed to verify reCAPTCHA',
      code: 'RECAPTCHA_VERIFY_ERROR',
    });
  }
};

module.exports = {
  validateRecaptcha,
};
