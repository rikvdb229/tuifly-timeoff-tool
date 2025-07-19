// src/routes/onboarding.js - COMPLETE FIXED VERSION
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { User, updateUserOnboarding } = require('../models');
const Joi = require('joi');

const router = express.Router();

// Onboarding validation schema
const onboardingSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name must not exceed 100 characters',
    'any.required': 'Name is required',
  }),
  code: Joi.string()
    .length(3)
    .pattern(/^[A-Z]{3}$/)
    .required()
    .messages({
      'string.length': 'Code must be exactly 3 characters',
      'string.pattern.base': 'Code must contain only uppercase letters',
      'any.required': 'Code is required',
    }),
  signature: Joi.string().min(2).max(200).required().messages({
    'string.min': 'Signature must be at least 2 characters',
    'string.max': 'Signature must not exceed 200 characters',
    'any.required': 'Signature is required',
  }),
  // ✅ ADD: Email preference validation
  emailPreference: Joi.string()
    .valid('automatic', 'manual')
    .default('manual')
    .messages({
      'any.only': 'Email preference must be either "automatic" or "manual"',
    }),
});

// Onboarding page
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId);

    if (!user) {
      return res.redirect('/auth/login');
    }

    // If user is already onboarded, check where they should go
    if (user.isOnboarded()) {
      if (user.canUseApp()) {
        return res.redirect('/');
      } else {
        return res.redirect('/auth/waiting-approval');
      }
    }

    res.render('pages/onboarding', {
      title: 'Welcome - Complete Your Profile',
      user: user.toSafeObject(),
      globalSettings: {
        MIN_ADVANCE_DAYS: process.env.MIN_ADVANCE_DAYS || 60,
        MAX_ADVANCE_DAYS: process.env.MAX_ADVANCE_DAYS || 120,
        MAX_DAYS_PER_REQUEST: process.env.MAX_DAYS_PER_REQUEST || 4,
        TUIFLY_APPROVER_EMAIL: process.env.TUIFLY_APPROVER_EMAIL,
      },
    });
  } catch (error) {
    console.error('Onboarding page error:', error);
    res.status(500).render('pages/error', {
      title: 'Error',
      error: 'Failed to load onboarding page',
    });
  }
});

// Complete onboarding - FIXED VERSION
router.post('/complete', requireAuth, async (req, res) => {
  try {
    const { error, value } = onboardingSchema.validate(req.body);

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

    const { name, code, signature, emailPreference } = value;

    // Check if code is already taken
    const existingUser = await User.findByCode(code);
    if (existingUser && existingUser.id !== req.session.userId) {
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

    // Update user with onboarding data including email preference
    const user = await updateUserOnboarding(req.session.userId, {
      name,
      code: code.toUpperCase(),
      signature,
      emailPreference, // ✅ ADD: Include email preference
    });

    // Update session
    req.session.needsOnboarding = false;

    // Fetch fresh user data to ensure we have the latest state
    const updatedUser = await User.findByPk(req.session.userId);

    if (updatedUser.canUseApp()) {
      // User is admin or already approved - go to dashboard
      console.log(
        `✅ Onboarding complete - User ${updatedUser.email} can access app`
      );
      res.json({
        success: true,
        message: 'Profile completed successfully! Welcome to TUIfly Time-Off.',
        user: updatedUser.toSafeObject(),
        redirect: '/',
      });
    } else {
      // User needs admin approval - go to waiting page
      console.log(
        `⏳ Onboarding complete - User ${updatedUser.email} needs admin approval`
      );
      res.json({
        success: true,
        message:
          'Profile completed successfully! Your account is now pending admin approval.',
        user: updatedUser.toSafeObject(),
        redirect: '/auth/waiting-approval',
      });
    }
  } catch (error) {
    console.error('Onboarding completion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete onboarding',
    });
  }
});

// Check code availability
router.post('/check-code', requireAuth, async (req, res) => {
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

    if (existingUser && existingUser.id !== req.session.userId) {
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
