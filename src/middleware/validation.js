const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      error.isJoi = true;
      error.status = 422;
      return next(error);
    }
    next();
  };
};

// Auth validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  first_name: Joi.string().min(2).max(50).required(),
  last_name: Joi.string().min(2).max(50).required(),
  recaptcha_token: Joi.string().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  recaptcha_token: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  recaptcha_token: Joi.string().required(),
});

// Resume validation schemas
const resumeAnalysisSchema = Joi.object({
  job_description: Joi.string().min(50).max(10000).required(),
  target_role: Joi.string().min(2).max(100).optional(),
  target_company: Joi.string().min(2).max(100).optional(),
});

// Resume optimization validation schema
const resumeOptimizationSchema = Joi.object({
  target_role: Joi.string().min(2).max(100).optional(),
  job_description: Joi.string().min(50).max(10000).required(),
  target_company: Joi.string().min(2).max(100).optional(),
});

// Create resume validation schema
const resumeSchema = Joi.object({
  original_filename: Joi.string().required(),
  metadata: Joi.object({
    design: Joi.object().required(),
    cv: Joi.object().required(),
    locale: Joi.object().required(),
  }).required(),
});

const coverLetterSchema = Joi.object({
  tone: Joi.string()
    .valid('professional', 'casual', 'enthusiastic')
    .default('professional'),
  length: Joi.string().valid('short', 'medium', 'long').default('medium'),
});

// Job application validation schemas
const jobApplicationSchema = Joi.object({
  company_name: Joi.string().min(2).max(100).required(),
  position_title: Joi.string().min(2).max(100).required(),
  job_description: Joi.string().min(50).max(10000).required(),
  application_url: Joi.string().uri().optional().allow(''),
  application_deadline: Joi.date().optional().allow(''),
  notes: Joi.string().max(1000).optional().allow(''),
  resume_id: Joi.string().uuid().required(),
});

const updateJobApplicationSchema = Joi.object({
  company_name: Joi.string().min(2).max(100).optional(),
  position_title: Joi.string().min(2).max(100).optional(),
  job_description: Joi.string().min(50).max(10000).optional(),
  application_url: Joi.string().uri().optional(),
  application_deadline: Joi.date().optional(),
  notes: Joi.string().max(1000).optional(),
  status: Joi.string()
    .valid('draft', 'applied', 'interview', 'rejected', 'accepted')
    .optional(),
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  resumeAnalysisSchema,
  coverLetterSchema,
  jobApplicationSchema,
  updateJobApplicationSchema,
  forgotPasswordSchema,
  resumeSchema,
  resumeOptimizationSchema,
};
