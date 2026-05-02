module.exports = {
  starter: {
    name: 'Starter',
    credits: 100,
    variantId: process.env.LEMON_SQUEEZY_STARTER_VARIANT_ID,
    amount: 1000, // $10.00 in cents
  },
  professional: {
    name: 'Professional',
    credits: 250,
    variantId: process.env.LEMON_SQUEEZY_PROFESSIONAL_VARIANT_ID,
    amount: 2000, // $20.00 in cents
    recommended: true,
  },
  business: {
    name: 'Business',
    credits: 600,
    variantId: process.env.LEMON_SQUEEZY_BUSINESS_VARIANT_ID,
    amount: 5000, // $50.00 in cents
  },
};
