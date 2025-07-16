// src/routes/settings.js
const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');
const { User, UserSetting } = require('../models');
const Joi = require('joi');

const router = express.Router();

// Apply authentication middleware
router.use(requireAuth);
router.use(requireOnboarding);

// Validation schemas
const profileUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  code: Joi.string()
    .length(3)
    .pattern(/^[A-Z]{3}$/)
    .required(),
  signature: Joi.string().min(2).max(200).required(),
});

const settingUpdateSchema = Joi.object({
  theme: Joi.string().valid('light', 'dark'),
  notifications: Joi.boolean(),
  timezone: Joi.string(),
  language: Joi.string().valid('en', 'nl', 'fr', 'de'),
  autoSave: Joi.boolean(),
  emailFrequency: Joi.string().valid('immediate', 'daily', 'weekly', 'never'),
});

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

// Get settings (API endpoint)
router.get('/api', async (req, res) => {
  try {
    const userSettings = await UserSetting.getUserSettings(req.user.id);

    res.json({
      success: true,
      data: {
        user: req.user.toSafeObject(),
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
    console.error('Settings API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings',
    });
  }
});

// Update profile
router.put('/profile', async (req, res) => {
  try {
    const { error, value } = profileUpdateSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((detail) => ({
          field: detail.path[0],
          message: detail.message,
        })),
      });
    }

    const { name, code, signature } = value;

    // Check if code is already taken by another user
    const existingUser = await User.findByCode(code);
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
    const { error, value } = settingUpdateSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((detail) => ({
          field: detail.path[0],
          message: detail.message,
        })),
      });
    }

    // Update each setting
    const updatedSettings = {};
    for (const [key, val] of Object.entries(value)) {
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

module.exports = router;
