#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Resume AI Backend...\n');

// Check if .env exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file from template...');
  const envExample = fs.readFileSync(path.join(__dirname, '..', 'env.example'), 'utf8');
  fs.writeFileSync(envPath, envExample);
  console.log('✅ .env file created. Please update with your configuration.\n');
} else {
  console.log('✅ .env file already exists.\n');
}

// Create uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  console.log('📁 Creating uploads directory...');
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Uploads directory created.\n');
} else {
  console.log('✅ Uploads directory already exists.\n');
}

console.log('🎉 Setup complete! Next steps:');
console.log('1. Update .env with your database and API credentials');
console.log('2. Install dependencies: npm install');
console.log('3. Set up database: npm run migrate');
console.log('4. Start development server: npm run dev');
console.log('\n📚 See README.md for detailed setup instructions.');
