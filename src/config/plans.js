module.exports = {
  starter: {
    name: 'Starter',
    credits: 100,
    priceId: process.env.STRIPE_STARTER_PRODUCT_ID,
    amount: 1000, // $10.00 in cents
  },
  grow: {
    name: 'Grow',
    credits: 250,
    priceId: process.env.STRIPE_GROW_PRODUCT_ID,
    amount: 2000, // $20.00 in cents
    recommended: true,
  },
  power: {
    name: 'Power',
    credits: 600,
    priceId: process.env.STRIPE_POWER_PRODUCT_ID,
    amount: 5000, // $50.00 in cents
  }
};
