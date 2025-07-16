// src/routes/index.js
const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and onboarding middleware to all routes
router.use(requireAuth);
router.use(requireOnboarding);

// Calendar Dashboard - Main page (now protected)
router.get('/', (req, res) => {
  res.render('pages/calendar-dashboard', {
    title: 'TUIfly Time-Off Calendar',
    user: req.user.toSafeObject(),
  });
});

// Legacy dashboard redirect (for bookmarks)
router.get('/dashboard', (req, res) => {
  res.redirect('/');
});

// API documentation page (protected)
router.get('/api-docs', (req, res) => {
  res.json({
    message: 'TUIfly Time-Off API Documentation',
    baseUrl: '/api',
    user: req.user.toSafeObject(),
    endpoints: {
      'GET /api/requests': 'Get all time-off requests',
      'POST /api/requests': 'Create single time-off request',
      'POST /api/requests/group': 'Create group time-off request (multi-day)',
      'PUT /api/requests/:id': 'Update time-off request',
      'DELETE /api/requests/:id': 'Delete time-off request',
      'GET /api/requests/:id': 'Get specific time-off request',
      'GET /api/requests/group/:groupId': 'Get requests by group ID',
      'GET /api/requests/conflicts': 'Check for date conflicts',
      'GET /api/requests/status/:status': 'Filter requests by status',
    },
    requestTypes: ['REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT'],
    statusTypes: ['PENDING', 'APPROVED', 'DENIED'],
    groupRequestFormat: {
      dates: [
        { date: '2025-02-15', type: 'REQ_DO' },
        { date: '2025-02-16', type: 'PM_OFF' },
        { date: '2025-02-17', type: 'FLIGHT', flightNumber: 'TB123' },
      ],
      customMessage: 'Wedding weekend',
    },
  });
});

module.exports = router;
