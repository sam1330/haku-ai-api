import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

interface ValidationError extends Error {
  isValidationError?: boolean;
  status?: number;
  issues?: { path: (string | number)[]; message: string }[];
}

const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const error: ValidationError = new Error('Validation error');
      error.isValidationError = true;
      error.status = 422;
      error.issues = result.error.issues.map((issue) => ({
        path: issue.path as (string | number)[],
        message: issue.message,
      }));
      return next(error);
    }
    next();
  };
};

// Auth validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().min(2).max(50),
  last_name: z.string().min(2).max(50),
  recaptcha_token: z.string(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  recaptcha_token: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
  recaptcha_token: z.string(),
});

// Resume validation schemas
const resumeAnalysisSchema = z.object({
  job_description: z.string().min(50).max(10000),
  target_role: z.string().min(2).max(100).optional(),
  target_company: z.string().min(2).max(100).optional(),
});

// Resume optimization validation schema
const resumeOptimizationSchema = z.object({
  target_role: z.string().min(2).max(100).optional(),
  job_description: z.string().min(50).max(10000),
  target_company: z.string().min(2).max(100).optional(),
});

// Create resume validation schema
const resumeSchema = z.object({
  original_filename: z.string(),
  metadata: z.object({
    design: z.object({}).passthrough(),
    cv: z.object({}).passthrough(),
    locale: z.object({}).passthrough(),
  }),
});

const coverLetterSchema = z.object({
  tone: z
    .enum(['professional', 'casual', 'enthusiastic'])
    .default('professional'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
});

// Job application validation schemas
const jobApplicationSchema = z.object({
  company_name: z.string().min(2).max(100),
  position_title: z.string().min(2).max(100),
  job_description: z.string().min(50).max(10000),
  application_url: z.string().url().optional().or(z.literal('')),
  application_deadline: z.coerce.date().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  resume_id: z.string().uuid(),
});

const updateJobApplicationSchema = z.object({
  company_name: z.string().min(2).max(100).optional(),
  position_title: z.string().min(2).max(100).optional(),
  job_description: z.string().min(50).max(10000).optional(),
  application_url: z.string().url().optional(),
  application_deadline: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  status: z
    .enum(['draft', 'applied', 'interview', 'rejected', 'accepted'])
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
