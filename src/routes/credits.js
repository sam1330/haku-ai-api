const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const creditService = require('../services/creditService');
const { TRANSACTION_TYPES } = require('../config/constants');

const router = express.Router();

/**
 * GET /credits/balance
 * Returns the current credit balance for the authenticated user
 */
router.get('/balance', authenticateToken, async (req, res, next) => {
  try {
    const credits = await creditService.getUserCredits(req.user.id);
    res.json({ credits });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /credits/transactions
 * Returns the transaction history for the authenticated user
 */
router.get('/transactions', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const transactions = await creditService.getTransactionHistory(req.user.id, parseInt(limit), offset);
    
    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /credits/top-up
 * Simulates a credit top-up (to be integrated with Stripe/Payment Gateway)
 */
router.post('/top-up', authenticateToken, async (req, res, next) => {
  try {
    const { amount, plan_name } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid top-up amount' });
    }

    // In a real app, verify payment here
    
    const transaction = await creditService.addCredits(
      req.user.id,
      amount,
      TRANSACTION_TYPES.TOP_UP,
      `Credit Top-up: ${plan_name || 'Standard Plan'}`,
      { metadata: { provider: 'mock_payment_gateway', status: 'success' } }
    );

    const newBalance = await creditService.getUserCredits(req.user.id);

    res.json({
      message: 'Credits topped up successfully',
      added: amount,
      new_balance: newBalance,
      transaction
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
