// src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const passport = require('../config/passport');
const { redisClient } = require('../config/database');
const { loadUser } = require('./middleware/auth');
const { logger, createLogger } = require('./utils/logger');

const app = express();

// Trust proxy for production deployments
app.set('trust proxy', 1);

// Security middleware with relaxed CSP for development
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-hashes'",
          'https://cdn.jsdelivr.net',
          'https://accounts.google.com',
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        imgSrc: [
          "'self'",
          'data:',
          'https:',
          'https://lh3.googleusercontent.com',
        ],
        // ADD THIS LINE - Allow fetch requests to your own domain
        connectSrc: [
          "'self'",
          'https://accounts.google.com',
          'http://localhost:3000',
        ],
        frameSrc: ["'self'", 'https://accounts.google.com'],
      },
    },
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

// Request logging middleware
const requestLogger = createLogger({ component: 'http' });

// Morgan with Winston integration
const morganFormat = process.env.NODE_ENV === 'production' 
  ? 'combined' 
  : ':method :url :status :res[content-length] - :response-time ms';

app.use(morgan(morganFormat, {
  stream: {
    write: message => logger.info(message.trim(), { component: 'morgan' })
  }
}));

// Custom request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log the request
  requestLogger.info('HTTP request started', {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    sessionId: req.sessionID,
    userId: req.session?.userId,
  });

  // Override res.end to capture response time and status
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    
    requestLogger.logRequest(req, res, responseTime);
    
    originalEnd.apply(this, args);
  };

  next();
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration with Redis
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: parseInt(process.env.SESSION_TIMEOUT) || 2592000000, // 30 days default
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    },
    name: 'tuifly.sid', // Custom session name
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Load user middleware (for all routes)
app.use(loadUser);

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Health check endpoint (no auth required) - MOVED TO TOP
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    version: '2.0.0',
    features: ['multi-user', 'oauth', 'redis-sessions', 'postgresql'],
    database: 'connected',
    redis: redisClient.isReady ? 'connected' : 'disconnected',
  });
});

// Routes
try {
  // Authentication routes (no auth required)
  const authRoutes = require('./routes/auth');
  app.use('/auth', authRoutes);

  // Onboarding routes (auth required, but not onboarding)
  const onboardingRoutes = require('./routes/onboarding');
  app.use('/onboarding', onboardingRoutes);

  // ADMIN ROUTES (NEW) - Add this line
  const adminRoutes = require('./routes/admin');
  app.use('/admin', adminRoutes);

  // Main routes (auth + onboarding required) - NOW PROPERLY PROTECTED
  const indexRoutes = require('./routes/index');
  app.use('/', indexRoutes);

  // API routes (auth + onboarding required) - ALREADY PROTECTED
  const apiRoutes = require('./routes/api');
  app.use('/api', apiRoutes);

  // Settings routes (auth + onboarding required) - ALREADY PROTECTED
  const settingsRoutes = require('./routes/settings');
  app.use('/settings', settingsRoutes);
} catch (err) {
  logger.error('Error loading routes', {
    error: err.message,
    stack: err.stack,
    component: 'app',
    operation: 'routeInitialization'
  });
}

// 404 handler
app.use((req, res) => {
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: req.path,
    });
  }

  res.status(404).render('layouts/base', {
    title: 'Page Not Found',
    body: '../pages/error',
    error: 'The page you are looking for does not exist.',
    statusCode: 404,
    includeNavbar: false,
    additionalCSS: ['error'],
    additionalJS: [],
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  const appLogger = createLogger({ component: 'errorHandler' });
  
  appLogger.logError(err, {
    operation: 'globalErrorHandler',
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.session?.userId,
    sessionId: req.sessionID,
    status: err.status || 500
  });

  const statusCode = err.status || 500;
  const message =
    process.env.NODE_ENV === 'development'
      ? err.message
      : statusCode >= 500
        ? 'Internal Server Error'
        : err.message;

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(statusCode).json({
      success: false,
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  res.status(statusCode).render('layouts/base', {
    title: 'Error',
    body: '../pages/error',
    error: message,
    statusCode,
    includeNavbar: false,
    additionalCSS: ['error'],
    additionalJS: [],
  });
});

module.exports = app;
