import knex from 'knex';

const knexConfig = require('../../knexfile');

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

if (!config) {
  throw new Error(
    `Knex configuration for environment "${environment}" not found.`,
  );
}

const db = knex(config);

// Test database connection
const MAX_RETRIES = 10;
const RETRY_DELAY = 5000;

const connectWithRetry = async (retryCount = 0): Promise<void> => {
  try {
    await db.raw('SELECT 1');
    console.log('✅ Database connected successfully');
  } catch (err) {
    const error = err as Error;
    console.error(
      `❌ Database connection failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`,
      error.message,
    );

    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
      setTimeout(() => connectWithRetry(retryCount + 1), RETRY_DELAY);
    } else {
      console.error('Full error:', err);
      console.error('Max retries reached. Database is not connected.');
    }
  }
};

connectWithRetry();

module.exports = db;
