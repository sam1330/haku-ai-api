---
name: DocumentAIFrontend
description: Knowledge base for building a frontend for the Document AI API. Contains endpoint details, authentication patterns, and data structures.
---

# Document AI API Frontend Development Skill

This skill provides all the necessary information for building a frontend that interacts with the Document AI Backend.

## Authentication

The API uses JWT (JSON Web Token) for authentication.

- **Header**: `Authorization: Bearer <token>`
- **Storage**: Store the token in `localStorage` or a secure cookie.
- **Expiry**: Tokens are valid for 7 days by default.

## API Endpoints Base URL

By default, the API runs on `http://localhost:3000/api`.

### 1. Authentication (`/auth`)

- `POST /auth/register`: Register a new user.
    - Body: `{ email, password, first_name, last_name }`
- `POST /auth/login`: Login and receive a token.
    - Body: `{ email, password }`
- `GET /auth/profile`: Get current user info (Requires Auth).
- `PUT /auth/profile`: Update first/last name (Requires Auth).
- `PUT /auth/change-password`: Update password (Requires Auth).

### 2. Dashboard (`/dashboard`)

The dashboard provides overview metrics and usage stats.

- `GET /dashboard/overview`: High-level metrics (Requires Auth).
    - Returns:
        - `overview`: Total resumes, applications, analyzed count, avg score, monthly cost.
        - `resume_analytics`: Score distribution (poor/average/good), top strengths/weaknesses (arrays), and 10 most recent analytic results.
        - `recent_activity`: Combined list of latest resumes and applications.
- `GET /dashboard/ai-usage`: Detailed AI usage over time.
    - Query: `?period=30` (days)
- `GET /dashboard/subscription`: Check user tier and limits.

### 3. Resumes (`/resumes`)

Handling resume uploads, analysis, and optimization.

- `POST /resumes/upload`: Upload a PDF/DOCX file.
    - Body: `multipart/form-data` with key `resume`.
- `GET /resumes`: List all resumes (paginated).
    - Query: `?page=1&limit=10`
- `GET /resumes/:id`: Get metadata for a specific resume.
- `POST /resumes/:id/analyze`: Run AI analysis against a job description.
    - Body: `{ job_description, target_role, target_company }`
- `POST /resumes/optimize?resume_id=ID`: Generate an optimized version of the resume.
    - Body: `{ job_description, target_role }`
- `DELETE /resumes/:id`: Delete a resume.

### 4. Job Applications (`/job-applications`)

Managing job applications and cover letters.

- `POST /job-applications`: Create a new application tracker.
    - Body: `{ company_name, position_title, job_description, ... }`
- `GET /job-applications`: List applications.
    - Query: `?page=1&limit=10&status=draft|applied|interviewing|offered|rejected`
- `PUT /job-applications/:id`: Update status or details.
- `POST /job-applications/:id/cover-letter`: Generate a cover letter.
    - Body: `{ tone: 'professional'|'casual'|'enthusiastic', length: 'short'|'medium'|'long' }`
- `GET /job-applications/:id/cover-letter`: Retrieve the generated content.

## Key Data Structures

### Resume Analysis Result
```json
{
  "overview": "3-sentence summary",
  "strongPoints": ["Point 1", "Point 2"],
  "weaknesses": ["Point 1", "Point 2"],
  "atsScore": 85
}
```

### Dashboard Analytics Object
```json
{
  "score_distribution": { "poor": 1, "average": 5, "good": 2 },
  "top_strengths": ["Keyword Optimization", "Clear Formatting"],
  "top_weaknesses": ["Quantifiable metrics missing"],
  "recent_analyses": [...]
}
```

## Recommended Tech Stack for Frontend
- **React/Next.js**: For modern component-based UI.
- **TailwindCSS**: For rapid styling using the "Rich Aesthetics" guidelines.
- **Axios/TanStack Query**: For efficient data fetching and caching.
- **Lucide React**: For icons.
- **Framer Motion**: For smooth micro-animations on the dashboard.
