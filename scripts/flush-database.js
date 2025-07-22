// scripts/flush-database.js
require('dotenv').config();
const { sequelize } = require('../config/database');
const models = require('../src/models');

async function flushDatabase() {
  try {
    console.log('🗑️  Starting database flush...');
    
    // Force sync will drop all tables and recreate them
    await sequelize.sync({ force: true });
    
    console.log('✅ All tables have been dropped and recreated');
    console.log('📝 Database is now empty and ready for testing');
    
    // Close database connection
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error flushing database:', error);
    process.exit(1);
  }
}

// Confirm before flushing
if (process.argv.includes('--force')) {
  flushDatabase();
} else {
  console.log('⚠️  WARNING: This will delete ALL data in your database!');
  console.log('Run with --force flag to confirm: npm run db:flush -- --force');
  process.exit(0);
}