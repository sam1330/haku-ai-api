const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, jobApplicationSchema, updateJobApplicationSchema, coverLetterSchema } = require('../middleware/validation');
const aiService = require('../services/aiService');
const { checkCredits } = require('../middleware/creditMiddleware');

const router = express.Router();

// Create job application
router.post('/', authenticateToken, validate(jobApplicationSchema), async (req, res, next) => {
  try {
    const { company_name, position_title, job_description, application_url, application_deadline, notes, resume_id } = req.body;

    const [jobApplication] = await db('job_applications').insert({
      user_id: req.user.id,
      resume_id,
      company_name,
      position_title,
      job_description,
      application_url,
      application_deadline: application_deadline ? new Date(application_deadline) : null,
      notes,
      status: 'draft'
    }).returning(['id', 'company_name', 'position_title', 'status', 'created_at']);

    res.status(201).json({
      message: 'Job application created successfully',
      job_application: jobApplication
    });
  } catch (error) {
    next(error);
  }
});

// Generate cover letter for job application
router.post('/:id/cover-letter', authenticateToken, checkCredits('COVER_LETTER_GENERATION'), validate(coverLetterSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tone, length } = req.body;

    // Get job application
    const jobApplication = await db('job_applications')
      .where('id', id)
      .where('user_id', req.user.id)
      .first();

    if (!jobApplication) {
      return res.status(404).json({
        error: 'Job application not found',
        code: 'JOB_APPLICATION_NOT_FOUND'
      });
    }

    // Get user's most recent resume
    const resume = await db('resumes')
      .where('user_id', req.user.id)
      .where('is_processed', true)
      .orderBy('created_at', 'desc')
      .first();

    if (!resume || !resume.extracted_text) {
      return res.status(400).json({
        error: 'No resume available for cover letter generation',
        code: 'NO_RESUME_AVAILABLE'
      });
    }

    // Generate cover letter
    const coverLetterResult = await aiService.generateCoverLetter(
      resume.extracted_text,
      jobApplication.job_description,
      jobApplication.company_name,
      jobApplication.position_title,
      req.user.id,
      tone,
      length
    );

    // Update job application with cover letter data
    await db('job_applications')
      .where('id', id)
      .update({
        cover_letter_data: {
          content: coverLetterResult.coverLetter,
          tone,
          length,
          generated_at: new Date(),
          tokens_used: coverLetterResult.tokensUsed,
          cost: coverLetterResult.cost
        }
      });

    // Log AI request
    await aiService.logAIRequest(
      req.user.id,
      'cover_letter_generation',
      {
        job_application_id: id,
        company_name: jobApplication.company_name,
        position_title: jobApplication.position_title,
        tone,
        length
      },
      { cover_letter: coverLetterResult.coverLetter },
      coverLetterResult.tokensUsed,
      coverLetterResult.cost
    );

    res.json({
      message: 'Cover letter generated successfully',
      cover_letter: coverLetterResult.coverLetter,
      metadata: {
        tokens_used: coverLetterResult.tokensUsed,
        cost: coverLetterResult.cost,
        model: coverLetterResult.model
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all job applications
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = db('job_applications')
      .where('user_id', req.user.id)
      .select('id', 'company_name', 'position_title', 'status', 'application_url', 'application_deadline', 'created_at', 'updated_at');

    if (status) {
      query = query.where('status', status);
    }

    const jobApplications = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const totalQuery = db('job_applications').where('user_id', req.user.id);
    if (status) {
      totalQuery.where('status', status);
    }
    const total = await totalQuery.count('* as count').first();

    res.json({
      job_applications: jobApplications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total.count),
        pages: Math.ceil(total.count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get specific job application
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const jobApplication = await db('job_applications')
      .where('id', id)
      .where('user_id', req.user.id)
      .first();

    if (!jobApplication) {
      return res.status(404).json({
        error: 'Job application not found',
        code: 'JOB_APPLICATION_NOT_FOUND'
      });
    }

    res.json({
      job_application: jobApplication
    });
  } catch (error) {
    next(error);
  }
});

// Update job application
router.put('/:id', authenticateToken, validate(updateJobApplicationSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove undefined values
    Object.keys(updates).forEach(key => {
      if (updates[key] === undefined) {
        delete updates[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        code: 'NO_UPDATES'
      });
    }

    // Handle date conversion for application_deadline
    if (updates.application_deadline) {
      updates.application_deadline = new Date(updates.application_deadline);
    }

    const [updatedJobApplication] = await db('job_applications')
      .where('id', id)
      .where('user_id', req.user.id)
      .update(updates)
      .returning(['id', 'company_name', 'position_title', 'status', 'updated_at']);

    if (!updatedJobApplication) {
      return res.status(404).json({
        error: 'Job application not found',
        code: 'JOB_APPLICATION_NOT_FOUND'
      });
    }

    res.json({
      message: 'Job application updated successfully',
      job_application: updatedJobApplication
    });
  } catch (error) {
    next(error);
  }
});

// Delete job application
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await db('job_applications')
      .where('id', id)
      .where('user_id', req.user.id)
      .del();

    if (deleted === 0) {
      return res.status(404).json({
        error: 'Job application not found',
        code: 'JOB_APPLICATION_NOT_FOUND'
      });
    }

    res.json({
      message: 'Job application deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get cover letter for job application
router.get('/:id/cover-letter', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const jobApplication = await db('job_applications')
      .where('id', id)
      .where('user_id', req.user.id)
      .select('cover_letter_data', 'company_name', 'position_title')
      .first();

    if (!jobApplication) {
      return res.status(404).json({
        error: 'Job application not found',
        code: 'JOB_APPLICATION_NOT_FOUND'
      });
    }

    if (!jobApplication.cover_letter_data) {
      return res.status(404).json({
        error: 'Cover letter not generated for this application',
        code: 'NO_COVER_LETTER'
      });
    }

    res.json({
      cover_letter: jobApplication.cover_letter_data.content,
      metadata: {
        tone: jobApplication.cover_letter_data.tone,
        length: jobApplication.cover_letter_data.length,
        generated_at: jobApplication.cover_letter_data.generated_at,
        tokens_used: jobApplication.cover_letter_data.tokens_used,
        cost: jobApplication.cover_letter_data.cost
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
