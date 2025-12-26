const knex = require('knex');

const config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'resume_ai_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: './src/migrations'
  },
  seeds: {
    directory: './src/seeds'
  }
};

const db = knex(config);

// Test database connection
const MAX_RETRIES = 10;
const RETRY_DELAY = 5000;

const connectWithRetry = async (retryCount = 0) => {
  try {
    await db.raw('SELECT 1');
    console.log('✅ Database connected successfully');
  } catch (err) {
    console.error(`❌ Database connection failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, err.message);

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
