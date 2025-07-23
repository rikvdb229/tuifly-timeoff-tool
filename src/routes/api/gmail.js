// src/routes/api/gmail-new.js - Refactored Gmail integration endpoints using services
const express = require('express');
const { serviceContainer } = require('../../services');

const router = express.Router();

// GET Gmail connection status
router.get('/gmail/status', async (req, res) => {
  try {
    const userService = serviceContainer.getService('userService');
    const status = await userService.checkGmailAuthorization(req.user);

    console.log('📧 Gmail status for', req.user.email, ':', status);

    res.json({
      success: true,
      data: status,
      message: status.connected
        ? 'Gmail is connected and ready'
        : 'Gmail needs to be connected',
    });
  } catch (error) {
    console.error('Error getting Gmail status:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: 'Failed to get Gmail status',
      message: error.message,
    });
  }
});

module.exports = router;
