const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get dashboard overview
router.get('/overview', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get counts for different entities
    const [
      resumeCount,
      jobApplicationCount,
      recentResumes,
      recentJobApplications,
      aiRequestStats
    ] = await Promise.all([
      // Resume count
      db('resumes').where('user_id', userId).count('* as count').first(),
      
      // Job application count
      db('job_applications').where('user_id', userId).count('* as count').first(),
      
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
      
      // AI request stats (last 30 days)
      db('ai_requests')
        .where('user_id', userId)
        .where('created_at', '>=', db.raw("NOW() - INTERVAL '30 days'"))
        .select('request_type')
        .count('* as count')
        .groupBy('request_type')
    ]);

    // Get job application status breakdown
    const statusBreakdown = await db('job_applications')
      .where('user_id', userId)
      .select('status')
      .count('* as count')
      .groupBy('status');

    // Calculate total AI costs for the month
    const monthlyCosts = await db('ai_requests')
      .where('user_id', userId)
      .where('created_at', '>=', db.raw("NOW() - INTERVAL '30 days'"))
      .sum('cost as total_cost')
      .first();

    res.json({
      overview: {
        total_resumes: parseInt(resumeCount.count),
        total_job_applications: parseInt(jobApplicationCount.count),
        monthly_ai_cost: parseFloat(monthlyCosts.total_cost) || 0
      },
      recent_activity: {
        resumes: recentResumes,
        job_applications: recentJobApplications
      },
      job_application_status: statusBreakdown.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
      ai_usage: {
        last_30_days: aiRequestStats.reduce((acc, item) => {
          acc[item.request_type] = parseInt(item.count);
          return acc;
        }, {})
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get AI usage statistics
router.get('/ai-usage', authenticateToken, async (req, res, next) => {
  try {
    const { period = '30' } = req.query; // days
    const userId = req.user.id;

    const aiRequests = await db('ai_requests')
      .where('user_id', userId)
      .where('created_at', '>=', db.raw(`NOW() - INTERVAL '${period} days'`))
      .select(
        'request_type',
        'status',
        'tokens_used',
        'cost',
        'created_at'
      )
      .orderBy('created_at', 'desc');

    // Group by request type
    const usageByType = aiRequests.reduce((acc, request) => {
      if (!acc[request.request_type]) {
        acc[request.request_type] = {
          total_requests: 0,
          successful_requests: 0,
          total_tokens: 0,
          total_cost: 0
        };
      }
      
      acc[request.request_type].total_requests++;
      if (request.status === 'completed') {
        acc[request.request_type].successful_requests++;
        acc[request.request_type].total_tokens += request.tokens_used || 0;
        acc[request.request_type].total_cost += parseFloat(request.cost) || 0;
      }
      
      return acc;
    }, {});

    // Daily usage for the period
    const dailyUsage = await db('ai_requests')
      .where('user_id', userId)
      .where('created_at', '>=', db.raw(`NOW() - INTERVAL '${period} days'`))
      .select(db.raw('DATE(created_at) as date'))
      .count('* as requests')
      .sum('cost as cost')
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'desc');

    res.json({
      period_days: parseInt(period),
      usage_by_type: usageByType,
      daily_usage: dailyUsage.map(day => ({
        date: day.date,
        requests: parseInt(day.requests),
        cost: parseFloat(day.cost) || 0
      })),
      total_requests: aiRequests.length,
      total_cost: aiRequests.reduce((sum, req) => sum + (parseFloat(req.cost) || 0), 0)
    });
  } catch (error) {
    next(error);
  }
});

// Get subscription status and limits
router.get('/subscription', authenticateToken, async (req, res, next) => {
  try {
    const user = await db('users')
      .where('id', req.user.id)
      .select('subscription_type', 'subscription_expires_at', 'created_at')
      .first();

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get usage for current billing period
    const billingStart = user.subscription_type === 'free' 
      ? user.created_at 
      : (user.subscription_expires_at ? new Date(user.subscription_expires_at.getTime() - 30 * 24 * 60 * 60 * 1000) : user.created_at);

    const currentUsage = await db('ai_requests')
      .where('user_id', req.user.id)
      .where('created_at', '>=', billingStart)
      .count('* as total_requests')
      .sum('cost as total_cost')
      .first();

    // Define limits based on subscription type
    const limits = {
      free: {
        max_resumes: 3,
        max_job_applications: 5,
        max_ai_requests_per_month: 10,
        features: ['resume_upload', 'basic_analysis', 'cover_letter_generation']
      },
      pro: {
        max_resumes: -1, // unlimited
        max_job_applications: -1, // unlimited
        max_ai_requests_per_month: -1, // unlimited
        features: ['resume_upload', 'advanced_analysis', 'resume_optimization', 'cover_letter_generation', 'priority_support']
      }
    };

    const isSubscriptionActive = user.subscription_type === 'pro' && 
      (!user.subscription_expires_at || new Date(user.subscription_expires_at) > new Date());

    res.json({
      subscription: {
        type: user.subscription_type,
        is_active: isSubscriptionActive,
        expires_at: user.subscription_expires_at,
        limits: limits[user.subscription_type]
      },
      usage: {
        total_requests: parseInt(currentUsage.total_requests) || 0,
        total_cost: parseFloat(currentUsage.total_cost) || 0,
        period_start: billingStart
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get recent activity feed
router.get('/activity', authenticateToken, async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;
    const userId = req.user.id;

    // Get recent resumes
    const recentResumes = await db('resumes')
      .where('user_id', userId)
      .select('id', 'original_filename', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(5);

    // Get recent job applications
    const recentJobApplications = await db('job_applications')
      .where('user_id', userId)
      .select('id', 'company_name', 'position_title', 'status', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(5);

    // Get recent AI requests
    const recentAIRequests = await db('ai_requests')
      .where('user_id', userId)
      .select('id', 'request_type', 'status', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(10);

    // Combine and sort all activities
    const activities = [
      ...recentResumes.map(resume => ({
        type: 'resume_upload',
        id: resume.id,
        description: `Uploaded resume: ${resume.original_filename}`,
        timestamp: resume.created_at
      })),
      ...recentJobApplications.map(app => ({
        type: 'job_application',
        id: app.id,
        description: `Applied to ${app.position_title} at ${app.company_name}`,
        status: app.status,
        timestamp: app.created_at
      })),
      ...recentAIRequests.map(req => ({
        type: 'ai_request',
        id: req.id,
        description: `AI ${req.request_type.replace('_', ' ')} ${req.status}`,
        timestamp: req.created_at
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
     .slice(0, parseInt(limit));

    res.json({
      activities
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
