const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const creditService = require('../services/creditService');
const { TRANSACTION_TYPES } = require('../config/constants');
const { stripe, createCheckoutSession } = require('../services/stripeService');
const plans = require('../config/plans');
const db = require('../config/database');

const router = express.Router();

/**
 * GET /credits/balance
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
 */
router.get('/transactions', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const transactions = await creditService.getTransactionHistory(
      req.user.id,
      parseInt(limit),
      offset,
    );

    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /credits/create-checkout-session
 */
router.post(
  '/create-checkout-session',
  authenticateToken,
  async (req, res, next) => {
    try {
      const locale = req.headers['x-locale'] || 'en';
      const { plan_name } = req.body;
      const { user } = req;

      const plan = plans[plan_name.toLowerCase()];
      if (!plan) {
        return res.status(400).json({ error: 'Invalid plan selected' });
      }

      const session = await createCheckoutSession(locale, user.id, plan_name);

      // Record the pending payment
      await db('payments').insert({
        user_id: user.id,
        stripe_checkout_session_id: session.id,
        amount: plan.amount,
        currency: 'usd',
        status: 'pending',
        plan_name: plan.name,
        credits_added: plan.credits,
        metadata: JSON.stringify({ locale }),
      });

      res.json({ url: session.url });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /credits/webhook
 * Handles Stripe webhooks
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error(`Webhook Signature Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const { userId, plan_name, credits } = session.metadata;

        // Atomic update: Mark payment as succeeded and add credits
        await db.transaction(async (trx) => {
          const payment = await trx('payments')
            .where('stripe_checkout_session_id', session.id)
            .forUpdate()
            .first();

          if (payment && payment.status === 'succeeded') {
            console.log(
              `Payment ${session.id} already processed (status check)`,
            );
            return;
          }

          // Double-check credit_transactions to be absolutely sure
          const existingTx = await trx('credit_transactions')
            .whereRaw("metadata->>'stripe_session_id' = ?", [session.id])
            .first();

          if (existingTx) {
            console.log(
              `Credits already granted for session ${session.id} (tx check)`,
            );
            return;
          }

          // Update payment status
          await trx('payments')
            .where('stripe_checkout_session_id', session.id)
            .update({
              status: 'succeeded',
              metadata: JSON.stringify({
                ...payment?.metadata,
                stripe_customer_id: session.customer,
                payment_intent_id: session.payment_intent,
              }),
            });

          // Add credits
          await creditService.addCredits(
            userId,
            parseInt(credits),
            TRANSACTION_TYPES.TOP_UP,
            `Stripe Top-up: ${plan_name}`,
            {
              metadata: {
                stripe_session_id: session.id,
                payment_intent_id: session.payment_intent,
              },
            },
          );

          // Update user's stripe customer id if needed
          await trx('users')
            .where('id', userId)
            .update({ stripe_customer_id: session.customer });
        });

        console.log(
          `Successfully processed payment for user ${userId}, plan ${plan_name}`,
        );
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },
);

module.exports = router;
