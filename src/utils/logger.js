const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} ${level}: ${message} ${metaStr}`;
  })
);

// Daily rotate file transport for errors
const errorFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: 'error',
  format: logFormat,
  handleExceptions: true,
  handleRejections: true,
});

// Daily rotate file transport for all logs
const combinedFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat,
});

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: {
    service: 'tuifly-timeoff-tool',
    version: process.env.npm_package_version || '0.1.0',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    errorFileTransport,
    combinedFileTransport,
  ],
  exitOnError: false,
});

// Add console transport for non-production and non-test environments
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug',
  }));
}

// Silent mode for testing
if (process.env.NODE_ENV === 'test') {
  logger.silent = true;
}

// Create structured logging helpers
const createLogger = (context = {}) => {
  return {
    error: (message, meta = {}) => logger.error(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { ...context, ...meta }),
    
    // Request logging helper
    logRequest: (req, res, responseTime) => {
      const logData = {
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        userId: req.user?.id,
        sessionId: req.sessionID,
      };
      
      if (res.statusCode >= 400) {
        logger.warn('HTTP request completed with error', logData);
      } else {
        logger.info('HTTP request completed', logData);
      }
    },

    // Database operation logging
    logDatabaseOperation: (operation, table, meta = {}) => {
      logger.debug('Database operation', {
        operation,
        table,
        ...meta,
        ...context,
      });
    },

    // Authentication logging
    logAuth: (action, userId, meta = {}) => {
      logger.info('Authentication event', {
        action,
        userId,
        ...meta,
        ...context,
      });
    },

    // Error logging with full context
    logError: (error, context = {}) => {
      logger.error('Application error', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        ...context,
      });
    },
  };
};

// Export both the raw logger and the factory function
module.exports = {
  logger,
  createLogger,
  
  // Convenience exports for common use cases
  routeLogger: createLogger({ component: 'routes' }),
  serviceLogger: createLogger({ component: 'services' }),
  middlewareLogger: createLogger({ component: 'middleware' }),
  dbLogger: createLogger({ component: 'database' }),
  authLogger: createLogger({ component: 'auth' }),
};

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(logDir, 'exceptions.log'),
    format: logFormat,
  })
);

logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(logDir, 'rejections.log'),
    format: logFormat,
  })
);

// Log startup information
logger.info('Logger initialized', {
  logLevel: logger.level,
  environment: process.env.NODE_ENV || 'development',
  logDirectory: logDir,
});