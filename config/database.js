const { Sequelize } = require('sequelize');

// PostgreSQL configuration
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

// Test database connection
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
      alter: process.env.NODE_ENV === 'development', // Only alter in development
      force: false, // Never drop tables
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

// Health check function
async function healthCheck() {
  try {
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

    return {
      status: 'healthy',
      database: dbName,
      dialect: 'postgres',
      connectionPool: poolInfo,
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
  testConnection,
  initializeDatabase,
  closeDatabase,
  healthCheck,

  // Utility functions
  getConnectionInfo: () => ({
    dialect: 'postgres',
    database: sequelize.getDatabaseName(),
    host: sequelize.config.host,
    port: sequelize.config.port,
  }),
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, closing PostgreSQL connection...');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, closing PostgreSQL connection...');
  await closeDatabase();
  process.exit(0);
});
