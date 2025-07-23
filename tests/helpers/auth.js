// tests/helpers/auth.js - Authentication test helpers
const request = require('supertest');

/**
 * Create an authenticated session for testing
 * @param {Object} app - Express app instance
 * @param {Object} user - User object
 * @returns {Promise<Object>} Agent with authenticated session
 */
async function createAuthenticatedSession(app, user) {
  const agent = request.agent(app);
  
  // Simulate login by setting session manually
  // This mimics what happens after successful Google OAuth
  const loginResponse = await agent
    .post('/test/auth/login')
    .send({ userId: user.id });
  
  if (loginResponse.status !== 200) {
    throw new Error(`Login failed with status ${loginResponse.status}: ${JSON.stringify(loginResponse.body)}`);
  }
    
  return agent;
}

/**
 * Create session cookies for direct request testing
 * @param {Object} app - Express app instance  
 * @param {Object} user - User object
 * @returns {Promise<String>} Cookie string for use in requests
 */
async function createSessionCookies(app, user) {
  const agent = await createAuthenticatedSession(app, user);
  
  // Make a request to get the session cookies
  const response = await agent.get('/health');
  const cookies = response.headers['set-cookie'];
  
  if (cookies && cookies.length > 0) {
    // Extract just the session cookie value
    return cookies.find(cookie => cookie.includes('tuifly.sid')) || cookies[0];
  }
  
  return null;
}

/**
 * Mock authentication middleware for testing
 * @param {Object} user - User to authenticate as
 * @returns {Function} Middleware function
 */
function mockAuth(user) {
  return (req, res, next) => {
    req.session = { userId: user.id };
    req.user = user;
    next();
  };
}

/**
 * Create a test login endpoint for easy authentication in tests
 * @param {Object} app - Express app instance
 */
function setupTestAuthRoutes(app) {
  const { User } = require('../../src/models');
  
  // Test-only login endpoint
  app.post('/test/auth/login', async (req, res) => {
    const { userId } = req.body;
    
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Set session like Google OAuth would
      req.session.userId = user.id;
      
      // Save session and respond
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session save failed', details: err.message });
        }
        res.json({ success: true, user: user.toSafeObject(), sessionId: req.sessionID });
      });
    } catch (error) {
      console.error('Test login error:', error);
      res.status(500).json({ error: 'Login failed', details: error.message });
    }
  });
  
  // Test-only logout endpoint
  app.post('/test/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });
}

module.exports = {
  createAuthenticatedSession,
  createSessionCookies,
  mockAuth,
  setupTestAuthRoutes
};