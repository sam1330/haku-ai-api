process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/server');
const { db, runMigrations } = require('./helpers');

describe('API Environment & Health', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('Health check endpoint should return 200', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'OK');
  });

  test('CORS should be configured', async () => {
    const response = await request(app)
      .options('/health')
      .expect(204);

    expect(response.headers).toHaveProperty('access-control-allow-origin');
  });

  test('Environment should be test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  test('Database connection should be to test DB', async () => {
    const dbName = await db.raw('SELECT current_database()');
    expect(dbName.rows[0].current_database).toBe(process.env.DB_TEST_NAME || 'resume_ai_test_db');
  });
});
