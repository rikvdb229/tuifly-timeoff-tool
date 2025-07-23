// src/server.js
const app = require('./app');
const {
  initializeDatabase,
  initializeRedis,
  closeConnections,
} = require('../config/database');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting TUIfly Time-Off Tool v2.0...');
    console.log('📊 Multi-User System with PostgreSQL + Redis');
    console.log('');

    // Initialize Redis first
    console.log('🔴 Initializing Redis...');
    const redisConnected = await initializeRedis();
    if (!redisConnected) {
      console.error(
        '❌ Redis connection failed - sessions will not work properly'
      );
      console.log('💡 Make sure Redis is running: redis-server');
      throw new Error('Redis connection failed');
    }

    // Initialize PostgreSQL database
    console.log('🐘 Initializing PostgreSQL...');
    await initializeDatabase();

    // Start the server
    const server = app.listen(PORT, HOST, () => {
      console.log('');
      console.log('🎉 TUIfly Time-Off Tool v2.0 is ready!');
      console.log('');
      console.log('📱 Application URL: http://' + HOST + ':' + PORT);
      console.log('🔐 Login Page: http://' + HOST + ':' + PORT + '/auth/login');
      console.log('🔗 API Documentation: http://' + HOST + ':' + PORT + '/api');
      console.log('📊 Health Check: http://' + HOST + ':' + PORT + '/health');
      console.log('');
      console.log('🗄️  Database: PostgreSQL');
      console.log('🔴 Session Store: Redis');
      console.log('🔒 Authentication: Google OAuth 2.0');
      console.log('🌍 Environment: ' + (process.env.NODE_ENV || 'development'));
      console.log('');
      console.log('✨ New Multi-User Features:');
      console.log('   • Google OAuth authentication');
      console.log('   • User onboarding wizard');
      console.log('   • Individual user accounts');
      console.log('   • Personal settings management');
      console.log('   • Data isolation between users');
      console.log('   • Redis-based session management');
      console.log('');
      console.log('🔧 Press Ctrl+C to stop the server');
    });

    // Graceful shutdown handling
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    function gracefulShutdown() {
      console.log('\n🛑 Received shutdown signal, closing server...');

      server.close(async err => {
        if (err) {
          console.error('❌ Error during server shutdown:', err);
        } else {
          console.log('✅ Server closed successfully');
        }

        // Close database connections
        await closeConnections();

        console.log('👋 TUIfly Time-Off Tool shutdown complete');
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        console.error(
          '❌ Could not close connections in time, forcefully shutting down'
        );
        process.exit(1);
      }, 30000);
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('   1. Check PostgreSQL connection (DATABASE_URL)');
    console.log('   2. Ensure Redis is running (redis-server)');
    console.log('   3. Verify Google OAuth credentials');
    console.log('   4. Check environment variables in .env file');
    console.log('');

    // Try to close any open connections
    await closeConnections();

    process.exit(1);
  }
}

// Health check for the application
function checkEnvironmentVariables() {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.log('');
    console.log(
      '💡 Please check your .env file and ensure all required variables are set'
    );
    return false;
  }

  return true;
}

// Validate environment before starting
if (!checkEnvironmentVariables()) {
  process.exit(1);
}

// Start the server
startServer();
