const path = require('node:path');
require('dotenv').config();

// Resolved from this file's location so the config works both from source
// (./src/migrations) and from the compiled output (./dist/src/migrations).
const migrations = { directory: path.join(__dirname, 'src', 'migrations') };
const seeds = { directory: path.join(__dirname, 'src', 'seeds') };

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'resume_ai_db',
    },
    migrations,
    seeds,
  },

  test: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_TEST_NAME || 'resume_ai_test_db',
    },
    migrations,
    seeds,
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DB_URL,
      ssl: { rejectUnauthorized: false },
    },
    migrations,
    seeds,
    pool: {
      min: 2,
      max: 10,
    },
  },
};
