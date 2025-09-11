# Resume AI API Testing Guide

This guide will help you test the Resume AI API using the provided Postman collection.

## 🚀 Quick Start

### 1. Import Collection and Environment

1. **Import Collection:**
   - Open Postman
   - Click "Import" button
   - Select `Resume-AI-API.postman_collection.json`

2. **Import Environment:**
   - Click "Import" button
   - Select `Resume-AI-API.postman_environment.json`
   - Select the "Resume AI API Environment" from the environment dropdown

### 2. Start the Backend Server

```bash
# Install dependencies
npm install

# Set up environment variables
cp env.example .env
# Edit .env with your database and OpenAI API credentials

# Set up database
npm run migrate

# Start the server
npm run dev
```

### 3. Test the API

## 📋 Testing Workflow

### Step 1: Health Check
- Run `Health Check` request
- Should return 200 with server status

### Step 2: Authentication
1. **Register a new user:**
   - Run `Authentication > Register User`
   - Check that auth token is automatically saved
   - User ID should be saved to environment

2. **Login (optional):**
   - Run `Authentication > Login User`
   - Use the same credentials as registration

3. **Get Profile:**
   - Run `Authentication > Get Profile`
   - Should return user information

### Step 3: Resume Management
1. **Upload Resume:**
   - Run `Resume Management > Upload Resume`
   - Update the file path to point to a real PDF/DOCX file
   - Resume ID should be automatically saved

2. **Get Resumes:**
   - Run `Resume Management > Get All Resumes`
   - Should return list of uploaded resumes

3. **Analyze Resume:**
   - Run `Resume Management > Analyze Resume`
   - This will use AI to analyze the resume
   - Requires OpenAI API key in .env

4. **Get Resume Text:**
   - Run `Resume Management > Get Resume Text`
   - Should return extracted text from the resume

### Step 4: Job Applications
1. **Create Job Application:**
   - Run `Job Applications > Create Job Application`
   - Job application ID should be automatically saved

2. **Generate Cover Letter:**
   - Run `Job Applications > Generate Cover Letter`
   - This will use AI to generate a personalized cover letter
   - Requires OpenAI API key in .env

3. **Get Cover Letter:**
   - Run `Job Applications > Get Cover Letter`
   - Should return the generated cover letter

4. **Update Application:**
   - Run `Job Applications > Update Job Application`
   - Change status to "applied" or other status

### Step 5: Dashboard
1. **Get Dashboard Overview:**
   - Run `Dashboard > Get Dashboard Overview`
   - Should return usage statistics and recent activity

2. **Get AI Usage:**
   - Run `Dashboard > Get AI Usage Statistics`
   - Should return AI request statistics

3. **Get Subscription Status:**
   - Run `Dashboard > Get Subscription Status`
   - Should return current subscription and limits

## 🔧 Environment Variables

The collection uses these environment variables:

- `base_url`: API base URL (default: http://localhost:3000)
- `auth_token`: JWT token (automatically set after login/register)
- `user_id`: Current user ID (automatically set)
- `resume_id`: Current resume ID (automatically set after upload)
- `job_application_id`: Current job application ID (automatically set)

## 📁 Sample Files

For testing file uploads, you can use any PDF or DOCX file. Here are some suggestions:

1. **Create a sample resume PDF:**
   - Use any resume template
   - Include sections: Contact Info, Summary, Experience, Education, Skills
   - Save as PDF

2. **Sample job description:**
   ```json
   {
     "job_description": "We are looking for a Senior Software Engineer with 5+ years of experience in Node.js, React, and PostgreSQL. The ideal candidate should have experience with AI/ML integration, microservices architecture, and cloud deployment. Responsibilities include developing scalable web applications, mentoring junior developers, and collaborating with cross-functional teams."
   }
   ```

## 🧪 Error Testing

The collection includes error testing requests:

1. **Invalid Registration:**
   - Tests validation errors
   - Should return 400 with validation details

2. **Unauthorized Access:**
   - Tests protected endpoints without auth
   - Should return 401

3. **Invalid File Upload:**
   - Tests file type validation
   - Should return 400 for invalid file types

## 📊 Expected Responses

### Successful Registration (201):
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "email": "test@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "subscription_type": "free"
  },
  "token": "jwt_token_here"
}
```

### Successful Resume Upload (201):
```json
{
  "message": "Resume uploaded and processed successfully",
  "resume": {
    "id": "uuid",
    "original_filename": "resume.pdf",
    "file_type": "pdf",
    "file_size": 12345,
    "created_at": "2024-01-15T10:30:00Z",
    "text_length": 1500
  }
}
```

### AI Analysis Response:
```json
{
  "message": "Resume analysis completed",
  "analysis": "Detailed AI analysis of the resume...",
  "metadata": {
    "tokens_used": 1500,
    "cost": 0.045,
    "model": "gpt-4"
  }
}
```

## 🚨 Common Issues

1. **401 Unauthorized:**
   - Make sure you're logged in
   - Check that auth token is set in environment

2. **500 Internal Server Error:**
   - Check server logs
   - Verify database connection
   - Ensure OpenAI API key is set

3. **File Upload Issues:**
   - Make sure file path is correct
   - Check file size (max 10MB)
   - Ensure file is PDF or DOCX

4. **Database Errors:**
   - Run migrations: `npm run migrate`
   - Check database connection in .env

## 🔄 Testing Different Scenarios

### Free Tier Testing:
- Upload 3 resumes (should work)
- Try to upload 4th resume (should fail with limit)
- Generate cover letters (should work within limits)

### Pro Tier Testing:
- Update user subscription in database to 'pro'
- Test unlimited resume uploads
- Test resume optimization feature

### AI Integration Testing:
- Test with different job descriptions
- Test different cover letter tones (professional, casual, enthusiastic)
- Test different cover letter lengths (short, medium, long)

## 📈 Performance Testing

1. **Load Testing:**
   - Use Postman Runner to run multiple requests
   - Test concurrent file uploads
   - Monitor response times

2. **Rate Limiting:**
   - Send multiple requests quickly
   - Should hit rate limit after 100 requests per 15 minutes

## 🎯 Next Steps

After testing the API:

1. **Frontend Development:**
   - Use these endpoints in your React frontend
   - Implement proper error handling
   - Add loading states for AI operations

2. **Production Deployment:**
   - Set up production database
   - Configure environment variables
   - Set up monitoring and logging

3. **Additional Features:**
   - Add more AI analysis types
   - Implement email notifications
   - Add resume templates

Happy testing! 🚀
