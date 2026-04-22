process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/server');
const {
  cleanDatabase,
  db,
  runMigrations,
} = require('./helpers');

describe('Authentication Integration Tests', () => {
  beforeAll(async () => {
    await runMigrations();
    await cleanDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('POST /api/auth/register', () => {
    const newUser = {
      email: 'newuser@example.com',
      password: 'password123',
      first_name: 'John',
      last_name: 'Doe',
    };

    test('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toMatchObject({
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
      });
      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    test('should fail with duplicate email', async () => {
      await request(app).post('/api/auth/register').send(newUser).expect(409);
    });

    test('should fail with invalid email', async () => {
      const invalidUser = { ...newUser, email: 'invalid-email' };
      await request(app)
        .post('/api/auth/register')
        .send(invalidUser)
        .expect(422);
        
    });
  });

  describe('POST /api/auth/login', () => {
    const userCredentials = {
      email: 'loginuser@example.com',
      password: 'password123',
    };

    beforeAll(async () => {
      // Register the user for login tests
      await request(app)
        .post('/api/auth/register')
        .send({
          ...userCredentials,
          first_name: 'Login',
          last_name: 'Test',
        });
    });

    test('should login successfully with correct credentials', async () => {
      const user = await db('users').where('email', userCredentials.email).first();
      user.email_verified_at = new Date();
      await db('users').where('email', userCredentials.email).update(user);
      const response = await request(app)
        .post('/api/auth/login')
        .send(userCredentials)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(userCredentials.email);
    });

    test('should fail with unverified email', async () => {
      const user = await db('users').where('email', userCredentials.email).first();
      user.email_verified_at = null;
      await db('users').where('email', userCredentials.email).update(user);
      const response = await request(app)
        .post('/api/auth/login')
        .send(userCredentials)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.email).toBe(userCredentials.email);
    });

    test('should fail with incorrect password', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: 'wrongpassword',
        })
        .expect(403);
    });
  });

  describe('GET /api/auth/profile', () => {
    let token;
    const userCredentials = {
      email: 'loginuser@example.com',
      password: 'password123',
    };

    beforeAll(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          ...userCredentials,
          first_name: 'Login',
          last_name: 'Test',
        });

      const user = await db('users').where('email', userCredentials.email).first();
      user.email_verified_at = new Date();
      await db('users').where('email', userCredentials.email).update(user);

      const response = await request(app).post('/api/auth/login').send({
        email: 'loginuser@example.com',
        password: 'password123',
      });
      token = response.body.token;
    });

    test('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.user.email).toBe('loginuser@example.com');
    });

    test('should fail without token', async () => {
      await request(app).get('/api/auth/profile').expect(401);
    });
  });
});
