// tests/integration/setup.js - Integration test setup
const { setupTestAuthRoutes } = require('../helpers/auth');

/**
 * Setup integration test environment
 * @param {Object} app - Express app instance
 */
function setupIntegrationTests(app) {
  // Add test authentication routes
  setupTestAuthRoutes(app);
  
  // Disable rate limiting for tests
  if (process.env.NODE_ENV === 'test') {
    // Mock rate limiting middleware to be permissive
    const originalRateLimit = require('express-rate-limit');
    jest.mock('express-rate-limit', () => {
      return () => (req, res, next) => next();
    });
  }
}

module.exports = {
  setupIntegrationTests
};