process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/server');
const { cleanDatabase, createTestUser, generateToken, db, runMigrations } = require('./helpers');

describe('Resume Integration Tests', () => {
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

  describe('GET /api/resume', () => {
    test('should return empty list initially', async () => {
      const response = await request(app)
        .get('/api/resume')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.resumes).toHaveLength(0);
    });

    test('should return list of resumes', async () => {
      // Insert a mock resume
      await db('resumes').insert({
        user_id: user.id,
        original_filename: 'test-resume.pdf',
        file_path: 'uploads/test-path.pdf',
        file_type: 'pdf',
        file_size: 1024,
        extracted_text: 'Sample resume text',
        is_processed: true
      });

      const response = await request(app)
        .get('/api/resume')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.resumes).toHaveLength(1);
      expect(response.body.resumes[0].original_filename).toBe('test-resume.pdf');
    });
  });

  describe('GET /api/resume/:id', () => {
    let resumeId;

    beforeAll(async () => {
      const [resume] = await db('resumes').insert({
        user_id: user.id,
        original_filename: 'detail-resume.pdf',
        file_path: 'uploads/detail-path.pdf',
        file_type: 'pdf',
        file_size: 2048,
        extracted_text: 'Detailed resume text content',
        is_processed: true
      }).returning('id');
      resumeId = resume.id;
    });

    test('should get resume details', async () => {
      const response = await request(app)
        .get(`/api/resume/${resumeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.resume.original_filename).toBe('detail-resume.pdf');
      expect(response.body).toHaveProperty('has_text', true);
      expect(response.body).toHaveProperty('text_length');
    });

    test('should return 404 for non-existent resume', async () => {
      await request(app)
        .get('/api/resume/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('DELETE /api/resume/:id', () => {
    let resumeId;

    beforeEach(async () => {
      const [resume] = await db('resumes').insert({
        user_id: user.id,
        original_filename: 'delete-me.pdf',
        file_path: 'uploads/delete-me.pdf',
        file_type: 'pdf',
        file_size: 512,
        extracted_text: 'Delete me',
        is_processed: true
      }).returning('id');
      resumeId = resume.id;
    });

    test('should delete a resume record', async () => {
      // Note: This will attempt to delete from filesystem. 
      // Since the file doesn't exist, we might need to handle it in the service or mock it.
      // Currently the service logs error but doesn't throw if file is missing.
      
      const response = await request(app)
        .delete(`/api/resume/${resumeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toContain('successfully');

      const check = await db('resumes').where('id', resumeId).first();
      expect(check).toBeUndefined();
    });
  });
});
