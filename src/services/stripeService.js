const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const plans = require('../config/plans');

/**
 * Creates a Stripe Checkout Session for credit top-ups
 * @param {string} locale
 * @param {string} userId
 * @param {string} planKey (starter, grow, power)
 * @returns {Promise<Object>}
 */
const createCheckoutSession = async (locale = 'en', userId, planKey) => {
  const plan = plans[planKey.toLowerCase()];
  if (!plan) {
    throw new Error('Invalid plan selected');
  }

  return await stripe.checkout.sessions.create({
    client_reference_id: userId,
    metadata: {
      userId,
      plan_name: plan.name,
      credits: plan.credits,
    },
    line_items: [
      {
        price: plan.priceId,
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${process.env.FRONTEND_URL}/${locale}/profile?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:
      process.env.STRIPE_CANCEL_URL ||
      `${process.env.FRONTEND_URL}/${locale}/credits`,
  });
};

/**
 * Retrieves or creates a Stripe Customer
 * @param {string} userId
 * @param {string} email
 * @returns {Promise<string>} stripe_customer_id
 */
const getOrCreateCustomer = async (userId, email) => {
  const db = require('../config/database');
  const user = await db('users').where('id', userId).first();

  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: email,
    metadata: {
      userId: userId,
    },
  });

  await db('users').where('id', userId).update({
    stripe_customer_id: customer.id,
  });

  return customer.id;
};

module.exports = {
  stripe,
  createCheckoutSession,
  getOrCreateCustomer,
};
