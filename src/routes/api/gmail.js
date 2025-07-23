// src/routes/api/gmail-new.js - Refactored Gmail integration endpoints using services
const express = require('express');
const { serviceContainer } = require('../../services');
const { routeLogger } = require('../../utils/logger');

const router = express.Router();

// GET Gmail connection status
router.get('/gmail/status', async (req, res) => {
  try {
    const userService = serviceContainer.getService('userService');
    const status = await userService.checkGmailAuthorization(req.user);

    routeLogger.info('Gmail status checked', { 
      userId: req.user.id, 
      userEmail: req.user.email, 
      connected: status.connected, 
      authValid: status.authValid, 
      needsReauth: status.needsReauth, 
      operation: 'checkGmailStatus' 
    });

    res.json({
      success: true,
      data: status,
      message: status.connected
        ? 'Gmail is connected and ready'
        : 'Gmail needs to be connected',
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'checkGmailStatus', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/gmail/status' 
    });
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to get Gmail status',
      message: error.message,
    });
  }
});

module.exports = router;
