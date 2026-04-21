require('dotenv').config();
const db = require('../src/config/database');
const creditService = require('../src/services/creditService');

async function testWebhook() {
  console.log('🚀 Starting Stripe Webhook Simulation Test...');

  try {
    // 1. Get a test user
    const user = await db('users').first();
    if (!user) {
      console.error('❌ No users found in database. Please create a user first.');
      process.exit(1);
    }
    console.log(`👤 Using user: ${user.email} (ID: ${user.id})`);
    console.log(`💰 Initial balance: ${user.credits}`);

    const sessionId = `test_session_${Date.now()}`;
    const planName = 'Grow';
    const creditsToAdd = 250;

    // 2. Create a pending payment record (simulating what /create-checkout-session does)
    console.log('📝 Creating pending payment record...');
    await db('payments').insert({
      user_id: user.id,
      stripe_checkout_session_id: sessionId,
      amount: 2000,
      currency: 'usd',
      status: 'pending',
      plan_name: planName,
      credits_added: creditsToAdd,
      metadata: JSON.stringify({ locale: 'en' })
    });

    // 3. Simulate the webhook logic (calling creditService and DB updates directly)
    // In a real test, we might call the endpoint, but signature verification makes it hard without Stripe-Mock
    console.log('🔄 Simulating webhook processing...');

    await db.transaction(async (trx) => {
      const payment = await trx('payments')
        .where('stripe_checkout_session_id', sessionId)
        .first();

      if (!payment || payment.status === 'succeeded') {
        throw new Error('Payment already processed or not found');
      }

      await trx('payments')
        .where('stripe_checkout_session_id', sessionId)
        .update({
          status: 'succeeded',
          metadata: JSON.stringify({
            stripe_customer_id: 'cus_test123',
            payment_intent_id: 'pi_test123'
          })
        });

      await creditService.addCredits(
        user.id,
        creditsToAdd,
        'top-up',
        `Stripe Top-up: ${planName}`,
        {
          metadata: {
            stripe_session_id: sessionId,
            payment_intent_id: 'pi_test123'
          }
        }
      );

      await trx('users')
        .where('id', user.id)
        .update({ stripe_customer_id: 'cus_test123' });
    });

    // 4. Verify results
    const updatedUser = await db('users').where('id', user.id).first();
    const updatedPayment = await db('payments').where('stripe_checkout_session_id', sessionId).first();

    console.log(`💰 New balance: ${updatedUser.credits}`);
    console.log(`📄 Payment status: ${updatedPayment.status}`);
    console.log(`🆔 Stripe Customer ID: ${updatedUser.stripe_customer_id}`);

    if (updatedUser.credits === user.credits + creditsToAdd && updatedPayment.status === 'succeeded') {
      console.log('✅ TEST PASSED: Credits added and payment status updated successfully!');
    } else {
      console.error('❌ TEST FAILED: Results do not match expectations.');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    await db.destroy();
  }
}

testWebhook();
