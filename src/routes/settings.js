// src/routes/settings.js - COMPLETE FIXED VERSION
const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');
const { User, UserSetting } = require('../models');
const { Op } = require('sequelize');
const { sanitizeRequestBody } = require('../utils/sanitize');
const { routeLogger } = require('../utils/logger');

const router = express.Router();

// Apply authentication middleware
router.use(requireAuth);
router.use(requireOnboarding);

// Basic validation functions (replacing Joi)
function validateProfile(data) {
  const errors = [];

  if (!data.name || data.name.length < 2 || data.name.length > 100) {
    errors.push({
      field: 'name',
      message: 'Name must be between 2 and 100 characters',
    });
  }

  if (!data.code || data.code.length !== 3 || !/^[A-Z]{3}$/.test(data.code)) {
    errors.push({
      field: 'code',
      message: 'Code must be exactly 3 uppercase letters',
    });
  }

  if (
    !data.signature ||
    data.signature.length < 2 ||
    data.signature.length > 200
  ) {
    errors.push({
      field: 'signature',
      message: 'Signature must be between 2 and 200 characters',
    });
  }

  return { isValid: errors.length === 0, errors };
}

function validateEmailPreference(data) {
  const errors = [];

  if (!data.preference || !['automatic', 'manual'].includes(data.preference)) {
    errors.push({
      field: 'preference',
      message: 'Preference must be "automatic" or "manual"',
    });
  }

  return { isValid: errors.length === 0, errors };
}

// Settings page
router.get('/', async (req, res) => {
  try {
    const userSettings = await UserSetting.getUserSettings(req.user.id);

    res.render('layouts/base', {
      title: 'Settings - TUIfly Time-Off',
      body: '../pages/settings',
      user: req.user.toSafeObject(),
      userSettings,
      includeNavbar: true,
      additionalCSS: ['settings'],
      additionalJS: ['settings'],
      globalSettings: {
        MIN_ADVANCE_DAYS: process.env.MIN_ADVANCE_DAYS || 60,
        // MAX_ADVANCE_DAYS removed - now dynamically calculated as first selectable day + configurable months
        MAX_DAYS_PER_REQUEST: process.env.MAX_DAYS_PER_REQUEST || 4,
        TUIFLY_APPROVER_EMAIL: process.env.TUIFLY_APPROVER_EMAIL,
      },
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'loadSettingsPage', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/settings' 
    });
    res.status(500).render('layouts/base', {
      title: 'Error',
      body: '../pages/error',
      error: 'Failed to load settings page',
      includeNavbar: false,
      additionalCSS: ['error'],
      additionalJS: [],
    });
  }
});

// Get settings (API endpoint) - SIMPLIFIED VERSION
router.get('/api', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user.toSafeObject(),
        // Email preference data
        emailPreference: req.user.emailPreference || 'manual',
        gmailConnected:
          req.user.gmailScopeGranted &&
          !!req.user.gmailAccessToken &&
          ((req.user.gmailTokenExpiry &&
            new Date() < new Date(req.user.gmailTokenExpiry)) ||
            !!req.user.gmailRefreshToken),
        globalSettings: {
          MIN_ADVANCE_DAYS: process.env.MIN_ADVANCE_DAYS || 60,
          // MAX_ADVANCE_DAYS removed - now dynamically calculated as first selectable day + configurable months
          MAX_DAYS_PER_REQUEST: process.env.MAX_DAYS_PER_REQUEST || 4,
          TUIFLY_APPROVER_EMAIL: process.env.TUIFLY_APPROVER_EMAIL,
        },
      },
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'getSettingsAPI', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/settings/api' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings',
      message: error.message,
    });
  }
});
// GET current user's email preference
router.get('/email-preference', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        emailPreference: req.user.emailPreference,
        gmailScopeGranted: req.user.gmailScopeGranted,
        canSendEmails: req.user.canSendEmails(),
        usesManualEmail: req.user.usesManualEmail(),
        usesAutomaticEmail: req.user.usesAutomaticEmail(),
      },
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'fetchEmailPreference', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/settings/email-preference' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email preference',
      message: error.message,
    });
  }
});

// PUT update user's email preference
router.put(
  '/email-preference',
  sanitizeRequestBody(['preference']),
  async (req, res) => {
    try {
      const validation = validateEmailPreference(req.body);

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validation.errors,
        });
      }

      const { preference } = req.body;
      await req.user.setEmailPreference(preference);

      routeLogger.info('Email preference updated successfully', { 
        userId: req.user.id, 
        userEmail: req.user.email, 
        newPreference: preference, 
        previousPreference: req.user.emailPreference, 
        operation: 'updateEmailPreference' 
      });

      // If switching to automatic mode, user needs to grant Gmail permissions
      let requiresGmailAuth = false;
      if (preference === 'automatic' && !req.user.gmailScopeGranted) {
        requiresGmailAuth = true;
      }

      res.json({
        success: true,
        message: `Email preference updated to ${preference}`,
        data: {
          emailPreference: preference,
          requiresGmailAuth,
          gmailScopeGranted: req.user.gmailScopeGranted,
        },
      });
    } catch (error) {
      routeLogger.logError(error, { 
        operation: 'updateEmailPreference', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        requestedPreference: req.body?.preference, 
        endpoint: 'PUT /settings/email-preference' 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update email preference',
        message: error.message,
      });
    }
  }
);
router.put(
  '/profile',
  sanitizeRequestBody(['name', 'code', 'signature']),
  async (req, res) => {
    try {
      const validation = validateProfile(req.body);

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors: validation.errors,
        });
      }

      const { name, code, signature } = req.body;

      // Check if code is already taken by another user
      const existingUser = await User.findOne({
        where: {
          code: code.toUpperCase(),
          id: { [Op.ne]: req.user.id },
        },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Code already taken by another user',
        });
      }

      await req.user.update({
        name: name.trim(),
        code: code.toUpperCase(),
        signature: signature.trim(),
      });

      routeLogger.info('Profile updated successfully', { 
        userId: req.user.id, 
        userEmail: req.user.email, 
        updatedFields: { 
          name: name.trim(), 
          code: code.toUpperCase() 
        }, 
        operation: 'updateProfile' 
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: req.user.toSafeObject(),
      });
    } catch (error) {
      routeLogger.logError(error, { 
        operation: 'updateProfile', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        requestedData: { 
          name: req.body?.name, 
          code: req.body?.code 
        }, 
        endpoint: 'PUT /settings/profile' 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update profile',
        message: error.message,
      });
    }
  }
);

// Note: Application preferences endpoint removed
// Only email preferences are handled via /settings/email-preference

router.post('/connect-gmail', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);

    // Check if already connected
    if (user.gmailScopeGranted && user.gmailAccessToken) {
      return res.json({
        success: false,
        error: 'Gmail is already connected',
        message: 'Your Gmail account is already authorized',
      });
    }

    // Set redirect target after Gmail OAuth
    req.session.gmailOAuthRedirect = '/settings?gmail_success=1';

    res.json({
      success: true,
      message: 'Redirecting to Gmail authorization...',
      redirectUrl: '/auth/google/gmail',
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'connectGmail', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/settings/connect-gmail' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start Gmail authorization',
    });
  }
});

// ADD: Disconnect Gmail
router.post('/disconnect-gmail', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);

    // Remove Gmail tokens and set preference to manual
    await user.update({
      gmailAccessToken: null,
      gmailRefreshToken: null,
      gmailTokenExpiry: null,
      gmailScopeGranted: false,
      emailPreference: 'manual', // Force to manual when disconnecting
    });

    routeLogger.info('Gmail disconnected successfully', { 
      userId: user.id, 
      userEmail: user.email, 
      operation: 'disconnectGmail' 
    });

    res.json({
      success: true,
      message:
        'Gmail disconnected successfully. Email preference set to manual.',
      user: user.toSafeObject(),
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'disconnectGmail', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/settings/disconnect-gmail' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Gmail',
    });
  }
});
// ADD: Gmail status endpoint
router.get('/gmail-status', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);

    // Check if Gmail is properly connected and token is valid
    let gmailConnected = false;
    if (user.gmailScopeGranted && user.gmailAccessToken) {
      // Check if token is not expired
      if (
        user.gmailTokenExpiry &&
        new Date() < new Date(user.gmailTokenExpiry)
      ) {
        gmailConnected = true;
      } else if (user.gmailRefreshToken) {
        // Token expired but we have refresh token
        gmailConnected = true; // Will be refreshed when needed
      }
    }

    res.json({
      success: true,
      gmailConnected,
      emailPreference: user.emailPreference || 'manual',
      gmailTokenExpiry: user.gmailTokenExpiry,
      hasRefreshToken: !!user.gmailRefreshToken,
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'checkGmailStatus', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/settings/gmail-status' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to check Gmail status',
    });
  }
});

router.post(
  '/email-preference',
  sanitizeRequestBody(['emailPreference']),
  async (req, res) => {
    try {
      const { emailPreference } = req.body;

      if (!['automatic', 'manual'].includes(emailPreference)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email preference',
        });
      }

      const user = await User.findByPk(req.user.id);

      // If switching to automatic, check Gmail authorization
      if (emailPreference === 'automatic') {
        if (!user.gmailScopeGranted || !user.gmailAccessToken) {
          return res.status(400).json({
            success: false,
            error: 'Gmail authorization required',
            message: 'Connect Gmail first to use automatic email sending',
            requiresGmailAuth: true,
          });
        }
      }

      // Update email preference
      await user.update({ emailPreference });

      routeLogger.info('Email preference changed successfully', { 
        userId: user.id, 
        userEmail: user.email, 
        newPreference: emailPreference, 
        operation: 'changeEmailPreference' 
      });

      res.json({
        success: true,
        message: `Email preference changed to ${emailPreference}`,
        emailPreference,
      });
    } catch (error) {
      routeLogger.logError(error, { 
        operation: 'changeEmailPreference', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        requestedPreference: req.body?.emailPreference, 
        endpoint: 'POST /settings/email-preference' 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to change email preference',
      });
    }
  }
);

module.exports = router;
