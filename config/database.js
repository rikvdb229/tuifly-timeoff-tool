const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Create data directory if it doesn't exist
const fs = require('fs');
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DB_PATH || path.join(dataDir, 'timeoff.db'),
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
});

// Test connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    return false;
  }
}

// Simple initialization function for now
async function initializeDatabase() {
  try {
    console.log('📊 Database initialization started...');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

module.exports = { sequelize, testConnection, initializeDatabase };
