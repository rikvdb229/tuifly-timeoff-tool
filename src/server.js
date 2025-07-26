// src/server.js
const app = require('./app');
const {
  initializeDatabase,
  initializeRedis,
  closeConnections,
} = require('../config/database');
const { logger } = require('./utils/logger');

const PORT = process.env.PORT || 3000;
// In Docker, we need to bind to 0.0.0.0 to accept external connections
const BIND_HOST = process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV ? '0.0.0.0' : (process.env.HOST || 'localhost');
// For display purposes, use HOST or APP_URL
const DISPLAY_HOST = process.env.HOST || 'localhost';
const APP_URL = process.env.APP_URL || `http://${DISPLAY_HOST}:${PORT}`;

// Initialize database and start server
async function startServer() {
  try {
    logger.info('🚀 Starting TUIfly Time-Off Tool v0.1.0...');
    logger.info('📊 Multi-User System with PostgreSQL + Redis');
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔌 Binding to: ${BIND_HOST}:${PORT}`);

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

    // Start the server - bind to 0.0.0.0 in production/Docker
    const server = app.listen(PORT, BIND_HOST, () => {
      logger.info('🎉 TUIfly Time-Off Tool v0.1.0 is ready!');
      logger.info(`📱 Application URL: ${APP_URL}`);
      logger.info(`🔐 Login Page: ${APP_URL}/auth/login`);
      logger.info(`🔗 API Documentation: ${APP_URL}/api`);
      logger.info(`📊 Health Check: ${APP_URL}/health`);
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

    // Add error handler for server
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${PORT} is already in use`);
        logger.info('💡 Try: lsof -i :3000 or netstat -tlnp | grep 3000');
      } else if (error.code === 'EACCES') {
        logger.error(`❌ Permission denied to bind to port ${PORT}`);
        logger.info('💡 Use a port number > 1024 or run with appropriate permissions');
      } else {
        logger.error('❌ Server error:', error);
      }
      process.exit(1);
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
