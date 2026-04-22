module.exports = {
  starter: {
    name: 'Starter',
    credits: 100,
    variantId: process.env.LEMON_SQUEEZY_STARTER_VARIANT_ID,
    amount: 1000, // $10.00 in cents
  },
  grow: {
    name: 'Grow',
    credits: 250,
    variantId: process.env.LEMON_SQUEEZY_GROW_VARIANT_ID,
    amount: 2000, // $20.00 in cents
    recommended: true,
  },
  power: {
    name: 'Power',
    credits: 600,
    variantId: process.env.LEMON_SQUEEZY_POWER_VARIANT_ID,
    amount: 5000, // $50.00 in cents
  },
};
