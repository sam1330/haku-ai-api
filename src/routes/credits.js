const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const creditService = require('../services/creditService');
const { TRANSACTION_TYPES } = require('../config/constants');
const { createCheckoutSession } = require('../services/lemonSqueezyService');
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
        lemonsqueezy_checkout_id: session.id,
        amount: plan.amount,
        currency: 'usd',
        status: 'pending',
        plan_name: plan.name,
        credits_added: plan.credits,
        metadata: JSON.stringify({ locale }),
      });

      res.json({ url: session.attributes.url });
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
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    const signature = req.headers['x-signature'];

    if (!signature) {
      return res.status(401).send('Missing signature');
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(req.body).digest('hex'), 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');

    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(digest, signatureBuffer);
    } catch (e) {
      // Ignore error
    }

    if (!isValid) {
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(req.body.toString());
    const eventName = event.meta.event_name;

    try {
      if (eventName === 'order_created') {
        const order = event.data.attributes;
        const customData = event.meta.custom_data;

        if (!customData || !customData.userId) {
          console.log('No custom data found in webhook, ignoring.');
          return res.json({ received: true });
        }

        const { userId, plan_name, credits } = customData;
        const orderId = event.data.id;
        const customerId = order.customer_id;

        await db.transaction(async (trx) => {
          // Ensure we haven't processed this order yet
          const existingTx = await trx('credit_transactions')
            .whereRaw("metadata->>'lemonsqueezy_order_id' = ?", [orderId])
            .first();

          if (existingTx) {
            console.log(`Order ${orderId} already processed.`);
            return;
          }

          // Mark pending payment as succeeded or insert a new one
          const pendingPayment = await trx('payments')
            .where({ user_id: userId, status: 'pending', plan_name })
            .first();

          if (pendingPayment) {
            await trx('payments')
              .where('id', pendingPayment.id)
              .update({
                status: 'succeeded',
                lemonsqueezy_checkout_id: orderId, // store order id
                metadata: JSON.stringify({
                  ...pendingPayment.metadata,
                  lemonsqueezy_customer_id: customerId,
                  order_id: orderId,
                }),
              });
          } else {
            await trx('payments').insert({
              user_id: userId,
              lemonsqueezy_checkout_id: orderId,
              amount: order.total,
              currency: order.currency,
              status: 'succeeded',
              plan_name: plan_name,
              credits_added: parseInt(credits),
              metadata: JSON.stringify({
                lemonsqueezy_customer_id: customerId,
                order_id: orderId,
              }),
            });
          }

          // Add credits
          await creditService.addCredits(
            userId,
            parseInt(credits),
            TRANSACTION_TYPES.TOP_UP,
            `Lemon Squeezy Top-up: ${plan_name}`,
            {
              metadata: {
                lemonsqueezy_order_id: orderId,
              },
            },
          );

          // Update user's customer id
          await trx('users')
            .where('id', userId)
            .update({ lemonsqueezy_customer_id: customerId.toString() });
        });

        console.log(
          `Successfully processed Lemon Squeezy order for user ${userId}, plan ${plan_name}`,
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
