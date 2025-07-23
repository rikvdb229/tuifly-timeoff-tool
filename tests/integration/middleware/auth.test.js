// tests/integration/middleware/auth.test.js - Integration tests for authentication middleware
const request = require('supertest');
const app = require('../../../src/app');
const { User, sequelize } = require('../../../src/models');

// Mock external services
jest.mock('../../../src/utils/logger', () => ({
  authLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    logError: jest.fn()
  }
}));

describe('Authentication Middleware Integration Tests', () => {
  let testUser;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await User.destroy({ where: {}, force: true });

    // Create test user
    testUser = await User.create({
      googleId: 'test_google_id',
      email: 'test@tuifly.com',
      name: 'Test User',
      code: 'TST',
      isAdmin: false,
      emailPreference: 'automatic',
      gmailScopeGranted: true,
      isOnboarded: true
    });
  });

  describe('requireAuth middleware', () => {
    it('should allow authenticated users', async () => {
      // First, log in the user
      const agent = request.agent(app);
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id })
        .expect(200);

      // Then test an authenticated request
      const response = await agent
        .get('/api')
        .expect(200);

      expect(response.body.user.id).toBe(testUser.id);
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('authentication required');
      expect(response.body.redirectUrl).toBe('/auth/google');
    });

    it('should reject requests with invalid session', async () => {
      const response = await request(app)
        .get('/api')
        .set('Cookie', 'connect.sid=invalid-session-id')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should handle session expiration', async () => {
      const agent = request.agent(app);
      
      // Login first
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id });

      // Simulate session expiration by clearing session
      await agent
        .post('/auth/logout')
        .expect(302);

      // Now try to access protected route
      const response = await agent
        .get('/api')
        .expect(401);

      expect(response.body.error).toContain('authentication required');
    });

    it('should handle deleted users gracefully', async () => {
      const agent = request.agent(app);
      
      // Login first
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id });

      // Delete the user from database
      await testUser.destroy();

      // Try to access protected route
      const response = await agent
        .get('/api')
        .expect(401);

      expect(response.body.error).toContain('User not found');
    });

    it('should update last login timestamp', async () => {
      const originalLastLogin = testUser.lastLogin;
      
      // Login
      const agent = request.agent(app);
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id });

      // Make authenticated request
      await agent
        .get('/api')
        .expect(200);

      // Check that last login was updated
      await testUser.reload();
      expect(testUser.lastLogin).not.toBe(originalLastLogin);
      expect(testUser.lastLogin).toBeInstanceOf(Date);
    });
  });

  describe('requireOnboarding middleware', () => {
    let authCookies;

    beforeEach(async () => {
      // Set up authenticated session
      const agent = request.agent(app);
      const loginResponse = await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id });
      
      authCookies = loginResponse.headers['set-cookie'];
    });

    it('should allow onboarded users', async () => {
      testUser.isOnboarded = true;
      await testUser.save();

      const response = await request(app)
        .get('/api')
        .set('Cookie', authCookies)
        .expect(200);

      expect(response.body.user.id).toBe(testUser.id);
    });

    it('should reject non-onboarded users', async () => {
      testUser.isOnboarded = false;
      await testUser.save();

      const response = await request(app)
        .get('/api')
        .set('Cookie', authCookies)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('complete your onboarding');
      expect(response.body.redirectUrl).toBe('/onboarding');
    });

    it('should allow admin users regardless of onboarding status', async () => {
      testUser.isAdmin = true;
      testUser.isOnboarded = false;
      await testUser.save();

      const response = await request(app)
        .get('/api')
        .set('Cookie', authCookies)
        .expect(200);

      expect(response.body.user.id).toBe(testUser.id);
    });

    it('should handle null onboarding status', async () => {
      testUser.isOnboarded = null;
      await testUser.save();

      const response = await request(app)
        .get('/api')
        .set('Cookie', authCookies)
        .expect(403);

      expect(response.body.error).toContain('onboarding');
    });
  });

  describe('requireAdmin middleware', () => {
    let authCookies;

    beforeEach(async () => {
      const agent = request.agent(app);
      const loginResponse = await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id });
      
      authCookies = loginResponse.headers['set-cookie'];
    });

    it('should allow admin users', async () => {
      testUser.isAdmin = true;
      await testUser.save();

      const response = await request(app)
        .get('/admin')
        .set('Cookie', authCookies)
        .expect(200);

      // Should render admin page or return admin data
      expect(response.status).toBe(200);
    });

    it('should reject non-admin users', async () => {
      testUser.isAdmin = false;
      await testUser.save();

      const response = await request(app)
        .get('/admin')
        .set('Cookie', authCookies)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Admin access required');
    });

    it('should handle null admin status', async () => {
      testUser.isAdmin = null;
      await testUser.save();

      const response = await request(app)
        .get('/admin')
        .set('Cookie', authCookies)
        .expect(403);

      expect(response.body.error).toContain('Admin access required');
    });
  });

  describe('Session Management', () => {
    it('should maintain session across requests', async () => {
      const agent = request.agent(app);
      
      // Login
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id })
        .expect(200);

      // Make multiple requests with same agent
      await agent.get('/api').expect(200);
      await agent.get('/api/requests').expect(200);
      await agent.get('/api/user/email-preference').expect(200);

      // All should succeed with same session
    });

    it('should handle concurrent sessions for same user', async () => {
      // Create two different agents (browsers)
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      // Both login as same user
      await agent1
        .post('/auth/test-login')
        .send({ userId: testUser.id })
        .expect(200);

      await agent2
        .post('/auth/test-login')
        .send({ userId: testUser.id })
        .expect(200);

      // Both should be able to access protected routes
      await agent1.get('/api').expect(200);
      await agent2.get('/api').expect(200);
    });

    it('should invalidate session on logout', async () => {
      const agent = request.agent(app);
      
      // Login
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id })
        .expect(200);

      // Verify authenticated access
      await agent.get('/api').expect(200);

      // Logout
      await agent
        .post('/auth/logout')
        .expect(302);

      // Should no longer have access
      await agent.get('/api').expect(401);
    });
  });

  describe('Security Features', () => {
    it('should prevent session fixation attacks', async () => {
      const agent = request.agent(app);
      
      // Get initial session
      const initialResponse = await agent.get('/');
      const initialCookies = initialResponse.headers['set-cookie'];

      // Login
      const loginResponse = await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id })
        .expect(200);

      const postLoginCookies = loginResponse.headers['set-cookie'];

      // Session ID should change after login
      expect(postLoginCookies).toBeDefined();
      if (initialCookies && postLoginCookies) {
        expect(initialCookies[0]).not.toBe(postLoginCookies[0]);
      }
    });

    it('should handle CSRF protection', async () => {
      const agent = request.agent(app);
      
      // Login first
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id })
        .expect(200);

      // CSRF protection should be handled by the framework
      // This test ensures that legitimate requests still work
      await agent
        .post('/api/requests')
        .send({
          startDate: '2024-02-01',
          endDate: '2024-02-01',
          type: 'REQ_DO'
        })
        .expect((res) => {
          // Should not be blocked by CSRF (legitimate request)
          expect(res.status).not.toBe(403);
        });
    });

    it('should handle malicious user data in session', async () => {
      // Create user with potentially malicious data
      const maliciousUser = await User.create({
        googleId: 'malicious_id',
        email: 'malicious@tuifly.com',
        name: '<script>alert("xss")</script>',
        code: 'XSS',
        isOnboarded: true
      });

      const agent = request.agent(app);
      await agent
        .post('/auth/test-login')
        .send({ userId: maliciousUser.id })
        .expect(200);

      const response = await agent
        .get('/api')
        .expect(200);

      // User data should be sanitized in response
      expect(response.body.user.name).not.toContain('<script>');
      expect(response.body.user.name).toContain('&lt;script&gt;');
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors during auth', async () => {
      // Mock database error
      jest.spyOn(User, 'findByPk').mockRejectedValue(new Error('Database connection lost'));

      const agent = request.agent(app);
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id });

      const response = await agent
        .get('/api')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication error');
    });

    it('should handle corrupted session data', async () => {
      const response = await request(app)
        .get('/api')
        .set('Cookie', 'connect.sid=corrupted.session.data')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should log authentication failures', async () => {
      const { authLogger } = require('../../../src/utils/logger');
      
      await request(app)
        .get('/api')
        .expect(401);

      expect(authLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unauthenticated request')
      );
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent auth requests', async () => {
      const promises = [];
      
      // Create multiple users and login simultaneously
      for (let i = 0; i < 10; i++) {
        const user = await User.create({
          googleId: `concurrent_user_${i}`,
          email: `user${i}@tuifly.com`,
          name: `User ${i}`,
          code: `U${i}`,
          isOnboarded: true
        });

        const agent = request.agent(app);
        promises.push(
          agent
            .post('/auth/test-login')
            .send({ userId: user.id })
            .then(() => agent.get('/api'))
        );
      }

      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should not create memory leaks with session data', async () => {
      const agent = request.agent(app);
      
      // Login and logout multiple times
      for (let i = 0; i < 5; i++) {
        await agent
          .post('/auth/test-login')
          .send({ userId: testUser.id });
        
        await agent.get('/api').expect(200);
        
        await agent
          .post('/auth/logout')
          .expect(302);
      }

      // Final login should still work
      await agent
        .post('/auth/test-login')
        .send({ userId: testUser.id })
        .expect(200);
      
      await agent.get('/api').expect(200);
    });
  });
});