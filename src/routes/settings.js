// src/routes/settings.js - COMPLETE FIXED VERSION
const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');
const { User, UserSetting } = require('../models');
const { Op } = require('sequelize');

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
        MAX_ADVANCE_DAYS: process.env.MAX_ADVANCE_DAYS || 120,
        MAX_DAYS_PER_REQUEST: process.env.MAX_DAYS_PER_REQUEST || 4,
        TUIFLY_APPROVER_EMAIL: process.env.TUIFLY_APPROVER_EMAIL,
      },
    });
  } catch (error) {
    console.error('Settings page error:', error);
    res.status(500).render('layouts/base', {
      title: 'Error',
      body: '../pages/error',
      error: 'Failed to load settings page',
      includeNavbar: false,
      additionalCSS: ['error'],
      additionalJS: []
    });
  }
});

// Get settings (API endpoint) - FIXED VERSION
router.get('/api', async (req, res) => {
  try {
    // Get user settings (with fallback if UserSetting doesn't exist)
    let userSettings = {
      theme: 'light',
      language: 'en', 
      notifications: true,
      autoSave: true
    };

    try {
      // Try to get UserSetting if the model exists
      if (typeof UserSetting !== 'undefined') {
        const dbUserSettings = await UserSetting.getUserSettings(req.user.id);
        if (dbUserSettings) {
          userSettings = dbUserSettings;
        }
      }
    } catch (settingsError) {
      console.log('UserSetting model not available, using defaults');
    }

    res.json({
      success: true,
      data: {
        user: req.user.toSafeObject(),
        settings: userSettings,
        // ADD: Email preference data
        emailPreference: req.user.emailPreference || 'manual',
        gmailConnected: req.user.gmailScopeGranted && !!req.user.gmailAccessToken,
        globalSettings: {
          MIN_ADVANCE_DAYS: process.env.MIN_ADVANCE_DAYS || 60,
          MAX_ADVANCE_DAYS: process.env.MAX_ADVANCE_DAYS || 120,
          MAX_DAYS_PER_REQUEST: process.env.MAX_DAYS_PER_REQUEST || 4,
          TUIFLY_APPROVER_EMAIL: process.env.TUIFLY_APPROVER_EMAIL,
        },
      },
    });
  } catch (error) {
    console.error('Settings API error:', error);
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
    console.error('Error fetching email preference:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email preference',
      message: error.message,
    });
  }
});

// PUT update user's email preference
router.put('/email-preference', async (req, res) => {
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
    console.error('Error updating email preference:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update email preference',
      message: error.message,
    });
  }
});
router.put('/profile', async (req, res) => {
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

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: req.user.toSafeObject(),
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      message: error.message,
    });
  }
});

// Update preferences endpoint (MISSING ROUTE)
router.put('/preferences', async (req, res) => {
  try {
    // For now, just handle app settings (theme, language, etc.)
    // Email preferences are handled via /settings/email-preference
    const { theme, language, notifications, autoSave } = req.body;

    // Get or create user settings
    let userSettings = await UserSetting.findOne({
      where: { userId: req.user.id },
    });

    if (!userSettings) {
      userSettings = await UserSetting.create({
        userId: req.user.id,
        theme: theme || 'light',
        language: language || 'en',
        notifications: notifications !== false,
        autoSave: autoSave !== false,
      });
    } else {
      await userSettings.update({
        theme: theme || userSettings.theme,
        language: language || userSettings.language,
        notifications:
          notifications !== undefined
            ? notifications
            : userSettings.notifications,
        autoSave: autoSave !== undefined ? autoSave : userSettings.autoSave,
      });
    }

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: userSettings,
    });
  } catch (error) {
    console.error('Preferences update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences',
      message: error.message,
    });
  }
});

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
    console.error('Connect Gmail error:', error);
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

    console.log(`✅ Gmail disconnected for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Gmail disconnected successfully. Email preference set to manual.',
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Disconnect Gmail error:', error);
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

    res.json({
      success: true,
      gmailConnected: user.gmailScopeGranted && !!user.gmailAccessToken,
      emailPreference: user.emailPreference || 'manual',
      gmailTokenExpiry: user.gmailTokenExpiry,
    });
  } catch (error) {
    console.error('Gmail status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Gmail status',
    });
  }
});

router.post('/email-preference', async (req, res) => {
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

    console.log(`✅ Email preference changed: ${user.email} → ${emailPreference}`);

    res.json({
      success: true,
      message: `Email preference changed to ${emailPreference}`,
      emailPreference,
    });
  } catch (error) {
    console.error('Email preference change error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change email preference',
    });
  }
});

module.exports = router;
