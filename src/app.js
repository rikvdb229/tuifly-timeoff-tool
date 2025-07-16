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
          'http://localhost:3000', // Add your development domain
          'https://your-production-domain.com', // Add your production domain
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

// Logging
app.use(morgan('combined'));

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
      maxAge: parseInt(process.env.SESSION_TIMEOUT) || 3600000, // 1 hour
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
  console.error('Error loading routes:', err);
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

  res.status(404).render('pages/error', {
    title: 'Page Not Found',
    error: 'The page you are looking for does not exist.',
    statusCode: 404,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);

  // Don't log expected errors in production
  if (process.env.NODE_ENV !== 'production' || err.status >= 500) {
    console.error(err.stack);
  }

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

  res.status(statusCode).render('pages/error', {
    title: 'Error',
    error: message,
    statusCode,
  });
});

module.exports = app;
