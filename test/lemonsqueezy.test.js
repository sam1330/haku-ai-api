process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/server');
const {
  cleanDatabase,
  createTestUser,
  generateToken,
  db,
  runMigrations,
} = require('./helpers');
const plans = require('../src/config/plans');

jest.mock('@lemonsqueezy/lemonsqueezy.js', () => {
  return jest.fn(() => ({
    lemonSqueezySetup: jest.fn(),
    webhooks: {
      constructEvent: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  }));
});

// Mock Stripe Service
jest.mock('../src/services/lemonSqueezyService', () => {
  const original = jest.requireActual('../src/services/lemonSqueezyService');
  return {
    ...original,
    lemonSqueezy: {
      webhooks: {
        constructEvent: jest.fn(),
      },
    },
    createCheckoutSession: jest.fn(),
  };
});

const {
  lemonSqueezy,
  createCheckoutSession,
} = require('../src/services/lemonSqueezyService');

describe('Lemon Squeezy Integration Tests', () => {
  let user;
  let token;

  beforeAll(async () => {
    await runMigrations();
    await cleanDatabase();
    user = await createTestUser();
    token = generateToken(user);
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('POST /api/credits/create-checkout-session', () => {
    test('should create a checkout session and a pending payment record', async () => {
      const mockSession = {
        id: 'cs_test_123',
        url: 'https://checkout.lemon-squeezy.com/test',
      };
      createCheckoutSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/api/credits/create-checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ plan_name: 'grow' })
        .expect(200);

      expect(response.body).toHaveProperty('url', mockSession.url);
      expect(createCheckoutSession).toHaveBeenCalledWith('en', user.id, 'grow');

      // Verify payment record in DB
      const payment = await db('payments')
        .where('lemon_squeezy_checkout_session_id', mockSession.id)
        .first();
      expect(payment).toBeDefined();
      expect(payment.status).toBe('pending');
      expect(payment.plan_name).toBe(plans.grow.name);
      expect(payment.credits_added).toBe(plans.grow.credits);
    });

    test('should return 400 for invalid plan name', async () => {
      await request(app)
        .post('/api/credits/create-checkout-session')
        .set('Authorization', `Bearer ${token}`)
        .send({ plan_name: 'invalid_plan' })
        .expect(400);
    });
  });

  describe('POST /api/credits/webhook', () => {
    const webhookSecret = 'whsec_test';
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    test('should process successful payment and grant credits', async () => {
      const sessionId = 'cs_test_456';
      const creditsToAdd = 250; // Grow plan

      // 1. Create a pending payment record
      await db('payments').insert({
        user_id: user.id,
        lemon_squeezy_checkout_session_id: sessionId,
        amount: 2000,
        currency: 'usd',
        status: 'pending',
        plan_name: 'Grow',
        credits_added: creditsToAdd,
      });

      const initialCredits = await db('users')
        .where('id', user.id)
        .select('credits')
        .first()
        .then((u) => u.credits);

      // 2. Mock webhook event
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: sessionId,
            customer: 'cus_test_123',
            payment_intent: 'pi_test_123',
            metadata: {
              userId: user.id,
              plan_name: 'Grow',
              credits: creditsToAdd,
            },
          },
        },
      };
      lemon_squeezy.webhooks.constructEvent.mockReturnValue(mockEvent);

      // 3. Send webhook request
      await request(app)
        .post('/api/credits/webhook')
        .set('lemon_squeezy-signature', 't=123,v1=test')
        .send(JSON.stringify(mockEvent))
        .expect(200);

      // 4. Verify results
      const updatedUser = await db('users').where('id', user.id).first();
      const payment = await db('payments')
        .where('lemon_squeezy_checkout_session_id', sessionId)
        .first();
      const transaction = await db('credit_transactions')
        .where('user_id', user.id)
        .orderBy('created_at', 'desc')
        .first();

      expect(updatedUser.credits).toBe(initialCredits + creditsToAdd);
      expect(payment.status).toBe('succeeded');
      expect(transaction.amount).toBe(creditsToAdd);
      expect(transaction.transaction_type).toBe('top-up');
    });

    test('should be idempotent and not grant credits twice', async () => {
      const sessionId = 'cs_test_idempotent';
      const creditsToAdd = 100;

      // Mock event
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: sessionId,
            customer: 'cus_test_789',
            payment_intent: 'pi_test_789',
            metadata: {
              userId: user.id,
              plan_name: 'Starter',
              credits: creditsToAdd,
            },
          },
        },
      };
      lemon_squeezy.webhooks.constructEvent.mockReturnValue(mockEvent);

      // Send first time
      await request(app)
        .post('/api/credits/webhook')
        .set('lemon_squeezy-signature', 't=123,v1=test')
        .send(JSON.stringify(mockEvent))
        .expect(200);

      const balanceAfterFirst = await db('users')
        .where('id', user.id)
        .select('credits')
        .first()
        .then((u) => u.credits);

      // Send second time
      await request(app)
        .post('/api/credits/webhook')
        .set('lemon_squeezy-signature', 't=123,v1=test')
        .send(JSON.stringify(mockEvent))
        .expect(200);

      const balanceAfterSecond = await db('users')
        .where('id', user.id)
        .select('credits')
        .first()
        .then((u) => u.credits);

      expect(balanceAfterSecond).toBe(balanceAfterFirst);
    });

    test('should return 400 for invalid signature', async () => {
      lemon_squeezy.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await request(app)
        .post('/api/credits/webhook')
        .set('lemon_squeezy-signature', 'invalid')
        .send({ some: 'data' })
        .expect(400);
    });
  });
});
