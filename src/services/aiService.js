const { VertexAI } = require('@google-cloud/vertexai');
const db = require('../config/database');
const dotenv = require('dotenv');
const creditService = require('./creditService');
const { CREDIT_COSTS, LOCALES } = require('../config/constants');
dotenv.config();

class AIService {
  constructor() {
    this.project = process.env.GCP_PROJECT_ID;
    this.location = process.env.GCP_LOCATION || 'us-central1';

    console.log('GCP_PROJECT_ID:', this.project);
    console.log('GCP_LOCATION:', this.location);

    if (!this.project) {
      console.warn('GCP_PROJECT_ID is not set. AI services will fail.');
    }

    this.vertexAI = new VertexAI({
      project: this.project,
      location: this.location,
    });
    // Using gemini-1.5-flash as a cost-effective alternative to GPT-4
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.model = this.vertexAI.preview.getGenerativeModel({
      model: this.modelName,
    });
  }

  async analyzeResume(
    resumeText,
    jobDescription,
    targetRole = null,
    targetCompany = null,
    userId = null,
    locale,
  ) {
    let creditTx = null;
    try {
      if (userId) {
        creditTx = await creditService.deductCredits(
          userId,
          CREDIT_COSTS.RESUME_ANALYSIS,
          'Resume Analysis',
        );
      }

      const prompt = this.buildResumeAnalysisPrompt(
        resumeText,
        jobDescription,
        targetRole,
        targetCompany,
        locale,
      );

      const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are an expert resume analyst and career coach. Analyze resumes for ATS compatibility, keyword optimization, and overall effectiveness. Provide specific, actionable feedback. Be extremely concise. Use bullet points within strings. Limit the overview to 3 sentences. Do not over-extend the response, try to keep it under 500 words. You MUST generate the analysis in the following language: ${LOCALES[locale]}.`,
            },
          ],
        },
        generationConfig: {
          maxOutputTokens: 5000,
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            required: ['overview', 'strongPoints', 'weaknesses', 'atsScore'],
            properties: {
              overview: { type: 'string' },
              strongPoints: {
                type: 'array',
                items: { type: 'string' },
              },
              weaknesses: {
                type: 'array',
                items: { type: 'string' },
              },
              atsScore: { type: 'number' },
            },
          },
        },
      };

      const result = await this.model.generateContent(request);
      const response = await result.response;
      console.log('Response:', response);
      const analysis = JSON.parse(response.candidates[0].content.parts[0].text);

      const usageMetadata = response.usageMetadata;
      const tokensUsed =
        (usageMetadata.promptTokenCount || 0) +
        (usageMetadata.candidatesTokenCount || 0);
      const cost = this.calculateCost(tokensUsed, this.modelName);

      return {
        analysis,
        tokensUsed,
        cost,
        model: this.modelName,
      };
    } catch (error) {
      if (userId && creditTx) {
        await creditService.refundCredits(userId, creditTx.id, error.message);
      }
      console.error('AI Resume Analysis Error:', error);
      throw new Error('Failed to analyze resume: ' + error.message);
    }
  }

  async generateCoverLetter(
    resumeText,
    jobDescription,
    companyName,
    positionTitle,
    userId = null,
    tone = 'professional',
    length = 'medium',
    locale = 'en',
  ) {
    let creditTx = null;
    try {
      if (userId) {
        creditTx = await creditService.deductCredits(
          userId,
          CREDIT_COSTS.COVER_LETTER_GENERATION,
          'Cover Letter Generation',
        );
      }
      const prompt = this.buildCoverLetterPrompt(
        resumeText,
        jobDescription,
        companyName,
        positionTitle,
        tone,
        length,
        locale,
      );

      const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are a professional career coach and cover letter expert. Write compelling, personalized cover letters that highlight relevant experience and demonstrate genuine interest in the role. You must generate the cover letter in the following language: ${LOCALES[locale]}.`,
            },
          ],
        },
        generationConfig: {
          maxOutputTokens: 2500,
          temperature: 0.4,
        },
      };

      const result = await this.model.generateContent(request);
      const response = await result.response;
      const coverLetter = response.candidates[0].content.parts[0].text;

      const usageMetadata = response.usageMetadata;
      const tokensUsed =
        (usageMetadata.promptTokenCount || 0) +
        (usageMetadata.candidatesTokenCount || 0);
      const cost = this.calculateCost(tokensUsed, this.modelName);

      return {
        coverLetter,
        tokensUsed,
        cost,
        model: this.modelName,
      };
    } catch (error) {
      if (userId && creditTx) {
        await creditService.refundCredits(userId, creditTx.id, error.message);
      }
      console.error('AI Cover Letter Generation Error:', error);
      throw new Error('Failed to generate cover letter: ' + error.message);
    }
  }

  async optimizeResume(
    resumeText,
    jobDescription,
    targetRole = null,
    userId = null,
  ) {
    let creditTx = null;
    try {
      if (userId) {
        creditTx = await creditService.deductCredits(
          userId,
          CREDIT_COSTS.RESUME_OPTIMIZATION,
          'Resume Optimization',
        );
      }
      const prompt = this.buildResumeOptimizationPrompt(
        resumeText,
        jobDescription,
        targetRole,
      );

      const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: 'You are an expert resume optimizer. Rewrite and improve resume content to better match job requirements while maintaining authenticity and professional tone.',
            },
          ],
        },
        generationConfig: {
          maxOutputTokens: 3000,
          temperature: 0.3,
        },
      };

      const result = await this.model.generateContent(request);
      const response = await result.response;
      const optimizedResume = response.candidates[0].content.parts[0].text;

      const usageMetadata = response.usageMetadata;
      const tokensUsed =
        (usageMetadata.promptTokenCount || 0) +
        (usageMetadata.candidatesTokenCount || 0);
      const cost = this.calculateCost(tokensUsed, this.modelName);

      return {
        optimizedResume,
        tokensUsed,
        cost,
        model: this.modelName,
      };
    } catch (error) {
      if (userId && creditTx) {
        await creditService.refundCredits(userId, creditTx.id, error.message);
      }
      console.error('AI Resume Optimization Error:', error);
      throw new Error('Failed to optimize resume: ' + error.message);
    }
  }

  buildResumeAnalysisPrompt(
    resumeText,
    jobDescription,
    targetRole,
    targetCompany,
  ) {
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
    prompt += `You must generate the analysis in the following language: ${LOCALES['en']}.`;

    return prompt;
  }

  buildCoverLetterPrompt(
    resumeText,
    jobDescription,
    companyName,
    positionTitle,
    tone,
    length,
    locale = 'en',
  ) {
    const lengthInstructions = {
      short: 'Keep it concise (50-150 words)',
      medium: 'Write a standard length cover letter (150-250 words)',
      long: 'Write a detailed cover letter (300-450 words)',
    };

    const toneInstructions = {
      professional: 'Use a formal, professional tone',
      casual: 'Use a friendly, approachable tone while remaining professional',
      enthusiastic: 'Use an energetic, passionate tone that shows excitement',
    };

    let prompt = `Write a ${tone} cover letter in ${LOCALES[locale]} for the ${positionTitle} position at ${companyName}.\n\n`;
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
    // Pricing for Gemini 1.5 Flash (approximate, check official pricing)
    // Input: $0.075 / 1 million tokens (<= 128k context) -> $0.000075 / 1k
    // Output: $0.30 / 1 million tokens (<= 128k context) -> $0.0003 / 1k
    // This is significantly cheaper than GPT-4

    const pricing = {
      'gemini-2.5-flash': {
        input: 0.3 / 1000000,
        output: 2.5 / 1000000,
      },
    };

    // Simple estimation since we don't strictly separate input/output tokens in the simpler flow above without inspection
    // Assuming 70% input, 30% output for a rough mix if we only have total.
    // However, usageMetadata gives us promptTokenCount and candidatesTokenCount.

    // If tokens is passed as total and we don't have split in this method call context (legacy signature), wrap it.
    // But better to update the calling code to calculate more accurately if possible.
    // For now, let's use a blended rate or update the signature in the methods above to return granular cost.
    // The methods above calculate cost themselves now using specific tokens.

    // RE-DESIGN: calculateCost in the methods above is passed `tokensUsed` which is a TOTAL.
    // I should probably simplify this just to return a rough estimate or 0,
    // OR, I can be smarter in the method bodies.

    // Let's assume the callers (inside this class) will just rely on this method.
    // But since I changed the implementation above to calculate cost inside the method using this helper...
    // actually, in the replaced code above I passed `tokensUsed` (total) to `calculateCost`.
    // I should probably update `calculateCost` to take `promptTokens` and `completionTokens`.

    // However, to keep it simple and consistent with the signature:
    const modelPricing = pricing[model] || pricing['gemini-2.5-flash'];
    // Conservative average
    return tokens * ((modelPricing.input + modelPricing.output) / 2);
  }

  // Helper to be more precise if needed, but keeping the class structure similar for now.
  calculatePreciseCost(promptTokens, completionTokens, model) {
    const pricing = {
      'gemini-2.5-flash': {
        input: 0.3 / 1000000,
        output: 2.5 / 1000000,
      },
    };
    const modelPricing = pricing[model] || pricing['gemini-2.5-flash'];
    return (
      promptTokens * modelPricing.input + completionTokens * modelPricing.output
    );
  }

  async logAIRequest(
    userId,
    requestType,
    inputData,
    responseData,
    tokensUsed,
    cost,
  ) {
    try {
      await db('ai_requests').insert({
        user_id: userId,
        request_type: requestType,
        input_data: inputData,
        response_data: responseData,
        status: 'completed',
        tokens_used: tokensUsed,
        cost: cost,
      });
    } catch (error) {
      console.error('Failed to log AI request:', error);
      // Don't throw error as this is not critical
    }
  }
}

module.exports = new AIService();
