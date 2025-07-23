// src/routes/api-new.js - Refactored API router with domain-specific routes
const express = require('express');
const { applyApiMiddleware } = require('./api/middleware');

const router = express.Router();

// Apply authentication middleware to all API routes
applyApiMiddleware(router);

// API Info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TUIfly Time-Off API',
    version: '2.0.0',
    user: req.user.toSafeObject(),
    endpoints: {
      'GET /api/requests': 'Get all time-off requests for current user',
      'POST /api/requests': 'Create new time-off request',
      'POST /api/requests/group':
        'Create group time-off request (consecutive dates)',
      'POST /api/requests/group-manual':
        'Create group request with manual email already sent',
      'PUT /api/requests/:id': 'Update time-off request',
      'DELETE /api/requests/:id': 'Delete time-off request',
      'GET /api/requests/:id': 'Get specific time-off request',
      'GET /api/requests/group/:groupId': 'Get requests by group ID',
      'GET /api/requests/conflicts': 'Check for date conflicts',
      'GET /api/requests/stats': 'Get request statistics',
      'GET /api/user/email-preference': 'Get user email preference',
      'PUT /api/user/email-preference': 'Update user email preference',
      'GET /api/gmail/status': 'Check Gmail connection status',
      'POST /api/requests/:id/resend-email':
        'Resend email for specific request',
      'GET /api/requests/:id/email-content': 'Get email content (manual mode)',
      'POST /api/requests/:id/mark-email-sent': 'Mark manual email as sent',
      'GET /api/requests/:id/group-email-content': 'Get group email content',
      'GET /api/requests/:id/group-details': 'Get group details',
      'PUT /api/requests/:id/status': 'Update request status manually',
      'DELETE /api/requests/:id/delete-group': 'Delete entire group',
    },
  });
});

// Mount domain-specific route modules
const requestsRoutes = require('./api/requests');
const groupRequestsRoutes = require('./api/group-requests');
const usersRoutes = require('./api/users');
const gmailRoutes = require('./api/gmail');
const emailsRoutes = require('./api/emails');
const statusRoutes = require('./api/status');

router.use('/', requestsRoutes);
router.use('/', groupRequestsRoutes);
router.use('/', usersRoutes);
router.use('/', gmailRoutes);
router.use('/', emailsRoutes);
router.use('/', statusRoutes);

module.exports = router;
