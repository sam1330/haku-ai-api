// Load test environment variables BEFORE any other module loads
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });
