#!/usr/bin/env node

require('dotenv').config();
const db = require('../src/config/database');

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...\n');
  
  try {
    // Test basic connection
    const result = await db.raw('SELECT 1 as test');
    console.log('✅ Database connection successful!');
    console.log('📊 Test query result:', result.rows[0]);
    
    // Test if we can access the users table
    try {
      const tableExists = await db.schema.hasTable('users');
      console.log('📋 Users table exists:', tableExists);
      
      if (tableExists) {
        const userCount = await db('users').count('* as count').first();
        console.log('👥 Total users:', userCount.count);
      }
    } catch (tableError) {
      console.log('⚠️  Users table check failed:', tableError.message);
      console.log('💡 Run migrations: npm run migrate');
    }
    
    console.log('\n🎉 Database is ready!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error('Error details:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Check if PostgreSQL is running');
    console.error('2. Verify database credentials in .env');
    console.error('3. Ensure database exists');
    console.error('4. Check network connectivity');
    
    process.exit(1);
  }
}

testDatabaseConnection();
