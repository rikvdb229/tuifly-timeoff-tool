// src/routes/index.js - Updated to pass environment variables to templates

const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and onboarding middleware to all routes
router.use(requireAuth);
router.use(requireOnboarding);

// Calendar Dashboard - Main page (now uses layout system)
router.get('/', (req, res) => {
  // Meta tags for calendar configuration
  const metaTags = `
    <meta name="min-advance-days" content="${process.env.MIN_ADVANCE_DAYS || 60}">
    <meta name="max-advance-days" content="${process.env.MAX_ADVANCE_DAYS || 120}">
    <meta name="max-days-per-request" content="${process.env.MAX_DAYS_PER_REQUEST || 4}">
  `;

  // Pass environment variables to template
  const templateData = {
    title: 'TUIfly Time-Off Calendar',
    body: '../pages/calendar-dashboard',
    additionalCSS: ['calendar'],
    additionalJS: [
      '../calendar/calendar-core',
      '../calendar/calendar-events',
      '../calendar/calendar-requests',
      '../calendar/calendar-ui',
    ],
    metaTags: metaTags,
    user: req.user.toSafeObject(),
    // Environment variables for templates
    env: {
      TUIFLY_APPROVER_EMAIL:
        process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be',
      MIN_ADVANCE_DAYS: parseInt(process.env.MIN_ADVANCE_DAYS || '60'),
      MAX_ADVANCE_DAYS: parseInt(process.env.MAX_ADVANCE_DAYS || '120'),
      MAX_DAYS_PER_REQUEST: parseInt(process.env.MAX_DAYS_PER_REQUEST || '4'),
      EMPLOYEE_CODE: req.user.code || process.env.EMPLOYEE_CODE || 'XXX',
      EMPLOYEE_NAME: req.user.name || process.env.EMPLOYEE_NAME || 'User',
    },
  };

  res.render('layouts/base', templateData);
});

// Legacy dashboard redirect (for bookmarks)
router.get('/dashboard', (req, res) => {
  res.redirect('/');
});

// Roster deadlines page
router.get('/roster-deadlines', (req, res) => {
  res.sendFile('roster-deadlines.html', { root: './public/html' });
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
    configuration: {
      approverEmail:
        process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be',
      minAdvanceDays: parseInt(process.env.MIN_ADVANCE_DAYS || '60'),
      maxAdvanceDays: parseInt(process.env.MAX_ADVANCE_DAYS || '120'),
    },
  });
});

module.exports = router;
