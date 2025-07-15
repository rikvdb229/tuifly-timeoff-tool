// FILE: src/app.js (Updated with fixed Helmet configuration)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');

const app = express();

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
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(cors());

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session management
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true in production with HTTPS
  })
);

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes - only add if files exist
try {
  const indexRoutes = require('./routes/index');
  app.use('/', indexRoutes);
} catch (err) {
  console.log('Index routes not found, skipping...');
  // Basic fallback route
  app.get('/', (req, res) => {
    res.json({ message: 'TUIfly Time-Off Tool - Basic Setup', status: 'OK' });
  });
}

try {
  const apiRoutes = require('./routes/api');
  app.use('/api', apiRoutes);
} catch (err) {
  console.log('API routes not found, skipping...');
}

try {
  const authRoutes = require('./routes/auth');
  app.use('/auth', authRoutes);
} catch (err) {
  console.log('Auth routes not found, skipping...');
}

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Page Not Found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Server Error',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Internal Server Error',
  });
});

module.exports = app;
