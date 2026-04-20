const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const resumeRoutes = require('./routes/resume');
const jobApplicationRoutes = require('./routes/jobApplication');
const dashboardRoutes = require('./routes/dashboard');
const creditRoutes = require('./routes/credits');
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');
const { checkDatabaseConnection } = require('./middleware/dbHealth');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Security middleware
app.use(helmet());
app.use(compression({
  filter: (req, res) => {
    // Don't compress PDF responses
    if (res.getHeader("Content-Type") === "application/pdf") {
      return false;
    }
    // Use default compression for everything else
    return compression.filter(req, res);
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  identifier: function (req, res) { return req.user ? req.user.id : req.ip; },
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes with database health check
app.use('/api/auth', checkDatabaseConnection, authRoutes);
app.use('/api/resumes', checkDatabaseConnection, resumeRoutes);
app.use('/api/job-applications', checkDatabaseConnection, jobApplicationRoutes);
app.use('/api/dashboard', checkDatabaseConnection, dashboardRoutes);
app.use('/api/credits', checkDatabaseConnection, creditRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://${HOST}:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
