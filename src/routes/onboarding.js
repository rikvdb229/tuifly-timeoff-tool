// src/routes/onboarding.js
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
});

// Onboarding page
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId);

    if (!user) {
      return res.redirect('/auth/login');
    }

    // If user is already onboarded, redirect to dashboard
    if (user.isOnboarded()) {
      return res.redirect('/');
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

// Complete onboarding
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

    const { name, code, signature } = value;

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

    // Update user with onboarding data
    const user = await updateUserOnboarding(req.session.userId, {
      name,
      code: code.toUpperCase(),
      signature,
    });

    // Update session
    req.session.needsOnboarding = false;

    res.json({
      success: true,
      message: 'Profile completed successfully',
      user: user.toSafeObject(),
      redirect: '/',
    });
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
