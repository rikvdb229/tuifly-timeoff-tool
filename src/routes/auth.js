// src/routes/auth.js - COMPLETE FIXED VERSION
const express = require('express');
const passport = require('../../config/passport');
const {
  requireGuest,
  requireAuth,
  authRateLimit,
} = require('../middleware/auth');
const { deleteUserAccount, User } = require('../models');

const router = express.Router();

// Auth info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TUIfly Time-Off Authentication',
    endpoints: {
      'GET /auth/login': 'Login page',
      'GET /auth/google': 'Initiate Google OAuth',
      'GET /auth/google/callback': 'Google OAuth callback',
      'GET /auth/status': 'Check authentication status',
      'GET /auth/waiting-approval': 'Waiting for approval page',
      'POST /auth/logout': 'Logout user',
      'DELETE /auth/account': 'Delete user account',
    },
    authenticated: !!req.session?.userId,
    user: req.user?.toSafeObject() || null,
  });
});

// Login page
router.get('/login', requireGuest, (req, res) => {
  res.render('pages/login', {
    title: 'Login - TUIfly Time-Off',
    error: req.query.error,
    message: req.query.message,
  });
});

// Auth status endpoint (for checking approval status)
router.get('/status', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.json({
        authenticated: false,
        user: null,
      });
    }

    const user = await User.findByPk(req.session.userId);

    if (!user) {
      return res.json({
        authenticated: false,
        user: null,
      });
    }

    res.json({
      authenticated: true,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({
      authenticated: false,
      error: 'Internal server error',
    });
  }
});

// Waiting for approval page route
router.get('/waiting-approval', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect('/auth/login');
    }

    const user = await User.findByPk(req.session.userId);

    if (!user) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }

    // If user can now use app, redirect to dashboard
    if (user.canUseApp()) {
      return res.redirect('/');
    }

    // If user hasn't completed onboarding, redirect there
    if (!user.isOnboarded()) {
      return res.redirect('/onboarding');
    }

    // Render waiting approval page
    res.render('pages/waiting-approval', {
      title: 'Waiting for Approval - TUIfly Time-Off',
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Error in waiting-approval route:', error);
    res.status(500).render('pages/error', {
      title: 'Error',
      error: 'Failed to load waiting approval page',
    });
  }
});

// Initiate Google OAuth
router.get(
  '/google',
  requireGuest,
  authRateLimit,
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account', // Force account selection
  })
);

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login?error=oauth_failed',
    session: false, // We'll handle session manually
  }),
  async (req, res) => {
    try {
      // Set session data
      req.session.userId = req.user.id;
      req.session.googleId = req.user.googleId;
      req.session.email = req.user.email;

      console.log(`🔐 OAuth callback for user: ${req.user.email}`);

      // Check if user needs onboarding
      if (!req.user.isOnboarded()) {
        req.session.needsOnboarding = true;
        console.log(`📝 User needs onboarding: ${req.user.email}`);
        return res.redirect('/onboarding');
      }

      // Check if user needs admin approval
      if (!req.user.canUseApp()) {
        console.log(`⏳ User needs admin approval: ${req.user.email}`);
        return res.redirect('/auth/waiting-approval');
      }

      // User can access app - redirect to dashboard
      console.log(`✅ User can access app: ${req.user.email}`);
      res.redirect('/');
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/auth/login?error=callback_error');
    }
  }
);

// GET Logout (for simple redirects)
router.get('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.redirect('/?error=logout_failed');
    }

    res.clearCookie('connect.sid');
    res.clearCookie('tuifly.sid'); // Clear the custom session cookie name
    res.redirect('/auth/login?message=logged_out');
  });
});

// POST Logout (for API calls)
router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        error: 'Logout failed',
      });
    }

    res.clearCookie('connect.sid');

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        message: 'Logged out successfully',
        redirect: '/auth/login',
      });
    }

    res.redirect('/auth/login?message=logged_out');
  });
});

// Delete account
router.delete('/account', requireAuth, async (req, res) => {
  try {
    await deleteUserAccount(req.session.userId);

    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error after account deletion:', err);
      }
    });

    res.clearCookie('connect.sid');

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        message: 'Account deleted successfully',
        redirect: '/auth/login',
      });
    }

    res.redirect('/auth/login?message=account_deleted');
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account',
    });
  }
});

module.exports = router;
