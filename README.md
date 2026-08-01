# Haku AI — Resume & Job Application Assistant (Backend)

A Node.js/TypeScript backend for an AI-powered resume analysis, resume building, and job application platform.

## Features

- **Authentication**: Email/password auth with access + refresh tokens (httpOnly cookie), email verification, password reset, and Google reCAPTCHA v3 protection on sensitive endpoints
- **Resume Processing**: Upload and parse PDF/DOCX resumes (text extraction via `pdf-parse` / `mammoth`), stored on AWS S3
- **AI-Powered Analysis**: Resume analysis and ATS scoring using Google Gemini (Vertex AI)
- **Resume Optimization & Building**: AI-assisted resume improvement and conversion of uploaded resumes into structured, editable builder data
- **Resume PDF Generation**: Render a stored resume to a downloadable PDF (via Playwright / an external PDF engine)
- **Public Resume Grading**: Unauthenticated endpoint to grade an uploaded resume instantly
- **Cover Letter Generation**: AI-generated personalized cover letters tied to job applications
- **Job Application Management**: Track and manage job applications and their status
- **Dashboard Analytics**: Usage overview, AI usage stats, subscription status, and recent activity feed
- **Credits & Billing**: Credit-based usage system with Lemon Squeezy checkout and webhook-driven credit top-ups
- **Observability**: Sentry error tracking and performance profiling

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript (project is mid-migration from JS to TS — both `.js` and `.ts` files exist under `src/`)
- **Framework**: Express.js
- **Database**: PostgreSQL with Knex.js (migrations + query builder)
- **Authentication**: JWT access tokens + rotating refresh tokens, bcrypt password hashing
- **File Processing**: multer, pdf-parse, mammoth, Playwright
- **File Storage**: AWS S3 (`@aws-sdk/client-s3`)
- **AI Integration**: Google Gemini via `@google/genai` (Vertex AI)
- **Payments**: Lemon Squeezy (`@lemonsqueezy/lemonsqueezy.js`)
- **Email**: Resend
- **Validation**: Zod
- **Security**: Helmet, CORS, rate limiting, reCAPTCHA v3
- **Monitoring**: Sentry (`@sentry/node`, `@sentry/profiling-node`)
- **Testing**: Jest + Supertest

## Prerequisites

- Node.js 18 or higher
- PostgreSQL 12 or higher
- Google Cloud project with Vertex AI access (Gemini)
- AWS S3 bucket + credentials
- Lemon Squeezy account (for billing) and Resend account (for transactional email)

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd haku-api
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp env.example .env
   ```

   Key variables to configure (see `env.example` for the full list):

   ```env
   # Server
   PORT=3000
   NODE_ENV=development

   # Database
   DB_URL=postgresql://user:password@localhost:5432/resume_ai_db
   # (or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD)

   # JWT
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_EXPIRES_IN=7d

   # Google Cloud Vertex AI (Gemini)
   GCP_PROJECT_ID=your_gcp_project_id
   GCP_LOCATION=us-central1
   GEMINI_MODEL=
   SIMPLE_GEMINI_MODEL=

   # AWS S3
   AWS_REGION=
   AWS_ACCESS_KEY_ID=
   AWS_SECRET_ACCESS_KEY=
   AWS_BUCKET_NAME=

   # Email (Resend)
   RESEND_API_KEY=
   SMTP_USER=your_email@gmail.com
   SMTP_FROM_NAME=Haku AI Resume Assistant

   # Frontend URL (for verification/reset links)
   FRONTEND_URL=http://localhost:3001

   # Lemon Squeezy
   LEMON_SQUEEZY_API_KEY=
   LEMON_SQUEEZY_STORE_ID=
   LEMON_SQUEEZY_WEBHOOK_SECRET=
   LEMON_SQUEEZY_STARTER_VARIANT_ID=
   LEMON_SQUEEZY_PROFESSIONAL_VARIANT_ID=
   LEMON_SQUEEZY_BUSINESS_VARIANT_ID=

   # reCAPTCHA v3
   RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
   RECAPTCHA_MIN_SCORE=0.5

   # Sentry
   SENTRY_DSN=""
   ```

4. **Set up the database**

   ```bash
   npm run build
   npx knex migrate:latest
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

### Running with Docker

A `docker-compose.yml` is provided that builds the API image and starts a PostgreSQL 18 container, running migrations automatically on boot:

```bash
docker compose up --build
```

## Available Scripts

- `npm run dev` — run the server with `tsx watch` (hot reload)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run the compiled server from `dist/`
- `npm test` — run the Jest test suite
- `npm run test:db` — sanity-check the database connection
- `npm run migrate` — build, then run Knex migrations
- `npm run seed` — build, then run Knex seeds

## API Endpoints

### Authentication (`/api/auth`)

- `POST /register` — register (sends verification email, protected by reCAPTCHA)
- `POST /login` — login (issues access token + refresh token cookie, requires verified email)
- `POST /refresh` — rotate refresh token and issue a new access token
- `POST /logout` — revoke refresh token
- `POST /verify-email` — verify email with token
- `POST /resend-verification` — resend verification email
- `GET /verify-email/status` — check verification status
- `POST /forgot-password` — send password reset email
- `POST /reset-password` — reset password with token
- `GET /profile` — get current user profile (includes recent credit transactions)
- `PUT /profile` — update profile
- `PUT /change-password` — change password

### Resumes (`/api/resumes`)

- `POST /upload` — upload a resume (PDF/DOCX)
- `POST /:resume_id/analyze` — analyze a resume with AI
- `POST /:resume_id/optimize` — optimize a resume with AI
- `POST /:resume_id/convert` — convert an uploaded resume into structured, editable builder data (costs credits)
- `POST /:resume_id/generate` — generate a downloadable PDF from a resume
- `GET /` — list the current user's resumes
- `POST /` — create a resume (builder)
- `PUT /:resume_id` — update a resume
- `GET /:id` — get a specific resume
- `GET /:id/analyses` — get a resume's analysis history
- `GET /:id/text` — get extracted resume text
- `DELETE /:id` — delete a resume
- `POST /public/grade` — public, unauthenticated instant resume grading

### Job Applications (`/api/job-applications`)

- `POST /` — create a job application
- `POST /:id/cover-letter` — generate an AI cover letter for the application
- `GET /` — list job applications
- `GET /:id` — get a specific application
- `PUT /:id` — update an application
- `DELETE /:id` — delete an application
- `GET /:id/cover-letter` — get the generated cover letter

### Dashboard (`/api/dashboard`)

- `GET /overview` — dashboard overview
- `GET /ai-usage` — AI usage statistics
- `GET /subscription` — subscription status
- `GET /activity` — recent activity feed

### Credits & Billing (`/api/credits`)

- `GET /balance` — get the current user's credit balance
- `GET /transactions` — get credit transaction history
- `POST /create-checkout-session` — create a Lemon Squeezy checkout session for a plan
- `POST /webhook` — Lemon Squeezy webhook (order events, credits users on successful orders)

## Database Schema

Schema is managed via Knex migrations in `src/migrations/`. Core tables:

- **users** — account info, credentials, subscription/customer references, email verification & password reset tokens
- **refresh_tokens** — rotating JWT refresh tokens per user
- **resumes** — uploaded/created resumes, extracted text, structured builder metadata
- **resume_analyses** — AI analysis results per resume
- **job_applications** — job application tracking, status, generated cover letters
- **ai_requests** — logs of AI calls (type, input/output, tokens, cost)
- **credit_transactions** — credit debits/top-ups per user
- **payments** — Lemon Squeezy checkout/order records

## Billing & Credits

The platform uses a credit-based model instead of fixed subscription tiers. Credits are purchased via Lemon Squeezy checkout and consumed by credit-gated AI actions (see `src/config/plans.ts` and `src/middleware/creditMiddleware.js`):

| Plan         | Credits | Price  |
| ------------ | ------- | ------ |
| Starter      | 100     | $10.00 |
| Professional | 250     | $20.00 |
| Business     | 600     | $50.00 |

## Project Structure

```
src/
  config/       # database, plans, constants
  enums/        # shared enums
  middleware/   # auth, validation, rate limiting, recaptcha, error handling, db health
  migrations/   # Knex migrations
  routes/       # Express routers (auth, resume, jobApplication, dashboard, credits)
  services/     # business logic (AI, credits, email, file storage, Lemon Squeezy, PDF)
  types/        # shared TypeScript types
  utils/        # helpers
  server.js     # app entrypoint
```

## License

MIT
