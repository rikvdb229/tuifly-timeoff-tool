// config/database.js
const { Sequelize } = require('sequelize');
const { createClient } = require('redis');

/**
 * Gets PostgreSQL database configuration from environment variables
 * @returns {Object} Database configuration object
 * @throws {Error} When DATABASE_URL environment variable is missing
 */
const getDatabaseConfig = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL environment variable is required for PostgreSQL connection'
    );
  }

  return {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    dialectOptions: {
      ssl:
        process.env.NODE_ENV === 'production'
          ? {
              require: true,
              rejectUnauthorized: false,
            }
          : false,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true,
    },
  };
};

// Initialize Sequelize with PostgreSQL
const config = getDatabaseConfig();
const sequelize = new Sequelize(config.url, config);

// Create Redis client immediately when module loads
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || undefined,
});

// Add Redis error handling
redisClient.on('error', (err) => {
  console.error('❌ Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('🔴 Redis connecting...');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

redisClient.on('end', () => {
  console.log('🔴 Redis connection ended');
});

// Test database connection
/**
 * Tests PostgreSQL database connection
 * @returns {Promise<void>}
 * @throws {Error} When connection fails
 */
async function testConnection() {
  try {
    await sequelize.authenticate();
    const dbName = sequelize.getDatabaseName();

    console.log(`✅ PostgreSQL connection established successfully.`);
    console.log(`📊 Database: ${dbName}`);

    // Get PostgreSQL version
    const [results] = await sequelize.query('SELECT version()');
    console.log(`🐘 PostgreSQL Version: ${results[0].version.split(' ')[1]}`);

    return true;
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL:', error.message);

    // Provide helpful error messages
    if (error.code === 'ECONNREFUSED') {
      console.error(
        '💡 PostgreSQL server is not running. Please start PostgreSQL.'
      );
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 PostgreSQL host not found. Check your DATABASE_URL.');
    } else if (error.name === 'SequelizeAccessDeniedError') {
      console.error(
        '💡 Access denied. Check your PostgreSQL username and password.'
      );
    } else if (error.name === 'SequelizeConnectionError') {
      console.error(
        '💡 Connection error. Verify your PostgreSQL configuration.'
      );
    }

    return false;
  }
}

// Initialize Redis connection
/**
 * Initializes Redis client and tests connection
 * @returns {Promise<void>}
 * @throws {Error} When Redis connection fails
 */
async function initializeRedis() {
  try {
    if (!redisClient.isReady) {
      await redisClient.connect();
    }

    // Test Redis connection
    await redisClient.ping();
    console.log('✅ Redis connected successfully');

    // Get Redis info
    const redisInfo = await redisClient.info('server');
    const redisVersion =
      redisInfo.match(/redis_version:([^\r\n]+)/)?.[1] || 'Unknown';
    console.log(`🔴 Redis Version: ${redisVersion}`);

    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);

    // Provide helpful error messages
    if (error.code === 'ECONNREFUSED') {
      console.error(
        '💡 Redis server is not running. Please start Redis: redis-server'
      );
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 Redis host not found. Check your REDIS_URL.');
    } else if (error.message.includes('WRONGPASS')) {
      console.error(
        '💡 Redis authentication failed. Check your REDIS_PASSWORD.'
      );
    } else if (error.message.includes('timeout')) {
      console.error(
        '💡 Redis connection timeout. Check if Redis is responsive.'
      );
    }

    return false;
  }
}

// Initialize database with proper error handling
async function initializeDatabase() {
  try {
    console.log('📊 PostgreSQL database initialization started...');

    // Test connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('PostgreSQL connection failed');
    }

    // Sync database (create tables if they don't exist)
    await sequelize.sync({
      force: false, // Never drop tables after initial setup
      alter: false, // Disable alter to prevent SQL syntax errors
    });

    console.log('✅ PostgreSQL tables synchronized successfully');

    // Show table count
    try {
      const [results] = await sequelize.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      const tableCount = parseInt(results[0].count);
      console.log(`📋 Database contains ${tableCount} tables`);
    } catch (err) {
      console.log('📋 Database table count unavailable');
    }

    console.log('✅ PostgreSQL database initialization complete');
    return true;
  } catch (error) {
    console.error(
      '❌ PostgreSQL database initialization failed:',
      error.message
    );

    // Provide specific error guidance
    if (
      error.message.includes('database') &&
      error.message.includes('does not exist')
    ) {
      console.error('💡 Database does not exist. Please create it first:');
      console.error('   psql -U postgres -c "CREATE DATABASE tuifly_timeoff;"');
    } else if (error.message.includes('permission denied')) {
      console.error('💡 Permission denied. Check PostgreSQL user permissions.');
    } else if (error.message.includes('timeout')) {
      console.error(
        '💡 Connection timeout. Check if PostgreSQL server is responsive.'
      );
    }

    throw error;
  }
}

// Graceful shutdown
async function closeDatabase() {
  try {
    await sequelize.close();
    console.log('✅ PostgreSQL connection closed successfully');
  } catch (error) {
    console.error('❌ Error closing PostgreSQL connection:', error.message);
  }
}

// Close Redis connection
async function closeRedis() {
  try {
    if (redisClient.isReady) {
      await redisClient.disconnect();
    }
    console.log('✅ Redis connection closed successfully');
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error.message);
  }
}

// Close all connections
async function closeConnections() {
  await Promise.all([closeDatabase(), closeRedis()]);
}

// Health check function
async function healthCheck() {
  try {
    // Check PostgreSQL
    await sequelize.authenticate();
    const dbName = sequelize.getDatabaseName();

    // Get connection pool info
    const pool = sequelize.connectionManager.pool;
    const poolInfo = pool
      ? {
          used: pool.used,
          waiting: pool.waiting,
          available: pool.available,
        }
      : null;

    // Check Redis
    let redisStatus = 'disconnected';
    try {
      if (redisClient.isReady) {
        await redisClient.ping();
        redisStatus = 'connected';
      }
    } catch (redisError) {
      redisStatus = 'error';
    }

    return {
      status: 'healthy',
      database: {
        name: dbName,
        dialect: 'postgres',
        connectionPool: poolInfo,
      },
      redis: {
        status: redisStatus,
        isReady: redisClient.isReady,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export configuration and functions
module.exports = {
  sequelize,
  redisClient,
  testConnection,
  initializeDatabase,
  initializeRedis,
  closeDatabase,
  closeRedis,
  closeConnections,
  healthCheck,

  // Utility functions
  getConnectionInfo: () => ({
    postgres: {
      dialect: 'postgres',
      database: sequelize.getDatabaseName(),
      host: sequelize.config.host,
      port: sequelize.config.port,
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      isReady: redisClient.isReady,
    },
  }),
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, closing connections...');
  await closeConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, closing connections...');
  await closeConnections();
  process.exit(0);
});
