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
const {
  CREDIT_COSTS,
  TRANSACTION_TYPES,
  DEFAULT_WELCOME_CREDITS,
} = require('../src/config/constants');
const creditService = require('../src/services/creditService');

describe('Credits Integration Tests', () => {
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

  // ─────────────────────────────────────────────
  // GET /api/credits/balance
  // ─────────────────────────────────────────────
  describe('GET /api/credits/balance', () => {
    test('should return initial credit balance for new user', async () => {
      const response = await request(app)
        .get('/api/credits/balance')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('credits');
      expect(response.body.credits).toBe(DEFAULT_WELCOME_CREDITS);
    });

    test('should return 401 without authentication', async () => {
      await request(app).get('/api/credits/balance').expect(401);
    });
  });


  // ─────────────────────────────────────────────
  // GET /api/credits/transactions
  // ─────────────────────────────────────────────
  describe('GET /api/credits/transactions', () => {
    let txUser;
    let txToken;

    beforeAll(async () => {
      txUser = await createTestUser();
      txToken = generateToken(txUser);
      // Seed some transactions
      await creditService.addCredits(
        txUser.id,
        100,
        TRANSACTION_TYPES.TOP_UP,
        'Initial top-up',
      );
      await creditService.addCredits(
        txUser.id,
        200,
        TRANSACTION_TYPES.BONUS,
        'Referral bonus',
      );
      await creditService.deductCredits(
        txUser.id,
        CREDIT_COSTS.HEADLINE_OPTIMIZATION,
        'Headline Optimization',
      );
    });

    test('should return a list of transactions for the user', async () => {
      const response = await request(app)
        .get('/api/credits/transactions')
        .set('Authorization', `Bearer ${txToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('transactions');
      expect(response.body.transactions).toHaveLength(3);
    });

    test('should return transactions in descending order (most recent first)', async () => {
      const response = await request(app)
        .get('/api/credits/transactions')
        .set('Authorization', `Bearer ${txToken}`)
        .expect(200);

      const { transactions } = response.body;
      expect(transactions[0].transaction_type).toBe(TRANSACTION_TYPES.USAGE);
      expect(transactions[1].transaction_type).toBe(TRANSACTION_TYPES.BONUS);
      expect(transactions[2].transaction_type).toBe(TRANSACTION_TYPES.TOP_UP);
    });

    test('should support pagination via limit param', async () => {
      const response = await request(app)
        .get('/api/credits/transactions?limit=2&page=1')
        .set('Authorization', `Bearer ${txToken}`)
        .expect(200);

      expect(response.body.transactions).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
    });

    test('should return second page correctly', async () => {
      const response = await request(app)
        .get('/api/credits/transactions?limit=2&page=2')
        .set('Authorization', `Bearer ${txToken}`)
        .expect(200);

      expect(response.body.transactions).toHaveLength(1);
    });

    test('should not show transactions from other users', async () => {
      // txUser has 3 transactions; main user has their own — ensure they are isolated
      const response = await request(app)
        .get('/api/credits/transactions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const txIds = response.body.transactions.map((t) => t.user_id);
      txIds.forEach((id) => expect(id).toBe(user.id));
    });

    test('should return 401 without authentication', async () => {
      await request(app).get('/api/credits/transactions').expect(401);
    });
  });

  // ─────────────────────────────────────────────
  // CreditService — Unit-style integration tests
  // ─────────────────────────────────────────────
  describe('CreditService', () => {
    let svcUser;

    beforeEach(async () => {
      svcUser = await createTestUser();
    });

    describe('deductCredits', () => {
      test('should deduct the correct amount and log a usage transaction', async () => {
        const before = await creditService.getUserCredits(svcUser.id);
        const tx = await creditService.deductCredits(
          svcUser.id,
          10,
          'Test deduction',
        );

        const after = await creditService.getUserCredits(svcUser.id);
        expect(after).toBe(before - 10);
        expect(tx.transaction_type).toBe(TRANSACTION_TYPES.USAGE);
        expect(tx.amount).toBe(-10);
      });

      test('should throw an error when user has insufficient credits', async () => {
        // Drain all credits first
        await db('users').where('id', svcUser.id).update({ credits: 5 });

        await expect(
          creditService.deductCredits(svcUser.id, 10, 'Over-budget deduction'),
        ).rejects.toThrow('Insufficient credits');
      });

      test('should not change balance if deduction fails (atomicity)', async () => {
        await db('users').where('id', svcUser.id).update({ credits: 0 });
        const before = await creditService.getUserCredits(svcUser.id);

        try {
          await creditService.deductCredits(
            svcUser.id,
            50,
            'Failing deduction',
          );
        } catch {
          // expected
        }

        const after = await creditService.getUserCredits(svcUser.id);
        expect(after).toBe(before); // no change
      });
    });

    describe('refundCredits', () => {
      test('should refund a usage transaction and restore balance', async () => {
        const tx = await creditService.deductCredits(
          svcUser.id,
          CREDIT_COSTS.RESUME_ANALYSIS,
          'Resume Analysis',
        );
        const balanceAfterDeduction = await creditService.getUserCredits(
          svcUser.id,
        );

        const refundTx = await creditService.refundCredits(
          svcUser.id,
          tx.id,
          'AI parse failure',
        );

        const finalBalance = await creditService.getUserCredits(svcUser.id);
        expect(finalBalance).toBe(
          balanceAfterDeduction + CREDIT_COSTS.RESUME_ANALYSIS,
        );
        expect(refundTx.transaction_type).toBe(TRANSACTION_TYPES.REFUND);
        expect(refundTx.amount).toBe(CREDIT_COSTS.RESUME_ANALYSIS);
      });

      test('should mark the original transaction as refunded', async () => {
        const tx = await creditService.deductCredits(
          svcUser.id,
          5,
          'Cover Letter',
        );
        await creditService.refundCredits(svcUser.id, tx.id, 'Timeout error');

        const originalTx = await db('credit_transactions')
          .where('id', tx.id)
          .first();
        const metadata = originalTx.metadata;

        expect(metadata.refunded).toBe(true);
        expect(metadata.refund_reason).toBe('Timeout error');
      });

      test('should throw if the same transaction is refunded twice', async () => {
        const tx = await creditService.deductCredits(
          svcUser.id,
          5,
          'Cover Letter',
        );
        await creditService.refundCredits(svcUser.id, tx.id, 'First refund');

        await expect(
          creditService.refundCredits(svcUser.id, tx.id, 'Second refund'),
        ).rejects.toThrow('Transaction already refunded');
      });

      test('should throw when original transaction does not exist', async () => {
        await expect(
          creditService.refundCredits(
            svcUser.id,
            '00000000-0000-0000-0000-000000000000',
            'Bad id',
          ),
        ).rejects.toThrow('Original transaction not found');
      });
    });

    describe('addCredits', () => {
      test('should add credits and return a transaction record with expiry', async () => {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        const before = await creditService.getUserCredits(svcUser.id);

        const tx = await creditService.addCredits(
          svcUser.id,
          200,
          TRANSACTION_TYPES.TOP_UP,
          'Monthly subscription refill',
          { expiresAt },
        );

        const after = await creditService.getUserCredits(svcUser.id);
        expect(after).toBe(before + 200);
        expect(tx.transaction_type).toBe(TRANSACTION_TYPES.TOP_UP);
        expect(tx.expires_at).not.toBeNull();
      });

      test('should add credits without expiry for purchased credits', async () => {
        const tx = await creditService.addCredits(
          svcUser.id,
          100,
          TRANSACTION_TYPES.TOP_UP,
          'One-time purchase',
          // no expiresAt
        );

        expect(tx.expires_at).toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────
  // checkCredits Middleware (via resume routes)
  // ─────────────────────────────────────────────
  describe('checkCredits Middleware', () => {
    let brokeUser;
    let brokeToken;

    beforeAll(async () => {
      brokeUser = await createTestUser();
      brokeToken = generateToken(brokeUser);
      // Drain all credits
      await db('users').where('id', brokeUser.id).update({ credits: 0 });
    });

    test('should block resume analysis with 402 when user has 0 credits', async () => {
      // Insert a resume to reference
      const [resume] = await db('resumes')
        .insert({
          user_id: brokeUser.id,
          original_filename: 'no-credits.pdf',
          file_path: 'uploads/no-credits.pdf',
          file_type: 'pdf',
          file_size: 512,
          extracted_text: 'Sample text for testing',
          is_processed: true,
        })
        .returning('id');

      const response = await request(app)
        .post(`/api/resumes/${resume.id}/analyze`)
        .set('Authorization', `Bearer ${brokeToken}`)
        .send({
          job_description:
            'A sufficiently long job description to pass validation requirements for this test.',
        })
        .expect(402);

      expect(response.body.error).toBe('Insufficient credits');
      expect(response.body).toHaveProperty(
        'required',
        CREDIT_COSTS.RESUME_ANALYSIS,
      );
    });

    test('should block cover letter generation with 402 when user has 0 credits', async () => {
      // Create a job application for broke user
      const [jobApp] = await db('job_applications')
        .insert({
          user_id: brokeUser.id,
          company_name: 'Test Corp',
          position_title: 'Engineer',
          job_description:
            'Great role doing great things at a great company with great people.',
          status: 'draft',
        })
        .returning('id');

      // Insert a resume
      await db('resumes').insert({
        user_id: brokeUser.id,
        original_filename: 'cover-no-credits.pdf',
        file_path: 'uploads/cover-no-credits.pdf',
        file_type: 'pdf',
        file_size: 512,
        extracted_text: 'Resume text for cover letter',
        is_processed: true,
      });

      const response = await request(app)
        .post(`/api/job-applications/${jobApp.id}/cover-letter`)
        .set('Authorization', `Bearer ${brokeToken}`)
        .send({ tone: 'professional', length: 'medium' })
        .expect(402);

      expect(response.body.error).toBe('Insufficient credits');
      expect(response.body).toHaveProperty(
        'required',
        CREDIT_COSTS.COVER_LETTER_GENERATION,
      );
    });
  });
});
