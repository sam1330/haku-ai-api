const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'MISSING_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists
    const user = await db('users').where('id', decoded.userId).first();
    if (!user) {
      return res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({ 
        error: 'Account deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      subscription_type: user.subscription_type,
      subscription_expires_at: user.subscription_expires_at
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    return res.status(403).json({ 
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }
};

const requireSubscription = (subscriptionType = 'pro') => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Check if user has active subscription
    if (user.subscription_type !== subscriptionType) {
      const isSubscriptionExpired = user.subscription_expires_at &&
        new Date(user.subscription_expires_at) < new Date();

      if (isSubscriptionExpired || user.subscription_type === 'free') {
        return res.status(403).json({
          error: `${subscriptionType} subscription required`,
          code: 'SUBSCRIPTION_REQUIRED',
          required_subscription: subscriptionType,
          current_subscription: user.subscription_type
        });
      }
    }

    next();
  };
};

// Middleware to require email verification
const requireVerified = async (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // Check if user has verified their email
  const dbUser = await db('users').select('email_verified_at').where('id', user.id).first();

  if (!dbUser || !dbUser.email_verified_at) {
    return res.status(403).json({
      error: 'Please verify your email to access this resource',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
};

module.exports = {
  authenticateToken,
  requireSubscription,
  requireVerified
};
