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

## API Endpoints Base URL

Default: `http://localhost:3000/api`

---

### 1. Authentication (`/auth`)

#### `POST /auth/register`
Register a new user.
- **Body**: `{ email, password, first_name, last_name }`
- **Response**:
```json
{
  "message": "User registered successfully. Please check your email to verify your account.",
  "user": { "id": "uuid", "email": "user@example.com", "first_name": "John", "last_name": "Doe", "subscription_type": "free", "email_verified": false },
  "token": null
}
```
- **Conflict Response (409)**:
```json
{
  "error": "User already exists with this email",
  "code": "USER_EXISTS"
}
```

#### `POST /auth/verify-email`
Verify user's email using the token sent to their inbox.
- **Body**: `{ token }`
- **Response**:
```json
{
  "message": "Email verified successfully",
  "user": { "id": "uuid", "email": "user@example.com", "first_name": "John", "last_name": "Doe", "subscription_type": "free", "email_verified": true },
  "token": "jwt-token-here"
}
```
- **Error Responses**:
  - `400` - `MISSING_TOKEN`: token field not provided
  - `400` - `INVALID_TOKEN`: no user found with this token
  - `400` - `TOKEN_EXPIRED`: token expired (24-hour expiry)
  - `400` - `ALREADY_VERIFIED`: email already verified

#### `POST /auth/resend-verification`
Request a new verification email.
- **Body**: `{ email }`
- **Response**:
```json
{
  "message": "Verification email sent successfully",
  "email": "user@example.com"
}
```
- **Error Responses**:
  - `400` - `MISSING_EMAIL`: email not provided
  - `404` - `USER_NOT_FOUND`: no user with this email
  - `400` - `ALREADY_VERIFIED`: email already verified
  - `500` - `EMAIL_SEND_FAILED`: SMTP failure

#### `GET /auth/verify-email/status`
Check if a user's email has been verified.
- **Query**: `?email=user@example.com`
- **Response**:
```json
{
  "email": "user@example.com",
  "email_verified": true,
  "first_name": "John",
  "last_name": "Doe"
}
```
- **Error Responses**:
  - `400` - `MISSING_EMAIL`: email query parameter not provided
  - `404` - `USER_NOT_FOUND`: no user with this email

#### `POST /auth/login`
Login and receive a token. **Note: Requires email to be verified.**
- **Body**: `{ email, password }`
- **Response**:
```json
{
  "message": "Login successful",
  "user": { "id": "uuid", "email": "...", "subscription_type": "...", "subscription_expires_at": "ISO-Date" },
  "token": "jwt_token_string"
}
```
- **Error Response (403)** - Unverified email:
```json
{
  "error": "Please verify your email before logging in",
  "code": "EMAIL_NOT_VERIFIED",
  "email": "user@example.com"
}
```

#### `GET /auth/profile`
Get current user info (Requires Auth).
- **Response**:
```json
{
  "user": { "id": "uuid", "email": "...", "first_name": "...", "last_name": "...", "subscription_type": "...", "created_at": "...", "last_login_at": "..." }
}
```

---

### 2. Dashboard (`/dashboard`)

#### `GET /dashboard/overview`
High-level metrics and combined activity feed (Requires Auth).
- **Response**:
```json
{
  "overview": {
    "total_resumes": 10,
    "total_applications": 5,
    "analyzed_count": 8,
    "avg_score": 75,
    "monthly_cost": 0.50,
    "applications_this_month": 2,
    "ai_requests_this_month": 12
  },
  "resume_analytics": {
    "score_distribution": { "poor": 1, "average": 5, "good": 2 },
    "top_strengths": ["Clear formatting", "Technical skills"],
    "top_weaknesses": ["Missing metrics"],
    "recent_analyses": [
      { "target_role": "Dev", "target_company": "Comp", "score": 85, "timestamp": "ISO-Date" }
    ]
  },
  "recent_activity": [
    { "type": "resume_upload", "id": "uuid", "description": "Uploaded resume: resume.pdf", "timestamp": "...", "has_analysis": true },
    { "type": "job_application", "id": "uuid", "description": "Applied to dev role at Google", "status": "applied", "timestamp": "..." },
    { "type": "ai_request", "id": "uuid", "description": "AI resume analysis completed", "timestamp": "..." }
  ],
  "subscription_status": "free",
  "subscription_expires_at": null
}
```

---

### 3. Resumes (`/resumes`)

#### `GET /resumes`
List all resumes with their *latest* analysis (Requires Auth).
- **Query**: `?page=1&limit=10`
- **Response**:
```json
{
  "resumes": [
    {
      "id": "uuid",
      "original_filename": "resume.pdf",
      "file_type": "pdf",
      "file_size": 123456,
      "is_processed": true,
      "created_at": "...",
      "latest_analysis": {
        "id": "uuid",
        "target_role": "...",
        "target_company": "...",
        "analysis_results": { "atsScore": 85, ... },
        "created_at": "..."
      }
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
}
```

#### `GET /resumes/:id`
Get a specific resume and its latest analysis (Requires Auth).
- **Response**:
```json
{
  "resume": { "id": "...", "original_filename": "...", "file_type": "...", ... },
  "latest_analysis": { "id": "...", "target_role": "...", "analysis_results": { ... }, "created_at": "..." },
  "has_text": true,
  "text_length": 5000
}
```

#### `GET /resumes/:id/analyses`
Get *all* analyses for a specific resume (historical data) (Requires Auth).
- **Response**:
```json
{
  "analyses": [
    { "id": "uuid", "target_role": "...", "target_company": "...", "analysis_results": { ... }, "created_at": "ISO-Date" }
  ]
}
```

#### `POST /resumes/:id/analyze`
Run a new AI analysis (Requires Auth).
- **Body**: `{ job_description, target_role, target_company }`
- **Response**:
```json
{
  "message": "Resume analysis completed",
  "analysis": { "overview": "...", "strongPoints": [], "weaknesses": [], "atsScore": 80 },
  "metadata": { "tokens_used": 1200, "cost": 0.0001, "model": "..." }
}
```

---

### 4. Job Applications (`/job-applications`)

#### `POST /job-applications`
Create a new application tracker.
- **Body**: `{ company_name, position_title, job_description, application_url, application_deadline, notes }`
- **Response**:
```json
{
  "message": "Job application created successfully",
  "job_application": { "id": "uuid", "company_name": "...", "status": "draft", "created_at": "..." }
}
```

#### `POST /job-applications/:id/cover-letter`
Generate a cover letter.
- **Body**: `{ tone: "professional|casual|enthusiastic", length: "short|medium|long" }`
- **Response**:
```json
{
  "message": "Cover letter generated successfully",
  "cover_letter": "Dear Hiring Manager...",
  "metadata": { "tokens_used": 1500, "cost": 0.0002 }
}
```

#### `GET /job-applications/:id/cover-letter`
Retrieve existing cover letter.
- **Response**:
```json
{
  "cover_letter": "Dear Hiring Manager...",
  "metadata": { "tone": "professional", "length": "medium", "generated_at": "..." }
}
```

---

## Technical Recommendations
- **Email Verification Flow**: After registration, redirect users to a "Check your email" page. The token expires in 24 hours. Use the `GET /auth/verify-email/status` endpoint to poll verification status or wait for the user to click the verification link.
- **Handling Unverified Users**: The `/auth/login` endpoint will return a 403 error with code `EMAIL_NOT_VERIFIED` if the user hasn't verified their email. Show a helpful message directing them to check their inbox or resend the verification email.
- **Transitioning to 1-N**: When displaying resumes, always show the `latest_analysis` by default. Provide a history view using the `GET /resumes/:id/analyses` endpoint.
- **Micro-animations**: Use `framer-motion` for dashboard entry animations.
- **Aesthetics**: Use `lucide-react` for icons and a dark-mode first design for a premium feel.

## Middleware

### `requireVerified`
This middleware ensures that an authenticated user has verified their email. Apply it to any route that should only be accessible to verified users.

- **Response (403)** if email not verified:
```json
{
  "error": "Please verify your email to access this feature",
  "code": "EMAIL_NOT_VERIFIED"
}
```

**Frontend Implementation**: When receiving this error, show a modal or banner prompting the user to verify their email, with a button to resend the verification email.
