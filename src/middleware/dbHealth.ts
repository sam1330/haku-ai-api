import { Request, Response, NextFunction } from 'express';

const db = require('../config/database');

const checkDatabaseConnection = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Simple query to check if database is accessible
    await db.raw('SELECT 1');
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(503).json({
      error: 'Database connection failed',
      code: 'DATABASE_ERROR',
      message: 'Please check your database connection and try again',
    });
  }
};

module.exports = { checkDatabaseConnection };
