const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
} = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { default: EmailService } = require('../services/emailService');
const { getRecentActivity } = require('../utils');
const { TRANSACTION_TYPES } = require('../config/constants');

const router = express.Router();

// Generate verification token
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Register
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    const locale = req.headers['x-locale'] || 'en';

    // Check if user already exists
    const existingUser = await db('users').where('email', email).first();
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists with this email',
        code: 'USER_EXISTS',
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const [user] = await db('users')
      .insert({
        email,
        password_hash: passwordHash,
        first_name,
        last_name,
        subscription_type: 'candidate',
        email_verification_token: verificationToken,
        email_verification_token_expires_at: verificationTokenExpiry,
      })
      .returning([
        'id',
        'email',
        'first_name',
        'last_name',
        'subscription_type',
        'created_at',
      ]);

    const emailService = new EmailService();

    // Send verification email
    const emailResult = await emailService.sendVerificationEmail(
      email,
      first_name,
      verificationToken,
      locale,
    );

    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
      // Still register the user even if email fails
    }

    res.status(201).json({
      message:
        'User registered successfully. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        subscription_type: user.subscription_type,
        email_verified: false,
      },
      token: null, // No token until email is verified
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await db('users').where('email', email).first();
    if (!user) {
      return res.status(403).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        error: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Check if email is verified
    if (!user.email_verified_at) {
      return res.status(403).json({
        error: 'Please verify your email before logging in',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(403).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Update last login
    await db('users')
      .where('id', user.id)
      .update({ last_login_at: new Date() });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        subscription_type: user.subscription_type,
        subscription_expires_at: user.subscription_expires_at,
        email_verified: true,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res, next) => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  try {
    const user = await db('users')
      .select(
        'id',
        'email',
        'first_name',
        'last_name',
        'subscription_type',
        'subscription_expires_at',
        'created_at',
        'last_login_at',
      )
      .where('id', req.user.id)
      .first();

    const transactions = await db('credit_transactions')
      .select('id', 'amount', 'created_at', 'description', 'transaction_type')
      .where('user_id', req.user.id)
      .orderBy('created_at', 'desc');

    const latestTransactions = transactions.slice(0, 5);

    const totalCredits = transactions
      .filter((credit) => credit.transaction_type === TRANSACTION_TYPES.TOP_UP)
      .reduce((total, transaction) => {
        return total + transaction.amount;
      }, 0);

    const creditsUsedLastMonth = transactions
      .filter((credit) => {
        const createdAt = new Date(credit.created_at);
        return createdAt >= startOfMonth;
      })
      .reduce((total, transaction) => {
        return total + transaction.amount;
      }, 0);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    res.json({
      user: {
        ...user,
        recent_transactions: latestTransactions,
        total_spent: totalCredits,
        credits_used_last_month: creditsUsedLastMonth,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res, next) => {
  try {
    const { first_name, last_name } = req.body;
    const updates = {};

    if (first_name) updates.first_name = first_name;
    if (last_name) updates.last_name = last_name;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        code: 'NO_UPDATES',
      });
    }

    const [updatedUser] = await db('users')
      .where('id', req.user.id)
      .update(updates)
      .returning([
        'id',
        'email',
        'first_name',
        'last_name',
        'subscription_type',
        'updated_at',
      ]);

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        error: 'Current password and new password are required',
        code: 'MISSING_PASSWORDS',
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters long',
        code: 'PASSWORD_TOO_SHORT',
      });
    }

    // Get current user
    const user = await db('users').where('id', req.user.id).first();
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      current_password,
      user.password_hash,
    );
    if (!isValidPassword) {
      return res.status(403).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await db('users')
      .where('id', req.user.id)
      .update({ password_hash: newPasswordHash });

    res.json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Send forgot password email
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const locale = req.headers['x-locale'] || 'en';

      if (!email) {
        return res.status(400).json({
          error: 'Email is required',
          code: 'MISSING_EMAIL',
        });
      }

      const user = await db('users')
        .select('id', 'first_name')
        .where('email', email)
        .first();

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      // Generate verification token
      const verificationToken = generateVerificationToken();
      const verificationTokenExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hours

      // Update user
      await db('users').where('id', user.id).update({
        email_verification_token: verificationToken,
        email_verification_token_expires_at: verificationTokenExpiry,
      });

      // Send Email
      const emailService = new EmailService();
      const emailResponse = await emailService.sendPasswordResetEmail(
        email,
        user.first_name,
        verificationToken,
        locale,
      );

      if (email.error) {
        return res.status(500).json({
          error: 'Error sending email',
          code: 'EMAIL_ERROR',
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Email sent successfully',
      });
    } catch (error) {
      next(error);
    }
  },
);

// Logout (client-side token removal, but we can track it)
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    // In a more sophisticated setup, you might want to blacklist the token
    // For now, we'll just return success
    res.json({
      message: 'Logout successful',
    });
  } catch (error) {
    next(error);
  }
});

// Verify email
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Verification token is required',
        code: 'MISSING_TOKEN',
      });
    }

    // Find user with this verification token
    const user = await db('users')
      .where('email_verification_token', token)
      .first();

    if (!user) {
      return res.status(400).json({
        error: 'Invalid verification token',
        code: 'INVALID_TOKEN',
      });
    }

    // Check if token has expired
    if (
      user.email_verification_token_expires_at &&
      new Date(user.email_verification_token_expires_at) < new Date()
    ) {
      return res.status(400).json({
        error: 'Verification token has expired. Please request a new one.',
        code: 'TOKEN_EXPIRED',
      });
    }

    // Check if already verified
    if (user.email_verified_at) {
      return res.status(400).json({
        error: 'Email is already verified',
        code: 'ALREADY_VERIFIED',
      });
    }

    // Mark email as verified
    await db('users').where('id', user.id).update({
      email_verified_at: new Date(),
      email_verification_token: null,
      email_verification_token_expires_at: null,
    });

    // Generate JWT token now that email is verified
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    );

    res.json({
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        subscription_type: user.subscription_type,
        email_verified: true,
      },
      token: jwtToken,
    });
  } catch (error) {
    next(error);
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res, next) => {
  try {
    const { email } = req.body;
    const locale = req.headers['x-locale'] || 'en';

    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
        code: 'MISSING_EMAIL',
      });
    }

    // Find user
    const user = await db('users').where('email', email).first();
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    // Check if already verified
    if (user.email_verified_at) {
      return res.status(400).json({
        error: 'Email is already verified',
        code: 'ALREADY_VERIFIED',
      });
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken();
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db('users').where('id', user.id).update({
      email_verification_token: verificationToken,
      email_verification_token_expires_at: verificationTokenExpiry,
    });

    const emailService = new EmailService();

    // Send verification email
    const emailResult = await emailService.sendVerificationEmail(
      user.email,
      user.first_name,
      verificationToken,
      locale,
    );

    if (!emailResult.success) {
      return res.status(500).json({
        error: 'Failed to send verification email',
        code: 'EMAIL_SEND_FAILED',
        details: emailResult.error,
      });
    }

    res.json({
      message: 'Verification email sent successfully',
      email: user.email,
    });
  } catch (error) {
    next(error);
  }
});

// Check verification status
router.get('/verify-email/status', async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
        code: 'MISSING_EMAIL',
      });
    }

    const user = await db('users')
      .select('id', 'email', 'email_verified_at', 'first_name', 'last_name')
      .where('email', email)
      .first();

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    res.json({
      email: user.email,
      email_verified: !!user.email_verified_at,
      first_name: user.first_name,
      last_name: user.last_name,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
