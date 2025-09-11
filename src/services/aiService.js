const OpenAI = require('openai');
const db = require('../config/database');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async analyzeResume(resumeText, jobDescription, targetRole = null, targetCompany = null) {
    try {
      const prompt = this.buildResumeAnalysisPrompt(resumeText, jobDescription, targetRole, targetCompany);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert resume analyst and career coach. Analyze resumes for ATS compatibility, keyword optimization, and overall effectiveness. Provide specific, actionable feedback."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      });

      const analysis = response.choices[0].message.content;
      const tokensUsed = response.usage.total_tokens;
      const cost = this.calculateCost(tokensUsed, 'gpt-4');

      return {
        analysis,
        tokensUsed,
        cost,
        model: 'gpt-4'
      };
    } catch (error) {
      console.error('AI Resume Analysis Error:', error);
      throw new Error('Failed to analyze resume: ' + error.message);
    }
  }

  async generateCoverLetter(resumeText, jobDescription, companyName, positionTitle, tone = 'professional', length = 'medium') {
    try {
      const prompt = this.buildCoverLetterPrompt(resumeText, jobDescription, companyName, positionTitle, tone, length);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a professional career coach and cover letter expert. Write compelling, personalized cover letters that highlight relevant experience and demonstrate genuine interest in the role."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.4
      });

      const coverLetter = response.choices[0].message.content;
      const tokensUsed = response.usage.total_tokens;
      const cost = this.calculateCost(tokensUsed, 'gpt-4');

      return {
        coverLetter,
        tokensUsed,
        cost,
        model: 'gpt-4'
      };
    } catch (error) {
      console.error('AI Cover Letter Generation Error:', error);
      throw new Error('Failed to generate cover letter: ' + error.message);
    }
  }

  async optimizeResume(resumeText, jobDescription, targetRole = null) {
    try {
      const prompt = this.buildResumeOptimizationPrompt(resumeText, jobDescription, targetRole);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert resume optimizer. Rewrite and improve resume content to better match job requirements while maintaining authenticity and professional tone."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 3000,
        temperature: 0.3
      });

      const optimizedResume = response.choices[0].message.content;
      const tokensUsed = response.usage.total_tokens;
      const cost = this.calculateCost(tokensUsed, 'gpt-4');

      return {
        optimizedResume,
        tokensUsed,
        cost,
        model: 'gpt-4'
      };
    } catch (error) {
      console.error('AI Resume Optimization Error:', error);
      throw new Error('Failed to optimize resume: ' + error.message);
    }
  }

  buildResumeAnalysisPrompt(resumeText, jobDescription, targetRole, targetCompany) {
    let prompt = `Please analyze this resume for the following job description:\n\n`;
    prompt += `JOB DESCRIPTION:\n${jobDescription}\n\n`;
    
    if (targetRole) {
      prompt += `TARGET ROLE: ${targetRole}\n`;
    }
    if (targetCompany) {
      prompt += `TARGET COMPANY: ${targetCompany}\n`;
    }
    
    prompt += `\nRESUME TO ANALYZE:\n${resumeText}\n\n`;
    prompt += `Please provide a comprehensive analysis including:\n`;
    prompt += `1. ATS Compatibility Score (1-10) and specific issues\n`;
    prompt += `2. Keyword Match Analysis - missing important keywords\n`;
    prompt += `3. Content Quality Assessment\n`;
    prompt += `4. Format and Structure Issues\n`;
    prompt += `5. Specific Improvement Recommendations\n`;
    prompt += `6. Overall Strengths and Weaknesses\n`;
    prompt += `Format your response as a structured analysis with clear sections.`;

    return prompt;
  }

  buildCoverLetterPrompt(resumeText, jobDescription, companyName, positionTitle, tone, length) {
    const lengthInstructions = {
      short: 'Keep it concise (150-200 words)',
      medium: 'Write a standard length cover letter (250-350 words)',
      long: 'Write a detailed cover letter (400-500 words)'
    };

    const toneInstructions = {
      professional: 'Use a formal, professional tone',
      casual: 'Use a friendly, approachable tone while remaining professional',
      enthusiastic: 'Use an energetic, passionate tone that shows excitement'
    };

    let prompt = `Write a ${tone} cover letter for the ${positionTitle} position at ${companyName}.\n\n`;
    prompt += `TONE: ${toneInstructions[tone]}\n`;
    prompt += `LENGTH: ${lengthInstructions[length]}\n\n`;
    prompt += `JOB DESCRIPTION:\n${jobDescription}\n\n`;
    prompt += `CANDIDATE'S RESUME:\n${resumeText}\n\n`;
    prompt += `Requirements:\n`;
    prompt += `- Address it to the hiring manager\n`;
    prompt += `- Highlight 2-3 most relevant experiences from the resume\n`;
    prompt += `- Show knowledge of the company/role\n`;
    prompt += `- Include a strong opening hook\n`;
    prompt += `- End with a clear call to action\n`;
    prompt += `- Use specific examples and metrics where possible\n`;
    prompt += `- Make it personalized and authentic\n`;
    prompt += `- Do not include placeholders like [Your Name] or [Date]`;

    return prompt;
  }

  buildResumeOptimizationPrompt(resumeText, jobDescription, targetRole) {
    let prompt = `Please optimize this resume for the following job description:\n\n`;
    prompt += `JOB DESCRIPTION:\n${jobDescription}\n\n`;
    
    if (targetRole) {
      prompt += `TARGET ROLE: ${targetRole}\n`;
    }
    
    prompt += `\nCURRENT RESUME:\n${resumeText}\n\n`;
    prompt += `Please provide an optimized version that:\n`;
    prompt += `1. Incorporates relevant keywords from the job description\n`;
    prompt += `2. Emphasizes experience that matches job requirements\n`;
    prompt += `3. Uses strong action verbs and quantifiable achievements\n`;
    prompt += `4. Maintains professional formatting and structure\n`;
    prompt += `5. Keeps the same overall content but improves presentation\n`;
    prompt += `6. Ensures ATS compatibility\n`;
    prompt += `Return only the optimized resume content, no additional commentary.`;

    return prompt;
  }

  calculateCost(tokens, model) {
    const pricing = {
      'gpt-4': {
        input: 0.03 / 1000,  // $0.03 per 1K input tokens
        output: 0.06 / 1000  // $0.06 per 1K output tokens
      },
      'gpt-3.5-turbo': {
        input: 0.001 / 1000,
        output: 0.002 / 1000
      }
    };

    // Rough estimation - in practice, you'd track input/output separately
    const modelPricing = pricing[model] || pricing['gpt-4'];
    return tokens * ((modelPricing.input + modelPricing.output) / 2);
  }

  async logAIRequest(userId, requestType, inputData, responseData, tokensUsed, cost) {
    try {
      await db('ai_requests').insert({
        user_id: userId,
        request_type: requestType,
        input_data: inputData,
        response_data: responseData,
        status: 'completed',
        tokens_used: tokensUsed,
        cost: cost
      });
    } catch (error) {
      console.error('Failed to log AI request:', error);
      // Don't throw error as this is not critical
    }
  }
}

module.exports = new AIService();
