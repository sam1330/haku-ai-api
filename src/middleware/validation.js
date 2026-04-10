const Joi = require("joi");

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      error.isJoi = true;
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
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// Resume validation schemas
const resumeAnalysisSchema = Joi.object({
  job_description: Joi.string().min(50).max(10000).required(),
  target_role: Joi.string().min(2).max(100).optional(),
  target_company: Joi.string().min(2).max(100).optional(),
});

const coverLetterSchema = Joi.object({
  job_description: Joi.string()
    .min(50)
    .max(10000)
    .when("job_application", {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  company_name: Joi.string().min(2).max(100).when("job_application", {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  position_title: Joi.string().min(2).max(100).when("job_application", {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  tone: Joi.string()
    .valid("professional", "casual", "enthusiastic")
    .default("professional"),
  length: Joi.string().valid("short", "medium", "long").default("medium"),
  job_application: Joi.string().uuid().optional(),
});

// Job application validation schemas
const jobApplicationSchema = Joi.object({
  company_name: Joi.string().min(2).max(100).required(),
  position_title: Joi.string().min(2).max(100).required(),
  job_description: Joi.string().min(50).max(10000).required(),
  application_url: Joi.string().uri().optional().allow(""),
  application_deadline: Joi.date().optional().allow(""),
  notes: Joi.string().max(1000).optional().allow(""),
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
    .valid("draft", "applied", "interview", "rejected", "accepted")
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
};
