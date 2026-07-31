const db = require('../config/database');
const dotenv = require('dotenv');
const creditService = require('./creditService');
const { CREDIT_COSTS, LOCALES } = require('../config/constants');
const { getCurrentLocaleStringDate, parseModelJSON } = require('../utils');
const { GoogleGenAI } = require('@google/genai');
dotenv.config();

// LLM structured output isn't guaranteed to match responseSchema exactly (e.g. it may
// wrap personal fields under "personal_information" instead of returning them flat).
// Coerce whatever comes back into the exact shape the frontend's ResumeData zod schema
// requires, so a schema drift degrades to empty fields instead of crashing the builder.
const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizeExtractedCv = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const personal =
    source.personal_information ||
    source.personal_info ||
    source.contact_information ||
    source;
  const sections = source.sections || source;

  return {
    name: personal.name ?? source.name ?? '',
    location: personal.location ?? source.location ?? '',
    email: personal.email ?? source.email ?? '',
    phone: personal.phone ?? source.phone ?? '',
    website: personal.website ?? source.website ?? '',
    social_networks: toArray(
      personal.social_networks ?? source.social_networks,
    ).map((sn) => ({
      network: sn?.network ?? '',
      username: sn?.username ?? '',
    })),
    sections: {
      summary: toArray(sections.summary),
      experience: toArray(sections.experience).map((exp) => ({
        company: exp?.company ?? '',
        position: exp?.position ?? '',
        location: exp?.location ?? '',
        start_date: exp?.start_date ?? '',
        end_date: exp?.end_date ?? '',
        highlights: toArray(exp?.highlights),
      })),
      education: toArray(sections.education).map((edu) => ({
        institution: edu?.institution ?? '',
        area: edu?.area ?? '',
        degree: edu?.degree ?? '',
        location: edu?.location ?? '',
        start_date: edu?.start_date ?? '',
        end_date: edu?.end_date ?? '',
      })),
      skills: toArray(sections.skills).map((skill) => ({
        label: skill?.label ?? '',
        details: skill?.details ?? '',
      })),
      custom: toArray(sections.custom).map((custom) => ({
        title: custom?.title ?? '',
        content: toArray(custom?.content),
      })),
    },
  };
};

class AIService {
  constructor() {
    this.project = process.env.GCP_PROJECT_ID;
    this.location = process.env.GCP_LOCATION || 'us-central1';

    console.log('GCP_PROJECT_ID:', this.project);
    console.log('GCP_LOCATION:', this.location);

    if (!this.project) {
      console.warn('GCP_PROJECT_ID is not set. AI services will fail.');
    }

    this.ai = new GoogleGenAI({
      vertexai: true,
      project: this.project,
      location: this.location,
    });

    // Using gemini-1.5-flash as a cost-effective alternative to GPT-4
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.simpleModelName =
      process.env.SIMPLE_GEMINI_MODEL || 'gemini-2.5-flash';
  }

  async analyzeResume(
    resumeText,
    jobDescription,
    locale,
    targetRole = null,
    targetCompany = null,
    userId = null,
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
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are an expert resume analyst and career coach. Analyze resumes for ATS compatibility, keyword optimization, and overall effectiveness. 
              Populate the JSON fields as follows — "overview": a 3-sentence summary of the candidate's fit; "strongPoints": an array of specific strengths and keyword matches; "weaknesses": an array of concrete gaps, ATS issues, missing keywords, and actionable fixes; "atsScore": a numeric score from 1 to 10. 
              Be specific and concise — each array item should be one clear sentence. You MUST generate the analysis in the following language: ${LOCALES[locale]}.
              [The current date is: ${getCurrentLocaleStringDate()}]
              `,
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

      const response = await this.ai.models.generateContent(request);
      console.log('Response:', response);
      const analysis = parseModelJSON(response.text);

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
        model: this.simpleModelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are an expert resume analyst.
              Given a resume, return a single specific, actionable tip that would most improve its ATS score, and a numeric ATS score from 1 to 10.
              Be direct and concrete — one sentence for the tip. You MUST respond in the following language: ${LOCALES[locale]}.
              [The current date is: ${getCurrentLocaleStringDate()}]
              `,
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

      const response = await this.ai.models.generateContent(request);
      const analysis = parseModelJSON(response.text);

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
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are a professional career coach and cover letter expert. 
              Write compelling, personalized cover letters that highlight relevant experience and demonstrate genuine interest in the role. 
              You must generate the cover letter in the following language: ${LOCALES[locale]}.
              [The current date is: ${getCurrentLocaleStringDate()}]
              `,
            },
          ],
        },
        generationConfig: {
          maxOutputTokens: 2500,
          temperature: 0.4,
        },
      };

      const response = await this.ai.models.generateContent(request);
      const coverLetter = response.text;

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
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are an expert resume optimizer. Your ONLY task is to improve the wording, phrasing, and keyword alignment of existing resume content to better match job requirements. 
              You must NEVER invent, fabricate, or hallucinate any information. 
              You must NEVER change personal information such as name, email, phone, location, website, or social network usernames — return them exactly as provided. 
              You must NEVER add work experiences, companies, job titles, education institutions, degrees, dates, or skills that do not exist in the original resume. Only enhance the language of what already exists. 
              You must generate the optimized resume in the following language: ${LOCALES[locale]}.
              [The current date is: ${getCurrentLocaleStringDate()}].
              `,
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

      const response = await this.ai.models.generateContent(request);
      const optimizedResume = parseModelJSON(response.text);

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

  async extractResumeStructure(resumeText, userId = null) {
    let creditTx = null;
    try {
      if (userId) {
        creditTx = await creditService.deductCredits(
          userId,
          CREDIT_COSTS.RESUME_BUILDING,
          'Resume Conversion to Editable',
        );
      }
      const prompt = this.buildResumeExtractionPrompt(resumeText);

      const request = {
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are an expert resume parser. Extract every piece of structured data that is visibly present in the resume text — this is a transcription and segmentation task, not a rewrite.
              "Never invent" means never add a fact that isn't in the source (a company, a date, a skill that doesn't appear). It does NOT mean you should leave a field blank when the information is clearly there but just isn't labeled with a tag like "email:" — resumes never label their fields that way, so you must recognize them by pattern. Leaving a visible value blank is just as wrong as inventing one.
              Preserve the original language and wording of the resume — do not translate or rephrase, only segment it into fields. Section headings may be in a different language than the body (e.g. Spanish headings like "RESUMEN PROFESIONAL"/"EXPERIENCIA"/"EDUCACIÓN"/"HABILIDADES" over English or Spanish content) — map them to the right field by meaning, not by exact header text.
              The source text often comes from automated PDF extraction and may have no line breaks, so entries run together in one paragraph. Use these patterns to segment it:
              - Contact line (usually right after the name): fields separated by "•", "|", or commas. A token with "@" is the email. A token starting with "+" or containing mostly digits is the phone — normalize it to E.164 (e.g. "+1 (829) 301- 7378" becomes "+18293017378"; strip spaces, dashes, and parentheses, keep only the leading "+" and digits). A token containing a domain (.com, .dev, .io, "github.io", etc.) or starting with "http" is the website.
              - Each experience entry usually reads like "COMPANY | POSITION  START_DATE – END_DATE  LOCATION" followed by one or more achievement sentences before the next company begins — split those into company, position, start_date, end_date, location, and one highlight string per achievement sentence.
              - Each skills line usually reads like "CATEGORY: item1, item2, item3" — CATEGORY is the "label", the rest of the line is the "details" string.
              - The professional summary is the paragraph right after the summary/objective heading (in any language) and before the first section like experience — capture it as one or more strings in "summary".
              If a field genuinely has no corresponding value anywhere in the source text, return an empty string ("") for scalar fields or an empty array ([]) for list fields.
              Dates should be normalized to "YYYY-MM" when a month and year are both available, "YYYY" when only a year is available, and "present" for an ongoing role — otherwise keep the original text.
              [The current date is: ${getCurrentLocaleStringDate()}].
              `,
            },
          ],
        },
        generationConfig: {
          maxOutputTokens: 8000,
          temperature: 0.1,
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

      const response = await this.ai.models.generateContent(request);
      const extractedCv = normalizeExtractedCv(parseModelJSON(response.text));

      const usageMetadata = response.usageMetadata;
      const tokensUsed =
        (usageMetadata.promptTokenCount || 0) +
        (usageMetadata.candidatesTokenCount || 0);
      const cost = this.calculateCost(tokensUsed, this.modelName);

      return {
        extractedCv,
        tokensUsed,
        cost,
        model: this.modelName,
      };
    } catch (error) {
      if (userId && creditTx) {
        await creditService.refundCredits(userId, creditTx.id, error.message);
      }
      console.error('AI Resume Extraction Error:', error);
      throw new Error('Failed to convert resume: ' + error.message);
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

  buildResumeExtractionPrompt(resumeText) {
    let prompt = `Extract the structured contents of the resume below into the JSON schema provided.\n\n`;
    prompt += `The source text was extracted from a PDF by an automated tool, so it often has no line breaks and runs sections together. Segment it carefully — do not skip a field just because it isn't clearly delimited; scan the whole surrounding text for it.\n\n`;
    prompt += `WORKED EXAMPLE — this shows how to segment run-on text like the resume below:\n\n`;
    prompt += `Given this input fragment:\n`;
    prompt += `"JOHN SMITH San Francisco, CA • +1 (415) 555- 0199 • john.smith@email.com • johnsmith.dev/portfolio SUMMARY Backend engineer with 6 years of experience shipping distributed systems at scale. EXPERIENCE Acme Corp | Senior Backend Engineer 2021-03 – PRESENT REMOTE Led a team of 4 engineers to redesign the billing pipeline, cutting invoice errors by 35%. Migrated legacy services to a microservices architecture using Docker and Kubernetes. EDUCATION State University | Bachelor en Computer Science Boston, MA 2013-09 – 2017-06 SKILLS Programming Languages: Java, Kotlin, Go Cloud & DevOps: AWS, Terraform, Jenkins"\n\n`;
    prompt += `The correct extraction is:\n`;
    prompt += JSON.stringify(
      {
        name: 'JOHN SMITH',
        location: 'San Francisco, CA',
        email: 'john.smith@email.com',
        phone: '+14155550199',
        website: 'johnsmith.dev/portfolio',
        social_networks: [],
        sections: {
          summary: [
            'Backend engineer with 6 years of experience shipping distributed systems at scale.',
          ],
          experience: [
            {
              company: 'Acme Corp',
              position: 'Senior Backend Engineer',
              location: 'REMOTE',
              start_date: '2021-03',
              end_date: 'present',
              highlights: [
                'Led a team of 4 engineers to redesign the billing pipeline, cutting invoice errors by 35%.',
                'Migrated legacy services to a microservices architecture using Docker and Kubernetes.',
              ],
            },
          ],
          education: [
            {
              institution: 'State University',
              area: 'Computer Science',
              degree: 'Bachelor',
              location: 'Boston, MA',
              start_date: '2013-09',
              end_date: '2017-06',
            },
          ],
          skills: [
            { label: 'Programming Languages', details: 'Java, Kotlin, Go' },
            { label: 'Cloud & DevOps', details: 'AWS, Terraform, Jenkins' },
          ],
          custom: [],
        },
      },
      null,
      2,
    );
    prompt += `\n\nNotice how: the contact line's 4th token (a domain-like string) became "website" even though nothing labeled it as one; the phone lost its spacing/parens and gained the country code digits only; "POSITION" was pulled from between the "|" and the date even with no delimiter after it; every sentence between the location and the next company became its own "highlights" entry; "DEGREE en/in AREA" split into separate "degree" and "area" fields; each "Category: items" skills line became one {label, details} object. Apply this same reasoning to every entry in the resume below — do not leave position, highlights, skills, or summary empty just because they aren't set off by clear punctuation.\n\n`;
    prompt += `RESUME:\n${resumeText}\n\n`;
    prompt += `Transcribe the content faithfully — do not invent, embellish, or translate anything, but do not leave a field blank when the information is visibly present in the text. `;
    prompt += `Return only the JSON object, no additional commentary.`;

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
