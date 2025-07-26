// src/routes/onboarding.js - MERGED VERSION (Original + Split OAuth)
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { User, updateUserOnboarding } = require('../models');
const Joi = require('joi');
const { sanitizeRequestBody } = require('../utils/sanitize');
const { routeLogger } = require('../utils/logger');

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
  // ✅ ADD: Email preference validation for split OAuth
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

    // ✅ ADD: Check for Gmail OAuth success/error (for split OAuth flow)
    const gmailSuccess = req.query.gmail_success === '1';
    const gmailError = req.query.error?.includes('gmail');
    const step = req.query.step || '1';
    res.render('layouts/base', {
      title: 'Welcome - Complete Your Profile',
      body: '../pages/onboarding',
      user: user.toSafeObject(),
      gmailSuccess, // ✅ ADD: Pass Gmail success status
      gmailError, // ✅ ADD: Pass Gmail error status
      step: step, // ✅ ADD: Pass step to template
      includeNavbar: false,
      additionalCSS: ['onboarding'],
      additionalJS: ['onboarding'],
      globalSettings: {
        MIN_ADVANCE_DAYS: process.env.MIN_ADVANCE_DAYS || 60,
        // MAX_ADVANCE_DAYS removed - now dynamically calculated as first selectable day + configurable months
        MAX_DAYS_PER_REQUEST: process.env.MAX_DAYS_PER_REQUEST || 4,
        TUIFLY_APPROVER_EMAIL: process.env.TUIFLY_APPROVER_EMAIL,
      },
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'loadOnboardingPage', 
      userId: req.session?.userId, 
      endpoint: '/onboarding' 
    });
    res.status(500).render('layouts/base', {
      title: 'Error',
      body: '../pages/error',
      error: 'Failed to load onboarding page',
      includeNavbar: false,
      additionalCSS: ['error'],
      additionalJS: [],
    });
  }
});

// ✅ ADD: Start Gmail OAuth flow (for split OAuth)
router.post('/start-gmail-oauth', requireAuth, async (req, res) => {
  try {
    // Set redirect target after Gmail OAuth completes
    req.session.gmailOAuthRedirect = '/onboarding?gmail_success=1&step=4';

    res.json({
      success: true,
      redirectUrl: '/auth/google/gmail',
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'startGmailOAuth', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/onboarding/start-gmail-oauth' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start Gmail authorization',
    });
  }
});

// Complete onboarding - MERGED VERSION
router.post(
  '/complete',
  requireAuth,
  sanitizeRequestBody(['name', 'code', 'signature', 'emailPreference']),
  async (req, res) => {
    try {
      const { error, value } = onboardingSchema.validate(req.body);

      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message,
          })),
        });
      }

      const { name, code, signature, emailPreference } = value;

      // ✅ KEEP: Original code uniqueness check
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

      // ✅ ADD: Check if user chose automatic email but doesn't have Gmail permissions
      if (emailPreference === 'automatic') {
        const user = await User.findByPk(req.session.userId);
        if (!user.gmailScopeGranted || !user.gmailAccessToken) {
          return res.status(400).json({
            success: false,
            error: 'Gmail permissions required for automatic email',
            details: [
              {
                field: 'emailPreference',
                message:
                  'Gmail authorization is required for automatic email sending',
              },
            ],
            requiresGmailAuth: true,
          });
        }
      }

      // ✅ KEEP: Original user update logic with added email preference
      await updateUserOnboarding(req.session.userId, {
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
        routeLogger.info('Onboarding completed - user can access app', { 
          userId: updatedUser.id, 
          userEmail: updatedUser.email, 
          userName: updatedUser.name, 
          userCode: updatedUser.code, 
          emailPreference: updatedUser.emailPreference, 
          isAdmin: updatedUser.isAdmin, 
          operation: 'completeOnboarding' 
        });
        res.json({
          success: true,
          message:
            'Profile completed successfully! Welcome to TUIfly Time-Off.',
          user: updatedUser.toSafeObject(),
          redirect: '/',
          redirectUrl: '/', // ✅ ADD: Alternative redirect property
        });
      } else {
        // User needs admin approval - go to waiting page
        routeLogger.info('Onboarding completed - user needs admin approval', { 
          userId: updatedUser.id, 
          userEmail: updatedUser.email, 
          userName: updatedUser.name, 
          userCode: updatedUser.code, 
          emailPreference: updatedUser.emailPreference, 
          operation: 'completeOnboarding' 
        });
        res.json({
          success: true,
          message:
            'Profile completed successfully! Your account is now pending admin approval.',
          user: updatedUser.toSafeObject(),
          redirect: '/auth/waiting-approval',
          redirectUrl: '/auth/waiting-approval', // ✅ ADD: Alternative redirect property
        });
      }
    } catch (error) {
      routeLogger.logError(error, { 
        operation: 'completeOnboarding', 
        userId: req.session?.userId, 
        requestData: { 
          name: req.body?.name, 
          code: req.body?.code, 
          emailPreference: req.body?.emailPreference 
        }, 
        endpoint: '/onboarding/complete' 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to complete onboarding',
      });
    }
  }
);

// ✅ KEEP: Original code availability check
router.post(
  '/check-code',
  requireAuth,
  sanitizeRequestBody(['code']),
  async (req, res) => {
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
      routeLogger.logError(error, { 
        operation: 'checkCode', 
        userId: req.session?.userId, 
        code: req.body?.code, 
        endpoint: '/onboarding/check-code' 
      });
      res.status(500).json({
        available: false,
        message: 'Error checking code availability',
      });
    }
  }
);

// ✅ ADD: Check Gmail authorization status (for onboarding)
router.get('/gmail-status', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId);

    res.json({
      success: true,
      gmailAuthorized: user.gmailScopeGranted && !!user.gmailAccessToken,
      emailPreference: user.emailPreference,
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'checkGmailStatus', 
      userId: req.session?.userId, 
      endpoint: '/onboarding/gmail-status' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to check Gmail status',
    });
  }
});

module.exports = router;
