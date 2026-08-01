const {
  lemonSqueezySetup,
  createCheckout,
} = require('@lemonsqueezy/lemonsqueezy.js');
const plans = require('../config/plans');

// Initialize the Lemon Squeezy SDK
lemonSqueezySetup({
  apiKey: process.env.LEMON_SQUEEZY_API_KEY,
  onError: (error) => console.error('Lemon Squeezy Setup Error:', error),
});

/**
 * Creates a Lemon Squeezy Checkout Session for credit top-ups
 */
const createCheckoutSession = async (
  locale = 'en',
  userId: string,
  planKey: string,
) => {
  const plan = plans[planKey.toLowerCase()];
  if (!plan) {
    throw new Error('Invalid plan selected');
  }

  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = plan.variantId;

  if (!storeId || !variantId) {
    throw new Error('Store ID or Variant ID is missing in configuration');
  }

  const { data, error } = await createCheckout(storeId, variantId, {
    checkoutData: {
      custom: {
        user_id: userId,
        plan_name: plan.name,
        credits: plan.credits.toString(),
        locale: locale,
      },
    },
    productOptions: {
      redirectUrl: `${process.env.FRONTEND_URL}/${locale}/profile?order_id={order_id}`,
    },
  });

  if (error) {
    console.error('Error creating Lemon Squeezy checkout:', error);
    throw new Error('Failed to create checkout session');
  }

  // data.data is the actual checkout object
  return data.data;
};

module.exports = {
  createCheckoutSession,
};
