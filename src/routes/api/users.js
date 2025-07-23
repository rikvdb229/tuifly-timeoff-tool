// src/routes/api/users-new.js - Refactored user management endpoints using services
const express = require('express');
const { sanitizeRequestBody } = require('../../utils/sanitize');
const { serviceContainer } = require('../../services');
const { routeLogger } = require('../../utils/logger');

const router = express.Router();

// GET current user's email preference
router.get('/user/email-preference', async (req, res) => {
  try {
    const userService = serviceContainer.getService('userService');
    const data = await userService.getEmailPreference(req.user);

    res.json({
      success: true,
      data,
      user: userService.getUserSafeObject(req.user),
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'fetchUserEmailPreference', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/user/email-preference' 
    });
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to fetch email preference',
      message: error.message,
    });
  }
});

// PUT update user's email preference
router.put(
  '/user/email-preference',
  sanitizeRequestBody(['preference']),
  async (req, res) => {
    try {
      const userService = serviceContainer.getService('userService');
      const { preference } = req.body;

      const result = await userService.updateEmailPreference(
        req.user,
        preference
      );

      routeLogger.info('User email preference updated successfully', { 
        userId: req.user.id, 
        userEmail: req.user.email, 
        newPreference: result.emailPreference, 
        requiresGmailAuth: result.requiresGmailAuth, 
        operation: 'updateUserEmailPreference' 
      });

      res.json({
        success: true,
        message: result.message,
        data: {
          emailPreference: result.emailPreference,
          requiresGmailAuth: result.requiresGmailAuth,
          gmailScopeGranted: result.gmailScopeGranted,
        },
        user: userService.getUserSafeObject(req.user),
      });
    } catch (error) {
      routeLogger.logError(error, { 
        operation: 'updateUserEmailPreference', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        requestedPreference: req.body?.preference, 
        endpoint: 'PUT /user/email-preference' 
      });
      res.status(error.statusCode || 500).json({
        success: false,
        error: 'Failed to update email preference',
        message: error.message,
      });
    }
  }
);

module.exports = router;
