const jwt = require('jsonwebtoken');
const db = require('../src/config/database');

/**
 * Clean up database tables before/after tests
 */
const cleanDatabase = async () => {
  // We want to delete in order to avoid foreign key constraints
  // Starting with child tables
  const tables = [
    'payments',
    'credit_transactions',
    'ai_requests',
    'resume_analysis',
    'job_applications',
    'resumes',
    'users',
  ];

  for (const table of tables) {
    try {
      await db(table).del();
    } catch (error) {
      // Table might not exist or other issues, log it but don't fail everything
      console.warn(`Could not clean table ${table}:`, error.message);
    }
  }
};

/**
 * Run migrations for the test database
 */
const runMigrations = async () => {
  await db.migrate.latest();
};

/**
 * Generate a JWT token for a test user
 */
const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'test_secret',
    { expiresIn: '1h' },
  );
};

/**
 * Create a test user in the database
 */
const createTestUser = async (overrides = {}) => {
  const defaultUser = {
    email: `test_${Date.now()}@example.com`,
    password_hash:
      '$2a$12$LQv3c1yqBWVHxkd0LqCF7uQyxLp/X/8.f.f.f.f.f.f.f.f.f.f.f', // "password123"
    first_name: 'Test',
    last_name: 'User',
    subscription_type: 'candidate',
    is_active: true,
  };

  const user = { ...defaultUser, ...overrides };

  const [createdUser] = await db('users')
    .insert(user)
    .returning(['id', 'email', 'first_name', 'last_name', 'subscription_type']);

  return createdUser;
};

module.exports = {
  cleanDatabase,
  runMigrations,
  generateToken,
  createTestUser,
  db,
};
