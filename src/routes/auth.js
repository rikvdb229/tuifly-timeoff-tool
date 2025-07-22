// src/routes/auth.js - SPLIT OAUTH VERSION
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
      'GET /auth/google': 'Initiate basic Google OAuth',
      'GET /auth/google/gmail': 'Initiate Gmail Google OAuth',
      'GET /auth/google/callback': 'Basic Google OAuth callback',
      'GET /auth/google/gmail/callback': 'Gmail Google OAuth callback',
      'GET /auth/status': 'Check authentication status',
      'GET /auth/waiting-approval': 'Waiting for approval page',
      'POST /auth/logout': 'Logout user',
      'DELETE /auth/account': 'Delete user account',
    },
    authenticated: !req.session?.userId,
    user: req.user?.toSafeObject() || null,
  });
});

// Login page
router.get('/login', requireGuest, (req, res) => {
  res.render('layouts/base', {
    title: 'Login',
    body: '../pages/login',
    error: req.query.error,
    message: req.query.message,
    includeNavbar: false,
    additionalCSS: ['auth'],
    additionalJS: ['login']
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
    res.render('layouts/base', {
      title: 'Waiting for Approval - TUIfly Time-Off',
      body: '../pages/waiting-approval',
      user: user.toSafeObject(),
      includeNavbar: true,
      additionalCSS: [],
      additionalJS: []
    });
  } catch (error) {
    console.error('Error in waiting-approval route:', error);
    res.status(500).render('layouts/base', {
      title: 'Error',
      body: '../pages/error',
      error: 'Failed to load waiting approval page',
      includeNavbar: false,
      additionalCSS: ['error'],
      additionalJS: []
    });
  }
});

// ===================================================================
// BASIC GOOGLE OAUTH (Initial Login - No Gmail Permissions)
// ===================================================================

// Initiate basic Google OAuth (profile + email only)
router.get(
  '/google',
  requireGuest,
  authRateLimit,
  passport.authenticate('google-basic', {
    scope: process.env.GOOGLE_SCOPES_BASIC
      ? process.env.GOOGLE_SCOPES_BASIC.split(' ')
      : ['profile', 'email', 'openid'],
    prompt: 'select_account',
  })
);

// Basic Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google-basic', {
    failureRedirect: '/auth/login?error=oauth_failed',
    session: false,
  }),
  async (req, res) => {
    try {
      // Set session data
      req.session.userId = req.user.id;
      req.session.googleId = req.user.googleId;
      req.session.email = req.user.email;

      console.log(`✅ User ${req.user.email} logged in with basic permissions`);

      // Check if user needs onboarding
      if (!req.user.isOnboarded()) {
        req.session.needsOnboarding = true;
        return res.redirect('/onboarding');
      }

      // Check if user can use app (admin or approved)
      if (!req.user.canUseApp()) {
        return res.redirect('/auth/waiting-approval');
      }

      // Success - redirect to dashboard
      res.redirect('/?message=login_success');
    } catch (error) {
      console.error('Basic OAuth callback error:', error);
      res.redirect('/auth/login?error=callback_error');
    }
  }
);

// ===================================================================
// GMAIL GOOGLE OAUTH (For Automatic Email Users)
// ===================================================================

// Initiate Gmail Google OAuth (includes Gmail send permissions)
router.get(
  '/google/gmail',
  requireAuth, // User must be logged in first
  authRateLimit,
  passport.authenticate('google-gmail', {
    scope: process.env.GOOGLE_SCOPES_GMAIL
      ? process.env.GOOGLE_SCOPES_GMAIL.split(' ')
      : ['profile', 'email', 'openid', 'https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent', // Force consent screen for Gmail permissions
  })
);

// Gmail Google OAuth callback
router.get(
  '/google/gmail/callback',
  (req, res, next) => {
    console.log('🔍 Gmail callback received:');
    console.log('Query params:', req.query);
    console.log('Session before passport:', req.session);
    next();
  },
  passport.authenticate('google-gmail', {
    failureRedirect: '/onboarding?error=gmail_oauth_failed&step=3',
    session: false,
  }),
  async (req, res) => {
    try {
      console.log('🔍 Gmail callback successful:');
      console.log('req.user:', req.user ? req.user.toSafeObject() : 'NULL');
      console.log('req.session:', req.session);
      
      if (!req.user) {
        console.error('❌ No user object after Gmail OAuth');
        return res.redirect('/onboarding?error=no_user_object&step=3');
      }

      // Update session with new user data
      req.session.userId = req.user.id;

      // 🔥 FIX: Automatically switch to automatic email mode after Gmail OAuth
      if (req.user.gmailScopeGranted) {
        try {
          await req.user.update({ emailPreference: 'automatic' });
          console.log(`✅ Automatically switched ${req.user.email} to automatic email mode`);
        } catch (error) {
          console.error('❌ Failed to update email preference:', error);
          // Don't fail the whole callback for this
        }
      }

      console.log(`✅ User ${req.user.email} granted Gmail permissions`);

      // Check where to redirect based on context
      const redirectTo = req.session.gmailOAuthRedirect || '/onboarding?gmail_success=1&step=4';
      delete req.session.gmailOAuthRedirect; // Clean up

      console.log('Redirecting to:', redirectTo);
      res.redirect(redirectTo);
    } catch (error) {
      console.error('Gmail OAuth callback error:', error);
      console.error('Error stack:', error.stack);
      res.redirect('/onboarding?error=gmail_callback_error&step=3');
    }
  }
);

// Set Gmail OAuth redirect target (called before starting Gmail OAuth)
router.post('/set-gmail-redirect', requireAuth, (req, res) => {
  const { redirectTo } = req.body;
  req.session.gmailOAuthRedirect = redirectTo || '/onboarding?gmail_success=1&step=4';
  res.json({ success: true });
});

// ===================================================================
// LOGOUT & ACCOUNT MANAGEMENT
// ===================================================================

// GET Logout (for simple redirects)
router.get('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.redirect('/?error=logout_failed');
    }

    res.clearCookie('connect.sid');
    res.clearCookie('tuifly.sid');
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
    res.clearCookie('tuifly.sid');
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  });
});

// Delete user account
router.delete('/account', requireAuth, async (req, res) => {
  try {
    await deleteUserAccount(req.user.id);

    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error during account deletion:', err);
      }
      res.clearCookie('connect.sid');
      res.clearCookie('tuifly.sid');
    });

    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account',
    });
  }
});

module.exports = router;