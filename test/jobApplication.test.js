process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/server');
const { cleanDatabase, createTestUser, generateToken, db, runMigrations } = require('./helpers');

describe('Job Application Integration Tests', () => {
  let user;
  let token;
  let resumeId;

  beforeAll(async () => {
    await runMigrations();
    await cleanDatabase();
    user = await createTestUser();
    token = generateToken(user);
    
    // Create a mock resume for job application tests
    const [resume] = await db('resumes').insert({
      user_id: user.id,
      original_filename: 'test-resume.pdf',
      file_path: 'uploads/test-path.pdf',
      file_type: 'pdf',
      file_size: 1024,
      extracted_text: 'Sample resume text for testing purposes.',
      is_processed: true
    }).returning('id');
    resumeId = resume.id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('POST /api/job-application', () => {
    const validApplication = {
      company_name: 'Tech Corp',
      position_title: 'Software Engineer',
      job_description: 'Building amazing things with AI. This description is now longer than 50 characters to pass validation requirements.',
      application_url: 'https://example.com/apply',
      notes: 'Referral from Jane',
      resume_id: null // Will be set in the test
    };

    test('should create a job application successfully', async () => {
      const response = await request(app)
        .post('/api/job-application')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validApplication, resume_id: resumeId })
        .expect(201);

      expect(response.body.job_application).toMatchObject({
        company_name: validApplication.company_name,
        position_title: validApplication.position_title,
        status: 'draft'
      });
      expect(response.body.job_application).toHaveProperty('id');
    });

    test('should fail without company name', async () => {
      const invalid = { ...validApplication, company_name: '' };
      await request(app)
        .post('/api/job-application')
        .set('Authorization', `Bearer ${token}`)
        .send(invalid)
        .expect(400);
    });
  });

  describe('GET /api/job-application', () => {
    test('should return list of job applications', async () => {
      const response = await request(app)
        .get('/api/job-application')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body.job_applications)).toBe(true);
      expect(response.body).toHaveProperty('pagination');
    });
  });

  describe('GET /api/job-application/:id', () => {
    let jobId;

    beforeAll(async () => {
      const [job] = await db('job_applications').insert({
        user_id: user.id,
        resume_id: resumeId,
        company_name: 'Detail Corp',
        position_title: 'Analyst',
        job_description: 'This is a detailed job description that meets the 50 character minimum requirement for validation.',
        status: 'draft'
      }).returning('id');
      jobId = typeof job === 'object' ? job.id : job;
    });

    test('should get a specific job application', async () => {
      const response = await request(app)
        .get(`/api/job-application/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.job_application.id).toBe(jobId);
      expect(response.body.job_application.company_name).toBe('Detail Corp');
    });

    test('should return 404 for non-existent job', async () => {
      await request(app)
        .get('/api/job-application/00000000-0000-0000-0000-000000000000') // UUID or 0 if integer
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PUT /api/job-application/:id', () => {
    let jobId;

    beforeAll(async () => {
      const [job] = await db('job_applications').insert({
        user_id: user.id,
        resume_id: resumeId,
        company_name: 'Update Corp',
        position_title: 'Junior Dev',
        job_description: 'Another long job description for updating tests that satisfies the minimum length constraint.',
        status: 'draft'
      }).returning('id');
      jobId = typeof job === 'object' ? job.id : job;
    });

    test('should update a job application status', async () => {
      const response = await request(app)
        .put(`/api/job-application/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'applied' })
        .expect(200);

      expect(response.body.job_application.status).toBe('applied');
    });

    test('should update company name', async () => {
      const response = await request(app)
        .put(`/api/job-application/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: 'New Corp Name' })
        .expect(200);

      expect(response.body.job_application.company_name).toBe('New Corp Name');
    });
  });

  describe('DELETE /api/job-application/:id', () => {
    let jobId;

    beforeEach(async () => {
      const [job] = await db('job_applications').insert({
        user_id: user.id,
        resume_id: resumeId,
        company_name: 'Delete Corp',
        position_title: 'Temp',
        job_description: 'Temporary job description for deletion tests that is long enough to pass any validation if needed.',
        status: 'draft'
      }).returning('id');
      jobId = typeof job === 'object' ? job.id : job;
    });

    test('should delete a job application', async () => {
      await request(app)
        .delete(`/api/job-application/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify it's gone
      const check = await db('job_applications').where('id', jobId).first();
      expect(check).toBeUndefined();
    });
  });
});
