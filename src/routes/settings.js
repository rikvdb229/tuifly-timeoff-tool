// src/routes/settings.js - Updated to include environment variables

const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');

const router = express.Router();

// Apply middleware
router.use(requireAuth);
router.use(requireOnboarding);

// Get all settings and environment variables
router.get('/', async (req, res) => {
  try {
    const { UserSetting } = require('../models');

    // Get user settings
    const userSettings = await UserSetting.getUserSettings(req.user.id);

    // Include environment variables for frontend
    const globalSettings = {
      TUIFLY_APPROVER_EMAIL:
        process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be',
      MIN_ADVANCE_DAYS: parseInt(process.env.MIN_ADVANCE_DAYS || '60'),
      MAX_ADVANCE_DAYS: parseInt(process.env.MAX_ADVANCE_DAYS || '120'),
      MAX_DAYS_PER_REQUEST: parseInt(process.env.MAX_DAYS_PER_REQUEST || '4'),
      EMPLOYEE_CODE: process.env.EMPLOYEE_CODE || req.user.code || 'XXX',
      EMPLOYEE_NAME: process.env.EMPLOYEE_NAME || req.user.name || 'User',
    };

    res.json({
      success: true,
      data: {
        userSettings,
        globalSettings,
        user: req.user.toSafeObject(),
      },
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings',
    });
  }
});

// Update profile information
router.post('/profile', async (req, res) => {
  try {
    const { name, code, signature } = req.body;

    // Validation
    if (!name || !code || !signature) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required',
      });
    }

    if (code.length !== 3 || !/^[A-Z]{3}$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: 'Code must be exactly 3 uppercase letters',
      });
    }

    // Check if code is already taken by another user
    const { User } = require('../models');
    const existingUser = await User.findByCode(code);
    if (existingUser && existingUser.id !== req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'This code is already taken by another user',
      });
    }

    // Update user profile
    await req.user.update({
      name: name.trim(),
      code: code.toUpperCase(),
      signature: signature.trim(),
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

// Update user settings (bulk update)
router.post('/', async (req, res) => {
  try {
    const { UserSetting } = require('../models');
    const settings = req.body;

    // Validate settings format
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid settings format',
      });
    }

    // Update each setting
    const allowedSettings = UserSetting.getAllowedSettings();
    const updatedSettings = {};

    for (const [key, value] of Object.entries(settings)) {
      if (allowedSettings.includes(key)) {
        const settingType = typeof value === 'boolean' ? 'boolean' : 'string';
        await UserSetting.updateUserSetting(
          req.user.id,
          key,
          value,
          settingType
        );
        updatedSettings[key] = value;
      }
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: updatedSettings,
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
    });
  }
});

// Update single setting
router.post('/:key', async (req, res) => {
  try {
    const { UserSetting } = require('../models');
    const { key } = req.params;
    const { value } = req.body;

    // Validate setting key
    const allowedSettings = UserSetting.getAllowedSettings();
    if (!allowedSettings.includes(key)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid setting key',
      });
    }

    // Update setting
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
    const { UserSetting } = require('../models');
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
    const { User } = require('../models');
    const existingUser = await User.findByCode(normalizedCode);

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

// Get environment configuration (read-only)
router.get('/environment', (req, res) => {
  res.json({
    success: true,
    data: {
      TUIFLY_APPROVER_EMAIL:
        process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be',
      MIN_ADVANCE_DAYS: parseInt(process.env.MIN_ADVANCE_DAYS || '60'),
      MAX_ADVANCE_DAYS: parseInt(process.env.MAX_ADVANCE_DAYS || '120'),
      MAX_DAYS_PER_REQUEST: parseInt(process.env.MAX_DAYS_PER_REQUEST || '4'),
      // Don't expose sensitive environment variables
      NODE_ENV: process.env.NODE_ENV || 'development',
      VERSION: '2.0.0',
    },
  });
});

module.exports = router;
