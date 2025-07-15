const app = require('./app');
const { testConnection, initializeDatabase } = require('../config/database');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Initialize database
    await initializeDatabase();

    // Start server
    app.listen(PORT, HOST, () => {
      console.log(`🚀 TUIfly Time-Off Tool running on http://${HOST}:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Database: SQLite connected and ready`);
      console.log(`🔧 Press Ctrl+C to stop the server`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
