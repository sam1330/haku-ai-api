const db = require('../config/database');
const enums = require('../enums/index');

interface Activity {
  title: string;
  type: string;
  id: string;
  description: string;
  timestamp: Date | string;
  has_analysis?: boolean;
  status?: string;
}

const getRecentActivity = async (userId: string): Promise<Activity[]> => {
  // Get counts for different entities
  const [recentResumes, recentJobApplications, recentAIRequests] =
    await Promise.all([
      // Recent resumes (last 5)
      db('resumes')
        .where('user_id', userId)
        .select('id', 'original_filename', 'file_type', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(5),

      // Recent job applications (last 5)
      db('job_applications')
        .where('user_id', userId)
        .select('id', 'company_name', 'position_title', 'status', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(5),

      // Recent AI requests (for activity feed)
      db('ai_requests')
        .where('user_id', userId)
        .select('id', 'request_type', 'status', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(5),
    ]);

  // Get IDs of resumes that have at least one analysis (for activity feed flagging)
  const resumesWithAnalysis = await db('resume_analysis')
    .whereIn(
      'resume_id',
      recentResumes.map((r) => r.id),
    )
    .distinct('resume_id')
    .pluck('resume_id');

  // Create a flattened activity feed
  const activities = [
    ...recentResumes.map((resume) => ({
      title: 'Resume upload',
      type: enums.ACTIVITY_TYPES.RESUME_UPLOAD,
      id: resume.id,
      description: `Uploaded resume: ${resume.original_filename}`,
      timestamp: resume.created_at,
      has_analysis: resumesWithAnalysis.includes(resume.id),
    })),
    ...recentJobApplications.map((app) => ({
      title: 'Job application',
      type: enums.ACTIVITY_TYPES.JOB_APPLICATION,
      id: app.id,
      description: `Applied to ${app.position_title} at ${app.company_name}`,
      status: app.status,
      timestamp: app.created_at,
    })),
    ...recentAIRequests.map((req) => ({
      title: 'AI request',
      type: enums.ACTIVITY_TYPES.AI_REQUEST,
      id: req.id,
      description: `AI ${req.request_type.replace('_', ' ')} ${req.status}`,
      timestamp: req.created_at,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 10);

  return activities;
};

const getCurrentLocaleStringDate = () => {
  const date = new Date();
  const month = date.toLocaleString('default', { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
};

const parseModelJSON = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1].trim() : text.trim());
};

module.exports = {
  getRecentActivity,
  getCurrentLocaleStringDate,
  parseModelJSON,
};
