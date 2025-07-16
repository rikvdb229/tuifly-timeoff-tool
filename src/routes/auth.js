// src/routes/auth.js
const express = require('express');
const passport = require('../../config/passport');
const {
  requireGuest,
  requireAuth,
  authRateLimit,
} = require('../middleware/auth');
const { deleteUserAccount } = require('../models');

const router = express.Router();

// Auth info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TUIfly Time-Off Authentication',
    endpoints: {
      'GET /auth/login': 'Login page',
      'GET /auth/google': 'Initiate Google OAuth',
      'GET /auth/google/callback': 'Google OAuth callback',
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

      // Check if user needs onboarding
      if (!req.user.isOnboarded()) {
        req.session.needsOnboarding = true;
        return res.redirect('/onboarding');
      }

      // Redirect to dashboard
      res.redirect('/');
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/auth/login?error=callback_error');
    }
  }
);

// Logout
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
    const userId = req.session.userId;

    // Delete user account and all associated data
    await deleteUserAccount(userId);

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error after account deletion:', err);
      }
    });

    res.json({
      success: true,
      message: 'Account deleted successfully',
      redirect: '/auth/login?message=account_deleted',
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account',
    });
  }
});

// Check authentication status (for AJAX requests)
router.get('/status', (req, res) => {
  const authenticated = !!req.session?.userId;

  res.json({
    authenticated,
    user: req.user?.toSafeObject() || null,
    needsOnboarding: req.session?.needsOnboarding || false,
  });
});

module.exports = router;
