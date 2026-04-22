const express = require('express');
const db = require('../config/database');
const {
  authenticateToken,
  requireSubscription,
} = require('../middleware/auth');
const {
  validate,
  resumeAnalysisSchema,
  resumeSchema,
} = require('../middleware/validation');
const { fileService } = require('../services/fileService');
const aiService = require('../services/aiService');
const { checkCredits } = require('../middleware/creditMiddleware');
const enums = require('../enums');
const { generatePDF } = require('../services/playwrightService');

const router = express.Router();

// Upload resume
router.post(
  '/upload',
  authenticateToken,
  fileService.getMulterConfig().single('resume'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          code: 'NO_FILE',
        });
      }

      const { originalname, filename, mimetype, size } = req.file;
      const fileType = fileService.getFileTypeFromMimeType(mimetype);

      // Save file to S3
      const path = await fileService.storeFile(
        req.file.buffer,
        originalname,
        mimetype,
      );

      // Extract text from file
      const extractedText = await fileService.extractTextFromFile(
        path,
        fileType,
      );

      // Save resume record to database
      const [resume] = await db('resumes')
        .insert({
          user_id: req.user.id,
          original_filename: originalname,
          file_path: path,
          file_type: fileType,
          file_size: size,
          extracted_text: extractedText,
          is_processed: true,
          source: enums.RESUME_SOURCE_TYPES.UPLOAD,
        })
        .returning([
          'id',
          'original_filename',
          'file_type',
          'file_size',
          'created_at',
        ]);

      res.status(201).json({
        message: 'Resume uploaded and processed successfully',
        resume: {
          id: resume.id,
          original_filename: resume.original_filename,
          file_type: resume.file_type,
          file_size: resume.file_size,
          created_at: resume.created_at,
          text_length: extractedText.length,
        },
      });
    } catch (error) {
      // Clean up uploaded file if processing failed
      if (req.file) {
        await fileService.deleteFile(req.file.path);
      }
      next(error);
    }
  },
);

// Analyze resume
router.post(
  '/:resume_id/analyze',
  authenticateToken,
  checkCredits('RESUME_ANALYSIS'),
  validate(resumeAnalysisSchema),
  async (req, res, next) => {
    try {
      const { job_description, target_role, target_company } = req.body;
      const { resume_id } = req.params;
      const locale = req.headers['x-locale'] || 'en';

      if (!resume_id) {
        return res.status(400).json({
          error: 'Resume ID is required',
          code: 'MISSING_RESUME_ID',
        });
      }

      // Get resume
      const resume = await db('resumes')
        .where('id', resume_id)
        .where('user_id', req.user.id)
        .first();

      if (!resume) {
        return res.status(404).json({
          error: 'Resume not found',
          code: 'RESUME_NOT_FOUND',
        });
      }

      if (!resume.extracted_text) {
        return res.status(400).json({
          error: 'Resume text not available for analysis',
          code: 'NO_RESUME_TEXT',
        });
      }

      // Perform AI analysis
      const analysisResult = await aiService.analyzeResume(
        resume.extracted_text,
        job_description,
        target_role,
        target_company,
        req.user.id,
        locale,
      );

      // Save analysis results to the new table
      const [analysis] = await db('resume_analysis')
        .insert({
          resume_id: resume_id,
          user_id: req.user.id,
          target_role: target_role,
          target_company: target_company,
          job_description: job_description,
          analysis_results: analysisResult.analysis,
        })
        .returning('*');

      // Log AI request
      await aiService.logAIRequest(
        req.user.id,
        'resume_analysis',
        { resume_id, job_description, target_role, target_company },
        { analysis: analysisResult.analysis },
        analysisResult.tokensUsed,
        analysisResult.cost,
      );

      res.json({
        message: 'Resume analysis completed',
        analysis: analysisResult.analysis,
        metadata: {
          tokens_used: analysisResult.tokensUsed,
          cost: analysisResult.cost,
          model: analysisResult.model,
        },
        response: analysisResult.response,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Optimize resume
router.post(
  '/optimize',
  authenticateToken,
  checkCredits('RESUME_OPTIMIZATION'),
  validate(resumeAnalysisSchema),
  async (req, res, next) => {
    try {
      const { job_description, target_role } = req.body;
      const { resume_id } = req.query;

      if (!resume_id) {
        return res.status(400).json({
          error: 'Resume ID is required',
          code: 'MISSING_RESUME_ID',
        });
      }

      // Get resume
      const resume = await db('resumes')
        .where('id', resume_id)
        .where('user_id', req.user.id)
        .first();

      if (!resume) {
        return res.status(404).json({
          error: 'Resume not found',
          code: 'RESUME_NOT_FOUND',
        });
      }

      if (!resume.extracted_text) {
        return res.status(400).json({
          error: 'Resume text not available for optimization',
          code: 'NO_RESUME_TEXT',
        });
      }

      // Perform AI optimization
      const optimizationResult = await aiService.optimizeResume(
        resume.extracted_text,
        job_description,
        target_role,
        req.user.id,
      );

      // Log AI request
      await aiService.logAIRequest(
        req.user.id,
        'resume_optimization',
        { resume_id, job_description, target_role },
        { optimized_resume: optimizationResult.optimizedResume },
        optimizationResult.tokensUsed,
        optimizationResult.cost,
      );

      res.json({
        message: 'Resume optimization completed',
        optimized_resume: optimizationResult.optimizedResume,
        metadata: {
          tokens_used: optimizationResult.tokensUsed,
          cost: optimizationResult.cost,
          model: optimizationResult.model,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Get user's resumes
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const resumes = await db('resumes')
      .where('user_id', req.user.id)
      .select(
        'id',
        'original_filename',
        'file_type',
        'file_size',
        'is_processed',
        'created_at',
        'updated_at',
        'source',
      )
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Fetch the latest analysis for each resume
    const resumeIds = resumes.map((r) => r.id);
    const latestAnalyses = await db('resume_analysis')
      .whereIn('resume_id', resumeIds)
      .orderBy('created_at', 'desc');

    // Map latest analysis to each resume
    const resumesWithAnalysis = resumes.map((resume) => {
      const latest = latestAnalyses.find((a) => a.resume_id === resume.id);
      return {
        ...resume,
        latest_analysis: latest || null,
      };
    });

    const total = await db('resumes')
      .where('user_id', req.user.id)
      .count('* as count')
      .first();

    res.json({
      resumes: resumesWithAnalysis,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total.count),
        pages: Math.ceil(total.count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create new resume
router.post(
  '/',
  authenticateToken,
  validate(resumeSchema),
  async (req, res, next) => {
    try {
      const { metadata, original_filename } = req.body;

      const extractedText = fileService.extractTextFromBuilderCv(metadata.cv);

      const [resume] = await db('resumes')
        .insert({
          user_id: req.user.id,
          extracted_text: extractedText,
          original_filename,
          metadata,
          source: enums.RESUME_SOURCE_TYPES.BUILDER,
          is_processed: true,
        })
        .returning([
          'id',
          'original_filename',
          'metadata',
          'source',
          'created_at',
        ]);

      res.json({
        message: 'Resume created successfully',
        resume: resume,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Update builded resume
router.put(
  '/:resume_id',
  authenticateToken,
  validate(resumeSchema),
  async (req, res, next) => {
    try {
      const { metadata, original_filename } = req.body;

      const extractedText = fileService.extractTextFromBuilderCv(metadata.cv);

      const [resume] = await db('resumes')
        .where('id', req.params.resume_id)
        .update({
          user_id: req.user.id,
          extracted_text: extractedText,
          original_filename,
          metadata,
          source: enums.RESUME_SOURCE_TYPES.BUILDER,
        })
        .returning([
          'id',
          'original_filename',
          'metadata',
          'source',
          'created_at',
        ]);

      res.json({
        message: 'Resume updated successfully',
        resume: resume,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Get specific resume
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const resume = await db('resumes')
      .where('id', id)
      .where('user_id', req.user.id)
      .first();

    if (!resume) {
      return res.status(404).json({
        error: 'Resume not found',
        code: 'RESUME_NOT_FOUND',
      });
    }

    // Don't return the full extracted text in list view
    const { extracted_text, ...resumeData } = resume;

    // Fetch the latest analysis for this specific resume
    const latestAnalysis = await db('resume_analysis')
      .where('resume_id', id)
      .orderBy('created_at', 'desc')
      .first();

    res.json({
      resume: resumeData,
      latest_analysis: latestAnalysis || null,
      has_text: !!extracted_text,
      text_length: extracted_text ? extracted_text.length : 0,
    });
  } catch (error) {
    next(error);
  }
});

// Get all analyses for a specific resume
router.get('/:id/analyses', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if resume exists and belongs to user
    const resume = await db('resumes')
      .where('id', id)
      .where('user_id', req.user.id)
      .first();

    if (!resume) {
      return res.status(404).json({
        error: 'Resume not found',
        code: 'RESUME_NOT_FOUND',
      });
    }

    const analyses = await db('resume_analysis')
      .where('resume_id', id)
      .orderBy('created_at', 'desc');

    res.json({
      analyses,
    });
  } catch (error) {
    next(error);
  }
});

// Get resume text (for analysis)
router.get('/:id/text', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const resume = await db('resumes')
      .where('id', id)
      .where('user_id', req.user.id)
      .select('extracted_text', 'original_filename')
      .first();

    if (!resume) {
      return res.status(404).json({
        error: 'Resume not found',
        code: 'RESUME_NOT_FOUND',
      });
    }

    if (!resume.extracted_text) {
      return res.status(400).json({
        error: 'Resume text not available',
        code: 'NO_RESUME_TEXT',
      });
    }

    res.json({
      text: resume.extracted_text,
      filename: resume.original_filename,
    });
  } catch (error) {
    next(error);
  }
});

// Delete resume
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const resume = await db('resumes')
      .where('id', id)
      .where('user_id', req.user.id)
      .first();

    if (!resume) {
      return res.status(404).json({
        error: 'Resume not found',
        code: 'RESUME_NOT_FOUND',
      });
    }

    // Delete file from filesystem
    await fileService.deleteFile(resume.file_path);

    // Delete from database
    await db('resumes').where('id', id).del();

    res.json({
      message: 'Resume deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Generate resume
router.post(
  '/:resume_id/generate',
  authenticateToken,
  async (req, res, next) => {
    try {
      const { resume_id } = req.params;
      const { locale } = req.body;

      const authHeader = req.headers['authorization'];

      const resume = await db('resumes')
        .where('id', resume_id)
        .where('user_id', req.user.id)
        .first();

      // const pdfEngineURL = process.env.PDG_ENGINE_URL;

      // const response = await fetch(`${pdfEngineURL}/generate`, {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     metadata: resume.metadata,
      //   }),
      // });

      const response = await generatePDF(
        resume_id,
        locale,
        authHeader.split(' ')[1],
      );

      const pdfBuffer = Buffer.from(response);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${resume.original_filename}.pdf`,
      );
      res.end(pdfBuffer);
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
