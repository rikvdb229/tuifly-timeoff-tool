// src/routes/auth.js - SPLIT OAUTH VERSION
const express = require('express');
const passport = require('../../config/passport');
const {
  requireGuest,
  requireAuth,
  authRateLimit,
} = require('../middleware/auth');
const { deleteUserAccount, User } = require('../models');
const { sanitizeRequestBody } = require('../utils/sanitize');
const { routeLogger } = require('../utils/logger');

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
    additionalJS: ['login'],
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
    routeLogger.logError(error, { 
      operation: 'checkAuthStatus', 
      userId: req.session?.userId, 
      endpoint: '/auth/status' 
    });
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
      includeNavbar: false,
      bodyClass: 'waiting-approval-page',
      additionalCSS: ['waiting-approval'],
      additionalJS: ['waiting-approval'],
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'waitingApproval', 
      userId: req.session?.userId, 
      endpoint: '/auth/waiting-approval' 
    });
    res.status(500).render('layouts/base', {
      title: 'Error',
      body: '../pages/error',
      error: 'Failed to load waiting approval page',
      includeNavbar: false,
      additionalCSS: ['error'],
      additionalJS: [],
    });
  }
});

// ===================================================================
// BASIC GOOGLE OAUTH (Initial Login - No Gmail Permissions)
// ===================================================================

// Initiate basic Google OAuth (profile + email only)
router.get(
  '/google',
  authRateLimit,
  passport.authenticate('google-basic', {
    prompt: 'select_account',
  })
);

// Test route to see what's happening
router.get('/google/test', (req, res) => {
  console.log('🔍 Test route hit');
  res.json({ message: 'Test route working', query: req.query });
});

// Basic Google OAuth callback
router.get(
  '/google/callback',
  (req, res, next) => {
    next();
  },
  passport.authenticate('google-basic', {
    failureRedirect: '/auth/login?error=oauth_failed',
  }),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.redirect('/auth/login?error=no_user');
      }

      // Save session manually
      req.session.userId = req.user.id;
      req.session.googleId = req.user.googleId;
      req.session.email = req.user.email;
      
      // Force session save
      req.session.save((err) => {
        if (err) {
          return res.redirect('/auth/login?error=session_error');
        }
        
        // Check if user needs onboarding
        if (!req.user.isOnboarded()) {
          return res.redirect('/onboarding');
        }

        // Check if user can use app (admin or approved)
        if (!req.user.canUseApp()) {
          return res.redirect('/auth/waiting-approval');
        }

        // Success - redirect to dashboard
        res.redirect('/?message=login_success');
      });
    } catch (error) {
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
    accessType: 'offline',
    prompt: 'consent', // Force consent screen to get refresh token
  })
);

// Gmail Google OAuth callback
router.get(
  '/google/gmail/callback',
  (req, res, next) => {
    next();
  },
  passport.authenticate('google-gmail', {
    failureRedirect: '/onboarding?error=gmail_oauth_failed&step=3',
  }),
  async (req, res) => {
    try {
      routeLogger.debug('Gmail OAuth callback successful', { 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        hasUser: !!req.user, 
        sessionId: req.sessionID, 
        operation: 'gmailOAuthCallback' 
      });

      if (!req.user) {
        routeLogger.error('No user object after Gmail OAuth', { 
          sessionId: req.sessionID, 
          queryParams: req.query, 
          operation: 'gmailOAuthCallback' 
        });
        return res.redirect('/onboarding?error=no_user_object&step=3');
      }

      // Update session with new user data
      req.session.userId = req.user.id;

      // 🔥 FIX: Automatically switch to automatic email mode after Gmail OAuth
      if (req.user.gmailScopeGranted) {
        try {
          await req.user.update({ emailPreference: 'automatic' });
          routeLogger.info('User switched to automatic email mode after Gmail OAuth', { 
            userId: req.user.id, 
            userEmail: req.user.email, 
            operation: 'autoSwitchEmailMode' 
          });
        } catch (error) {
          routeLogger.error('Failed to update email preference after Gmail OAuth', { 
            userId: req.user.id, 
            userEmail: req.user.email, 
            error: error.message, 
            operation: 'autoSwitchEmailMode' 
          });
          // Don't fail the whole callback for this
        }
      }

      routeLogger.info('User granted Gmail permissions', { 
        userId: req.user.id, 
        userEmail: req.user.email, 
        gmailScopeGranted: req.user.gmailScopeGranted, 
        operation: 'gmailOAuthSuccess' 
      });

      // Check where to redirect based on context
      const redirectTo =
        req.session.gmailOAuthRedirect || '/onboarding?gmail_success=1&step=4';
      delete req.session.gmailOAuthRedirect; // Clean up

      routeLogger.debug('Redirecting after Gmail OAuth', { 
        userId: req.user.id, 
        redirectTo, 
        operation: 'gmailOAuthRedirect' 
      });
      res.redirect(redirectTo);
    } catch (error) {
      routeLogger.logError(error, { 
        operation: 'gmailOAuthCallback', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        sessionId: req.sessionID, 
        endpoint: '/auth/google/gmail/callback' 
      });
      res.redirect('/onboarding?error=gmail_callback_error&step=3');
    }
  }
);

// Set Gmail OAuth redirect target (called before starting Gmail OAuth)
router.post(
  '/set-gmail-redirect',
  requireAuth,
  sanitizeRequestBody(['redirectTo']),
  (req, res) => {
    const { redirectTo } = req.body;
    req.session.gmailOAuthRedirect =
      redirectTo || '/onboarding?gmail_success=1&step=4';
    res.json({ success: true });
  }
);

// ===================================================================
// LOGOUT & ACCOUNT MANAGEMENT
// ===================================================================

// GET Logout (for simple redirects)
router.get('/logout', requireAuth, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      routeLogger.logError(err, { 
        operation: 'logout', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        endpoint: '/auth/logout' 
      });
      return res.redirect('/?error=logout_failed');
    }

    routeLogger.info('User logged out successfully (GET)', { 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      operation: 'logout' 
    });

    res.clearCookie('connect.sid');
    res.clearCookie('tuifly.sid');
    res.redirect('/auth/login?message=logged_out');
  });
});

// POST Logout (for API calls)
router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      routeLogger.logError(err, { 
        operation: 'logout', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        endpoint: 'POST /auth/logout' 
      });
      return res.status(500).json({
        success: false,
        error: 'Logout failed',
      });
    }

    routeLogger.info('User logged out successfully (POST)', { 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      operation: 'logout' 
    });

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

    routeLogger.info('User account deleted successfully', { 
      userId: req.user.id, 
      userEmail: req.user.email, 
      operation: 'deleteAccount' 
    });

    req.session.destroy(err => {
      if (err) {
        routeLogger.error('Session destroy error during account deletion', { 
          userId: req.user?.id, 
          userEmail: req.user?.email, 
          error: err.message, 
          operation: 'deleteAccount' 
        });
      }
      res.clearCookie('connect.sid');
      res.clearCookie('tuifly.sid');

      res.json({
        success: true,
        message: 'Account deleted successfully',
      });
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'deleteAccount', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: 'DELETE /auth/account' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete account',
    });
  }
});

module.exports = router;
