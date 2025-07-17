// src/routes/onboarding.js - Updated to pass environment variables

const express = require('express');
const { requireAuth, requireGuest } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware (user must be logged in)
router.use(requireAuth);

// Onboarding page
router.get('/', (req, res) => {
  // Check if user is already onboarded
  if (req.user.isOnboarded()) {
    return res.redirect('/');
  }

  // Check if user needs admin approval
  if (req.user.needsAdminApproval()) {
    return res.redirect('/waiting-approval');
  }

  // Prepare environment variables for template
  const templateData = {
    title: 'Complete Your Profile - TUIfly Time-Off Tool',
    user: req.user.toSafeObject(),
    // Environment variables for auto-fill
    env: {
      TUIFLY_APPROVER_EMAIL:
        process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be',
      EMPLOYEE_CODE: process.env.EMPLOYEE_CODE || '',
      EMPLOYEE_NAME: process.env.EMPLOYEE_NAME || '',
      DEFAULT_SIGNATURE:
        process.env.DEFAULT_SIGNATURE ||
        `Best regards,\n${req.user.name || 'Your Name'}`,
    },
  };

  res.render('pages/onboarding', templateData);
});

// Waiting for approval page
router.get('/waiting-approval', requireAuth, (req, res) => {
  // Only show if user actually needs approval
  if (!req.user.needsAdminApproval()) {
    return res.redirect('/');
  }

  const templateData = {
    title: 'Waiting for Approval',
    user: req.user.toSafeObject(),
    env: {
      TUIFLY_APPROVER_EMAIL:
        process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be',
    },
  };

  res.render('pages/waiting-approval', templateData);
});

// Complete onboarding
router.post('/complete', async (req, res) => {
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
      onboardedAt: new Date(),
    });

    // Send admin notification for approval if user is not admin
    if (!req.user.isAdmin) {
      const emailService = require('../services/emailNotificationService');
      await emailService.notifyAdminOfNewUser(req.user);
    }

    res.json({
      success: true,
      message: 'Profile completed successfully!',
      requiresApproval: req.user.needsAdminApproval(),
    });
  } catch (error) {
    console.error('Onboarding completion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete onboarding',
    });
  }
});

// Check approval status (for polling)
router.get('/approval-status', (req, res) => {
  res.json({
    success: true,
    data: {
      isApproved: req.user.canUseApp(),
      needsApproval: req.user.needsAdminApproval(),
      isOnboarded: req.user.isOnboarded(),
      user: req.user.toSafeObject(),
    },
  });
});

module.exports = router;
