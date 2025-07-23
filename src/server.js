// src/server.js
const app = require('./app');
const {
  initializeDatabase,
  initializeRedis,
  closeConnections,
} = require('../config/database');
const { logger } = require('./utils/logger');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Initialize database and start server
async function startServer() {
  try {
    logger.info('🚀 Starting TUIfly Time-Off Tool v2.0...');
    logger.info('📊 Multi-User System with PostgreSQL + Redis');

    // Initialize Redis first
    logger.info('🔴 Initializing Redis...');
    const redisConnected = await initializeRedis();
    if (!redisConnected) {
      logger.error(
        '❌ Redis connection failed - sessions will not work properly'
      );
      logger.info('💡 Make sure Redis is running: redis-server');
      throw new Error('Redis connection failed');
    }

    // Initialize PostgreSQL database
    logger.info('🐘 Initializing PostgreSQL...');
    await initializeDatabase();

    // Start the server
    const server = app.listen(PORT, HOST, () => {
      logger.info('🎉 TUIfly Time-Off Tool v2.0 is ready!');
      logger.info('📱 Application URL: http://' + HOST + ':' + PORT);
      logger.info('🔐 Login Page: http://' + HOST + ':' + PORT + '/auth/login');
      logger.info('🔗 API Documentation: http://' + HOST + ':' + PORT + '/api');
      logger.info('📊 Health Check: http://' + HOST + ':' + PORT + '/health');
      logger.info('🗄️  Database: PostgreSQL');
      logger.info('🔴 Session Store: Redis');
      logger.info('🔒 Authentication: Google OAuth 2.0');
      logger.info('🌍 Environment: ' + (process.env.NODE_ENV || 'development'));
      logger.info('✨ New Multi-User Features:');
      logger.info('   • Google OAuth authentication');
      logger.info('   • User onboarding wizard');
      logger.info('   • Individual user accounts');
      logger.info('   • Personal settings management');
      logger.info('   • Data isolation between users');
      logger.info('   • Redis-based session management');
      logger.info('🔧 Press Ctrl+C to stop the server');
    });

    // Graceful shutdown handling
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    function gracefulShutdown() {
      logger.info('🛑 Received shutdown signal, closing server...');

      server.close(async err => {
        if (err) {
          logger.error('❌ Error during server shutdown:', err);
        } else {
          logger.info('✅ Server closed successfully');
        }

        // Close database connections
        await closeConnections();

        logger.info('👋 TUIfly Time-Off Tool shutdown complete');
        throw new Error('Server shutdown complete');
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error(
          '❌ Could not close connections in time, forcefully shutting down'
        );
        throw new Error('Forced shutdown due to timeout');
      }, 30000);
    }
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    logger.info('🔧 Troubleshooting:');
    logger.info('   1. Check PostgreSQL connection (DATABASE_URL)');
    logger.info('   2. Ensure Redis is running (redis-server)');
    logger.info('   3. Verify Google OAuth credentials');
    logger.info('   4. Check environment variables in .env file');

    // Try to close any open connections
    await closeConnections();

    throw new Error('Server startup failed');
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
    logger.error('❌ Missing required environment variables:', { missing });
    logger.info(
      '💡 Please check your .env file and ensure all required variables are set'
    );
    return false;
  }

  return true;
}

// Validate environment before starting
if (!checkEnvironmentVariables()) {
  throw new Error('Environment validation failed');
}

// Start the server
startServer();
