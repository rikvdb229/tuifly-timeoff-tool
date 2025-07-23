// src/middleware/auth.js - FINAL FIXED VERSION (REDIRECT TO ROUTE)
const { User } = require('../models');
const rateLimit = require('express-rate-limit');

/**
 * Middleware to ensure user is authenticated
 * Redirects to login page if not authenticated
 * @param {Object} req - Express request object
 * @param {Object} req.session - User session
 * @param {string} req.session.userId - User ID from session
 * @param {boolean} req.xhr - Whether request is AJAX
 * @param {Object} req.headers - Request headers
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        redirect: '/auth/login',
      });
    }
    return res.redirect('/auth/login');
  }
  next();
};

// Middleware to ensure user has completed onboarding AND has admin approval
/**
 * Middleware to ensure user has completed onboarding
 * Redirects to onboarding if not completed
 * @param {Object} req - Express request object
 * @param {Object} req.session - User session
 * @param {string} req.session.userId - User ID from session
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const requireOnboarding = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect('/auth/login');
    }

    const user = await User.findByPk(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }

    // Check if user completed onboarding first
    if (!user.isOnboarded()) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({
          success: false,
          error: 'Onboarding required',
          redirect: '/onboarding',
        });
      }
      return res.redirect('/onboarding');
    }

    // 🚨 FIXED: Check if user has admin approval to use the app
    if (!user.canUseApp()) {
      // Show waiting for approval screen
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({
          success: false,
          error: 'Admin approval required',
          message: 'Your account is pending admin approval',
          needsApproval: true,
        });
      }

      // 🚨 CRITICAL FIX: Redirect to the route instead of rendering directly
      return res.redirect('/auth/waiting-approval');
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Error in requireOnboarding middleware:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Middleware to check if user is already authenticated (for login pages)
 * Redirects authenticated users to dashboard
 * @param {Object} req - Express request object
 * @param {Object} req.session - User session
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
const requireGuest = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/');
  }
  next();
};

/**
 * Rate limiting middleware for authentication attempts
 * Limits to 5 attempts per 15 minutes per IP address
 * @type {Function}
 */
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth attempts per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => {
    return process.env.NODE_ENV === 'development';
  },
});

/**
 * Middleware to load user data for authenticated routes
 * Loads user from database and attaches to request
 * @param {Object} req - Express request object
 * @param {Object} req.session - User session
 * @param {string} req.session.userId - User ID from session
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const loadUser = async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findByPk(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.user = user.toSafeObject();
        res.locals.isAuthenticated = true;
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  }

  if (!res.locals.isAuthenticated) {
    res.locals.isAuthenticated = false;
    res.locals.user = null;
  }

  next();
};

/**
 * Middleware to update last login time for authenticated users
 * @param {Object} req - Express request object
 * @param {Object} req.user - User object attached by previous middleware
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const updateLastLogin = async (req, res, next) => {
  if (req.user) {
    try {
      await req.user.update({ lastLoginAt: new Date() });
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  }
  next();
};

module.exports = {
  requireAuth,
  requireOnboarding,
  requireGuest,
  authRateLimit,
  loadUser,
  updateLastLogin,
};
