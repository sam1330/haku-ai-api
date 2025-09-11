const request = require('supertest');
const app = require('../src/server');

describe('Server Setup', () => {
  test('Health check endpoint should return 200', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });

  test('Non-existent endpoint should return 404', async () => {
    const response = await request(app)
      .get('/non-existent')
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('code', 'NOT_FOUND');
  });

  test('CORS should be configured', async () => {
    const response = await request(app)
      .options('/health')
      .expect(204);

    expect(response.headers).toHaveProperty('access-control-allow-origin');
  });
});

describe('Authentication Endpoints', () => {
  test('Register endpoint should exist', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        first_name: 'Test',
        last_name: 'User'
      });

    // Should return 400 or 409 (validation error or user exists)
    expect([400, 409]).toContain(response.status);
  });

  test('Login endpoint should exist', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    // Should return 400 or 401 (validation error or invalid credentials)
    expect([400, 401]).toContain(response.status);
  });
});

describe('API Routes', () => {
  test('Resume routes should be protected', async () => {
    const response = await request(app)
      .get('/api/resume')
      .expect(401);

    expect(response.body).toHaveProperty('error', 'Access token required');
    expect(response.body).toHaveProperty('code', 'MISSING_TOKEN');
  });

  test('Job application routes should be protected', async () => {
    const response = await request(app)
      .get('/api/job-application')
      .expect(401);

    expect(response.body).toHaveProperty('error', 'Access token required');
    expect(response.body).toHaveProperty('code', 'MISSING_TOKEN');
  });

  test('Dashboard routes should be protected', async () => {
    const response = await request(app)
      .get('/api/dashboard/overview')
      .expect(401);

    expect(response.body).toHaveProperty('error', 'Access token required');
    expect(response.body).toHaveProperty('code', 'MISSING_TOKEN');
  });
});
