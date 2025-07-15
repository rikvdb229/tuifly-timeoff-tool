const express = require('express');
const router = express.Router();

// Home page - Time-off request dashboard
router.get('/', (req, res) => {
  res.render('pages/dashboard', {
    title: 'TUIfly Time-Off Tool - Dashboard',
  });
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  });
});

// Create new request page
router.get('/create', (req, res) => {
  res.render('pages/create-request', {
    title: 'Create New Request',
  });
});

// View all requests page
router.get('/requests', (req, res) => {
  res.render('pages/view-requests', {
    title: 'View All Requests',
  });
});

module.exports = router;
