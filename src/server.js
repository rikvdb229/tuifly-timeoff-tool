const app = require('./app');
const { testConnection } = require('../config/database');
const { initializeDatabase } = require('./models');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Simple migration function (inline)
async function migrateDatabaseToGroupId() {
  try {
    const { sequelize } = require('../config/database');
    const { v4: uuidv4 } = require('uuid');

    console.log('🔄 Checking for database migration...');

    // Check if groupId column exists
    const [results] = await sequelize.query(
      'PRAGMA table_info(time_off_requests);'
    );
    const hasGroupId = results.some((column) => column.name === 'groupId');

    if (!hasGroupId) {
      console.log('📝 Adding groupId column...');

      // Add the groupId column
      await sequelize.query(`
        ALTER TABLE time_off_requests 
        ADD COLUMN groupId VARCHAR(255);
      `);

      // Update existing records with unique groupIds
      const [existingRequests] = await sequelize.query(`
        SELECT id FROM time_off_requests WHERE groupId IS NULL;
      `);

      console.log(
        `🔄 Updating ${existingRequests.length} existing requests with groupIds...`
      );

      for (const request of existingRequests) {
        const groupId = uuidv4();
        await sequelize.query(
          `
          UPDATE time_off_requests 
          SET groupId = :groupId 
          WHERE id = :id;
        `,
          {
            replacements: { groupId, id: request.id },
          }
        );
      }

      console.log('✅ Database migration completed successfully!');
    } else {
      console.log(
        '✅ Database already has groupId column, no migration needed.'
      );
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting TUIfly Time-Off Tool...');

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Initialize database and models first
    await initializeDatabase();

    // Run database migration if needed (after models are defined)
    await migrateDatabaseToGroupId();

    // Start server
    app.listen(PORT, HOST, () => {
      console.log('');
      console.log('🎉 TUIfly Time-Off Tool is ready!');
      console.log(`📱 Calendar Interface: http://${HOST}:${PORT}`);
      console.log(`🔗 API Endpoints: http://${HOST}:${PORT}/api`);
      console.log(`📊 Health Check: http://${HOST}:${PORT}/health`);
      console.log(`💾 Database: SQLite with group requests support`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('');
      console.log('✨ New Features:');
      console.log('   • Interactive calendar with multi-day selection');
      console.log('   • Group requests with individual day types');
      console.log('   • Real-time conflict detection');
      console.log('   • Mobile-responsive design');
      console.log('   • Toast notifications');
      console.log('');
      console.log('🔧 Press Ctrl+C to stop the server');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
