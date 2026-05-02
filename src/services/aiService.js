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
    this.simpleModelName =
      process.env.SIMPLE_GEMINI_MODEL || 'gemini-2.5-flash';
    this.mainModel = this.vertexAI.preview.getGenerativeModel({
      model: this.modelName,
    });
    this.simpleModel = this.vertexAI.preview.getGenerativeModel({
      model: this.simpleModelName,
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
      );

      const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are an expert resume analyst and career coach. Analyze resumes for ATS compatibility, keyword optimization, and overall effectiveness. 
              Populate the JSON fields as follows — "overview": a 3-sentence summary of the candidate's fit; "strongPoints": an array of specific strengths and keyword matches; "weaknesses": an array of concrete gaps, ATS issues, missing keywords, and actionable fixes; "atsScore": a numeric score from 1 to 10. 
              Be specific and concise — each array item should be one clear sentence. You MUST generate the analysis in the following language: ${LOCALES[locale]}.`,
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
              recruiter_perspective: { type: 'string' },
            },
          },
        },
      };

      const result = await this.mainModel.generateContent(request);
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

  async analyzeResumeInstantaneous(resumeText, locale) {
    try {
      const prompt = this.buildInstantResumeAnalysisPrompt(resumeText);

      const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are an expert resume analyst. 
              Given a resume, return a single specific, actionable tip that would most improve its ATS score, and a numeric ATS score from 1 to 10.
              Be direct and concrete — one sentence for the tip. You MUST respond in the following language: ${LOCALES[locale]}.`,
            },
          ],
        },
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            required: ['tip', 'atsScore'],
            properties: {
              tip: { type: 'string' },
              atsScore: { type: 'number' },
            },
          },
        },
      };

      const result = await this.simpleModel.generateContent(request);
      const response = await result.response;
      const analysis = JSON.parse(response.candidates[0].content.parts[0].text);

      const usageMetadata = response.usageMetadata;
      const tokensUsed =
        (usageMetadata.promptTokenCount || 0) +
        (usageMetadata.candidatesTokenCount || 0);
      const cost = this.calculateCost(tokensUsed, this.simpleModelName);

      return {
        analysis,
        tokensUsed,
        cost,
        model: this.simpleModelName,
      };
    } catch (error) {
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

      const result = await this.mainModel.generateContent(request);
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
    resumeMetadata,
    jobDescription,
    targetRole = null,
    targetCompany = null,
    userId = null,
    locale = 'en',
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
        resumeMetadata,
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
              text: `You are an expert resume optimizer. Your ONLY task is to improve the wording, phrasing, and keyword alignment of existing resume content to better match job requirements. 
              You must NEVER invent, fabricate, or hallucinate any information. 
              You must NEVER change personal information such as name, email, phone, location, website, or social network usernames — return them exactly as provided. 
              You must NEVER add work experiences, companies, job titles, education institutions, degrees, dates, or skills that do not exist in the original resume. Only enhance the language of what already exists. 
              You must generate the optimized resume in the following language: ${LOCALES[locale]}.`,
            },
          ],
        },
        generationConfig: {
          maxOutputTokens: 10000,
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            required: ['name', 'location', 'email', 'phone', 'sections'],
            properties: {
              name: { type: 'string' },
              location: { type: 'string' },
              email: { type: 'string' },
              phone: {
                type: 'string',
                description: 'Phone number in E.164 format (e.g., +1234567890)',
              },
              website: { type: 'string' },
              social_networks: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['network', 'username'],
                  properties: {
                    network: { type: 'string' },
                    username: { type: 'string' },
                  },
                },
              },
              sections: {
                type: 'object',
                required: [
                  'summary',
                  'experience',
                  'education',
                  'skills',
                  'custom',
                ],
                properties: {
                  summary: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  experience: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: [
                        'company',
                        'position',
                        'location',
                        'start_date',
                        'end_date',
                        'highlights',
                      ],
                      properties: {
                        company: { type: 'string' },
                        position: { type: 'string' },
                        location: { type: 'string' },
                        start_date: { type: 'string' },
                        end_date: { type: 'string' },
                        highlights: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
                    },
                  },
                  education: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: [
                        'institution',
                        'area',
                        'degree',
                        'location',
                        'start_date',
                        'end_date',
                      ],
                      properties: {
                        institution: { type: 'string' },
                        area: { type: 'string' },
                        degree: { type: 'string' },
                        location: { type: 'string' },
                        start_date: { type: 'string' },
                        end_date: { type: 'string' },
                      },
                    },
                  },
                  skills: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['label', 'details'],
                      properties: {
                        label: { type: 'string' },
                        details: { type: 'string' },
                      },
                    },
                  },
                  custom: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['title', 'content'],
                      properties: {
                        title: { type: 'string' },
                        content: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = await this.mainModel.generateContent(request);
      const response = await result.response;
      const optimizedResume = JSON.parse(
        response.candidates[0].content.parts[0].text,
      );

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
    let prompt = `Analyze the resume below against the provided job description.\n\n`;
    prompt += `JOB DESCRIPTION:\n${jobDescription}\n\n`;

    if (targetRole) {
      prompt += `TARGET ROLE: ${targetRole}\n`;
    }
    if (targetCompany) {
      prompt += `TARGET COMPANY: ${targetCompany}\n`;
    }

    prompt += `\nRESUME:\n${resumeText}\n\n`;
    prompt += `Populate the JSON response fields:\n`;
    prompt += `- "atsScore": rate ATS compatibility from 1 (poor) to 10 (excellent).\n`;
    prompt += `- "overview": 3 sentences summarizing overall fit for the role.\n`;
    prompt += `- "strongPoints": list each keyword match, relevant skill, and content strength as a separate item.\n`;
    prompt += `- "weaknesses": list each ATS issue, missing keyword, content gap, and specific actionable fix as a separate item.\n`;
    prompt += `Base every point strictly on the resume and job description provided — do not reference external assumptions.`;

    return prompt;
  }

  buildInstantResumeAnalysisPrompt(resumeText) {
    let prompt = `Score this resume for ATS compatibility (1–10) and identify the single highest-impact improvement the candidate should make.\n\n`;
    prompt += `RESUME:\n${resumeText}\n\n`;
    prompt += `Populate "atsScore" with the numeric score and "tip" with one concrete, specific sentence describing the top improvement.`;

    return prompt;
  }

  buildCoverLetterPrompt(
    resumeText,
    jobDescription,
    companyName,
    positionTitle,
    tone,
    length,
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

    let prompt = `Write a cover letter for the ${positionTitle} position at ${companyName}.\n\n`;
    prompt += `TONE: ${toneInstructions[tone] ?? 'Use a formal, professional tone'}\n`;
    prompt += `LENGTH: ${lengthInstructions[length] ?? 'Write a standard length cover letter (150-250 words)'}\n\n`;
    prompt += `JOB DESCRIPTION:\n${jobDescription}\n\n`;
    prompt += `CANDIDATE'S RESUME:\n${resumeText}\n\n`;
    prompt += `Requirements:\n`;
    prompt += `- Address it to the hiring manager\n`;
    prompt += `- Highlight 2-3 of the candidate's most relevant experiences drawn directly from the resume above\n`;
    prompt += `- Reference specific details from the job description to show understanding of the role — do not invent facts about the company\n`;
    prompt += `- Include a strong opening hook\n`;
    prompt += `- End with a clear call to action\n`;
    prompt += `- Only use achievements and metrics that appear in the resume — do not fabricate numbers or results\n`;
    prompt += `- Do not include placeholders like [Your Name] or [Date]`;

    return prompt;
  }

  buildResumeOptimizationPrompt(
    resumeMetadata,
    jobDescription,
    targetRole,
    locale = 'en',
  ) {
    const resume = resumeMetadata.cv;
    const resumeContent =
      typeof resume === 'object' ? JSON.stringify(resume, null, 2) : resume;

    let prompt = `Optimize the following resume to better match the job description below.\n\n`;
    prompt += `JOB DESCRIPTION:\n${jobDescription}\n\n`;

    if (targetRole) {
      prompt += `TARGET ROLE: ${targetRole}\n\n`;
    }

    prompt += `ORIGINAL RESUME DATA (treat this as the single source of truth):\n${resumeContent}\n\n`;
    prompt += `STRICT RULES — follow all of these without exception:\n`;
    prompt += `1. Personal info is READ-ONLY: return name, email, phone, location, website, and social network usernames EXACTLY as they appear in the original — do not alter, correct, or reformat them.\n`;
    prompt += `2. Do NOT invent or fabricate anything: never add companies, job titles, employers, education institutions, degrees, certifications, dates, or skills that are absent from the original data.\n`;
    prompt += `3. Do NOT remove entries: every work experience, education item, skill, and custom section present in the original must appear in the output.\n`;
    prompt += `4. Only improve wording: you may rewrite the summary, job highlight bullet points, and skill descriptions using strong action verbs and relevant keywords from the job description.\n`;
    prompt += `5. Preserve all dates, company names, job titles, institution names, and degree names exactly as written in the original.\n`;
    prompt += `6. Return the result in the following language: ${LOCALES[locale]}.\n`;
    prompt += `Return only the optimized JSON object, no additional commentary.`;

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
