# AI-Powered Resume & Job Application Assistant - Backend

A comprehensive Node.js backend for an AI-powered resume analysis and job application platform.

## Features

- **User Authentication**: JWT-based authentication with user registration and login
- **Resume Processing**: Upload and parse PDF/DOCX resumes with text extraction
- **AI-Powered Analysis**: Resume analysis using OpenAI GPT-4 for ATS optimization
- **Cover Letter Generation**: AI-generated personalized cover letters
- **Resume Optimization**: AI-powered resume improvement suggestions
- **Job Application Management**: Track and manage job applications
- **Dashboard Analytics**: Usage statistics and activity tracking
- **Subscription Management**: Free and Pro tier support

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL with Knex.js ORM
- **Authentication**: JWT (jsonwebtoken)
- **File Processing**: multer, pdf-parse, mammoth
- **AI Integration**: OpenAI GPT-4 API
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate Limiting

## Prerequisites

- Node.js 18 or higher
- PostgreSQL 12 or higher
- OpenAI API key

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd resume-ai-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=resume_ai_db
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password

   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_EXPIRES_IN=7d

   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key_here

   # Email Configuration (SMTP)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_app_password
   SMTP_FROM_NAME=Haku AI Resume Assistant

   # Frontend URL (for verification links)
   FRONTEND_URL=http://localhost:3001

   # File Upload Configuration
   MAX_FILE_SIZE=10485760
   UPLOAD_PATH=./uploads
   ```

4. **Set up the database**
   ```bash
   # Create the database
   createdb resume_ai_db
   
   # Run migrations
   npm run migrate
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration (sends verification email)
- `POST /api/auth/login` - User login (requires email verification)
- `POST /api/auth/verify-email` - Verify email with token
- `POST /api/auth/resend-verification` - Resend verification email
- `GET /api/auth/verify-email/status` - Check verification status
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/change-password` - Change password
- `POST /api/auth/logout` - Logout

### Resume Management
- `POST /api/resumes/upload` - Upload resume (PDF/DOCX)
- `POST /api/resumes/analyze` - Analyze resume with AI
- `POST /api/resumes/optimize` - Optimize resume (Pro only)
- `GET /api/resumes` - Get user's resumes
- `GET /api/resumes/:id` - Get specific resume
- `GET /api/resumes/:id/text` - Get resume text
- `DELETE /api/resumes/:id` - Delete resume

### Job Applications
- `POST /api/job-applications` - Create job application
- `POST /api/job-applications/:id/cover-letter` - Generate cover letter
- `GET /api/job-applications` - Get job applications
- `GET /api/job-applications/:id` - Get specific application
- `PUT /api/job-applications/:id` - Update application
- `DELETE /api/job-applications/:id` - Delete application
- `GET /api/job-applications/:id/cover-letter` - Get cover letter

### Dashboard
- `GET /api/dashboard/overview` - Dashboard overview
- `GET /api/dashboard/ai-usage` - AI usage statistics
- `GET /api/dashboard/subscription` - Subscription status
- `GET /api/dashboard/activity` - Recent activity feed

## Database Schema

### Users Table
- `id` (UUID, Primary Key)
- `email` (String, Unique)
- `password_hash` (String)
- `first_name` (String)
- `last_name` (String)
- `subscription_type` (Enum: 'free', 'pro')
- `subscription_expires_at` (Timestamp)
- `is_active` (Boolean)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

### Resumes Table
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `original_filename` (String)
- `file_path` (String)
- `file_type` (String)
- `file_size` (Integer)
- `extracted_text` (Text)
- `analysis_results` (JSON)
- `is_processed` (Boolean)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

### Job Applications Table
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `resume_id` (UUID, Foreign Key)
- `company_name` (String)
- `position_title` (String)
- `job_description` (Text)
- `application_url` (String)
- `application_deadline` (Timestamp)
- `status` (Enum: 'draft', 'applied', 'interview', 'rejected', 'accepted')
- `notes` (Text)
- `cover_letter_data` (JSON)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

### AI Requests Table
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `request_type` (Enum: 'resume_analysis', 'cover_letter_generation', 'resume_optimization')
- `input_data` (JSON)
- `response_data` (JSON)
- `status` (String)
- `tokens_used` (Integer)
- `cost` (Decimal)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

## Subscription Tiers

### Free Tier
- 3 resume uploads
- 5 job applications
- 10 AI requests per month
- Basic resume analysis
- Cover letter generation

### Pro Tier ($10-15/month)
- Unlimited resume uploads
- Unlimited job applications
- Unlimited AI requests
- Advanced resume analysis
- Resume optimization
- Priority support

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- **Email verification** - Users must verify their email before accessing the platform
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation with Joi
- File type and size validation

## Error Handling

Comprehensive error handling with:
- Structured error responses
- HTTP status codes
- Error codes for client handling
- Detailed logging
- Graceful degradation

## Development

```bash
# Run in development mode
npm run dev

# Run migrations
npm run migrate

# Run seeds
npm run seed

# Run tests
npm test
```

## Production Deployment

1. Set up PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Start the application with PM2 or similar process manager

```bash
# Production start
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details
