const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const enums = require('../enums');

const router = express.Router();

// Get dashboard overview
router.get('/overview', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get counts for different entities
    const [
      resumeCount,
      jobApplicationCount,
      recentResumes,
      recentJobApplications,
      aiRequestStats,
      analyzedResumesData,
      totalAnalyzedCount,
      appsThisMonth,
      aiRequestsThisMonth,
      userData,
      recentAIRequests
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
        .groupBy('request_type'),

      // Get last 10 analyses for metrics aggregation
      db('resume_analysis')
        .where('user_id', userId)
        .select('analysis_results', 'target_role', 'target_company', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(10),

      // Total analyses count
      db('resume_analysis')
        .where('user_id', userId)
        .count('* as count')
        .first(),

      // Applications this month
      db('job_applications')
        .where('user_id', userId)
        .where('created_at', '>=', startOfMonth)
        .count('* as count')
        .first(),

      // AI requests this month
      db('ai_requests')
        .where('user_id', userId)
        .where('created_at', '>=', startOfMonth)
        .count('* as count')
        .first(),

      // User subscription info
      db('users')
        .where('id', userId)
        .select('subscription_type', 'subscription_expires_at')
        .first(),

      // Recent AI requests (for activity feed)
      db('ai_requests')
        .where('user_id', userId)
        .select('id', 'request_type', 'status', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(5)
    ]);

    // Get IDs of resumes that have at least one analysis (for activity feed flagging)
    const resumesWithAnalysis = await db('resume_analysis')
      .whereIn('resume_id', recentResumes.map(r => r.id))
      .distinct('resume_id')
      .pluck('resume_id');

    // Process resume metrics
    let totalScore = 0;
    const scoreDistribution = { poor: 0, average: 0, good: 0 };
    const allStrengths = [];
    const allWeaknesses = [];
    const recentAnalyses = [];

    analyzedResumesData.forEach(results => {
      if (results && results.analysis_results) {
        const score = results.analysis_results.atsScore || 0;
        totalScore += score;

        // Score buckets
        if (score < 6) scoreDistribution.poor++;
        else if (score < 8) scoreDistribution.average++;
        else scoreDistribution.good++;

        // Collect strengths and weaknesses
        if (Array.isArray(results.analysis_results.strongPoints)) {
          allStrengths.push(...results.analysis_results.strongPoints);
        }
        if (Array.isArray(results.analysis_results.weaknesses)) {
          allWeaknesses.push(...results.analysis_results.weaknesses);
        }

        // Add to recent analyses list
        recentAnalyses.push({
          target_role: results.target_role,
          target_company: results.target_company,
          score: score,
          timestamp: results.created_at
        });
      }
    });

    const avgScore = analyzedResumesData.length > 0 
      ? Math.round(totalScore / analyzedResumesData.length) 
      : 0;

    // Helper to get top frequencies
    const getTopItems = (arr, limit = 5) => {
      const counts = arr.reduce((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name]) => name);
    };

    // Calculate total AI costs for the month
    const monthlyCosts = await db('ai_requests')
      .where('user_id', userId)
      .where('created_at', '>=', db.raw("NOW() - INTERVAL '30 days'"))
      .sum('cost as total_cost')
      .first();

    // Create a flattened activity feed
    const activities = [
      ...recentResumes.map(resume => ({
        title: "Resume upload",
        type: enums.ACTIVITY_TYPES.RESUME_UPLOAD,
        id: resume.id,
        description: `Uploaded resume: ${resume.original_filename}`,
        timestamp: resume.created_at,
        has_analysis: resumesWithAnalysis.includes(resume.id)
      })),
      ...recentJobApplications.map(app => ({
        title: "Job application",
        type: enums.ACTIVITY_TYPES.JOB_APPLICATION,
        id: app.id,
        description: `Applied to ${app.position_title} at ${app.company_name}`,
        status: app.status,
        timestamp: app.created_at
      })),
      ...recentAIRequests.map(req => ({
        title: "AI request",
        type: enums.ACTIVITY_TYPES.AI_REQUEST,
        id: req.id,
        description: `AI ${req.request_type.replace('_', ' ')} ${req.status}`,
        timestamp: req.created_at
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
     .slice(0, 10);

    res.json({
      overview: {
        total_resumes: parseInt(resumeCount.count),
        total_applications: parseInt(jobApplicationCount.count),
        analyzed_count: parseInt(totalAnalyzedCount.count),
        avg_score: avgScore,
        monthly_cost: parseFloat(monthlyCosts.total_cost) || 0,
        applications_this_month: parseInt(appsThisMonth.count),
        ai_requests_this_month: parseInt(aiRequestsThisMonth.count)
      },
      resume_analytics: {
        score_distribution: scoreDistribution,
        top_strengths: getTopItems(allStrengths),
        top_weaknesses: getTopItems(allWeaknesses),
        recent_analyses: recentAnalyses
      },
      recent_activity: activities,
      subscription_status: userData.subscription_type,
      subscription_expires_at: userData.subscription_expires_at
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
