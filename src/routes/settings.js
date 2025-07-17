// src/routes/settings.js - FIXED VERSION
const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');
const { User, UserSetting } = require('../models');

const router = express.Router();

// Apply authentication middleware
router.use(requireAuth);
router.use(requireOnboarding);

// Basic validation functions (replacing Joi for now)
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

  return errors;
}

function validateSettings(data) {
  const errors = [];
  const validKeys = [
    'theme',
    'notifications',
    'timezone',
    'language',
    'autoSave',
    'emailFrequency',
  ];

  Object.keys(data).forEach((key) => {
    if (!validKeys.includes(key)) {
      errors.push({ field: key, message: 'Invalid setting key' });
    }
  });

  if (data.theme && !['light', 'dark'].includes(data.theme)) {
    errors.push({ field: 'theme', message: 'Theme must be light or dark' });
  }

  if (data.language && !['en', 'nl', 'fr', 'de'].includes(data.language)) {
    errors.push({ field: 'language', message: 'Invalid language code' });
  }

  if (
    data.emailFrequency &&
    !['immediate', 'daily', 'weekly', 'never'].includes(data.emailFrequency)
  ) {
    errors.push({
      field: 'emailFrequency',
      message: 'Invalid email frequency',
    });
  }

  return errors;
}

// Settings page
router.get('/', async (req, res) => {
  try {
    const userSettings = await UserSetting.getUserSettings(req.user.id);

    res.render('pages/settings', {
      title: 'Settings - TUIfly Time-Off',
      user: req.user.toSafeObject(),
      userSettings,
      globalSettings: {
        MIN_ADVANCE_DAYS: process.env.MIN_ADVANCE_DAYS || 60,
        MAX_ADVANCE_DAYS: process.env.MAX_ADVANCE_DAYS || 120,
        MAX_DAYS_PER_REQUEST: process.env.MAX_DAYS_PER_REQUEST || 4,
        TUIFLY_APPROVER_EMAIL: process.env.TUIFLY_APPROVER_EMAIL,
      },
    });
  } catch (error) {
    console.error('Settings page error:', error);
    res.status(500).render('pages/error', {
      title: 'Error',
      error: 'Failed to load settings page',
    });
  }
});

// Get settings (API endpoint) - FIXED
router.get('/api', async (req, res) => {
  console.log('📊 Settings API called by user:', req.user?.id);

  try {
    // Validate user is authenticated
    if (!req.user || !req.user.id) {
      console.error('❌ No authenticated user found');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    console.log('🔍 Fetching settings for user ID:', req.user.id);

    // Get user settings with error handling
    let userSettings = {};
    try {
      userSettings = await UserSetting.getUserSettings(req.user.id);
      console.log('✅ User settings loaded:', Object.keys(userSettings));
    } catch (settingsError) {
      console.error('⚠️ Error loading user settings:', settingsError);
      // Continue with empty settings if user settings fail
      userSettings = {};
    }

    // Prepare safe user object
    const safeUser = req.user.toSafeObject
      ? req.user.toSafeObject()
      : {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          code: req.user.code,
          signature: req.user.signature,
        };

    console.log('✅ Sending settings response');
    res.json({
      success: true,
      data: {
        user: safeUser,
        settings: userSettings,
        globalSettings: {
          MIN_ADVANCE_DAYS: process.env.MIN_ADVANCE_DAYS || 60,
          MAX_ADVANCE_DAYS: process.env.MAX_ADVANCE_DAYS || 120,
          MAX_DAYS_PER_REQUEST: process.env.MAX_DAYS_PER_REQUEST || 4,
          TUIFLY_APPROVER_EMAIL: process.env.TUIFLY_APPROVER_EMAIL,
        },
      },
    });
  } catch (error) {
    console.error('❌ Settings API error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Update profile
router.put('/profile', async (req, res) => {
  try {
    const errors = validateProfile(req.body);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    const { name, code, signature } = req.body;

    // Check if code is already taken by another user
    const existingUser = await User.findOne({
      where: { code: code.toUpperCase() },
    });
    if (existingUser && existingUser.id !== req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Code already taken',
        details: [
          {
            field: 'code',
            message: 'This 3-letter code is already in use',
          },
        ],
      });
    }

    // Update user profile
    await req.user.update({
      name,
      code: code.toUpperCase(),
      signature,
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: req.user.toSafeObject(),
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
});

// Update user settings
router.put('/preferences', async (req, res) => {
  try {
    const errors = validateSettings(req.body);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    // Update each setting
    const updatedSettings = {};
    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        const settingType = typeof val === 'boolean' ? 'boolean' : 'string';
        await UserSetting.updateUserSetting(req.user.id, key, val, settingType);
        updatedSettings[key] = val;
      }
    }

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      settings: updatedSettings,
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences',
    });
  }
});

// Update single setting
router.put('/preferences/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const validKeys = [
      'theme',
      'notifications',
      'timezone',
      'language',
      'autoSave',
      'emailFrequency',
    ];

    if (!validKeys.includes(key)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid setting key',
      });
    }

    const settingType = typeof value === 'boolean' ? 'boolean' : 'string';
    await UserSetting.updateUserSetting(req.user.id, key, value, settingType);

    res.json({
      success: true,
      message: 'Setting updated successfully',
      setting: { [key]: value },
    });
  } catch (error) {
    console.error('Single setting update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update setting',
    });
  }
});

// Reset settings to default
router.post('/reset', async (req, res) => {
  try {
    const defaultSettings = UserSetting.getDefaultSettings();

    // Update all settings to defaults
    for (const [key, value] of Object.entries(defaultSettings)) {
      const settingType = typeof value === 'boolean' ? 'boolean' : 'string';
      await UserSetting.updateUserSetting(req.user.id, key, value, settingType);
    }

    res.json({
      success: true,
      message: 'Settings reset to defaults',
      settings: defaultSettings,
    });
  } catch (error) {
    console.error('Settings reset error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset settings',
    });
  }
});

// Check code availability
router.post('/check-code', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 3) {
      return res.json({
        available: false,
        message: 'Code must be exactly 3 characters',
      });
    }

    const normalizedCode = code.toUpperCase();
    const existingUser = await User.findOne({
      where: { code: normalizedCode },
    });

    if (existingUser && existingUser.id !== req.user.id) {
      return res.json({
        available: false,
        message: 'Code already taken',
      });
    }

    res.json({
      available: true,
      message: 'Code available',
    });
  } catch (error) {
    console.error('Code check error:', error);
    res.status(500).json({
      available: false,
      message: 'Error checking code availability',
    });
  }
});

module.exports = router;
