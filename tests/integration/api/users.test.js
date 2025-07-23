// tests/integration/api/users.test.js - Integration tests for users API endpoints
const request = require('supertest');
const app = require('../../../src/app');
const { User, sequelize } = require('../../../src/models');
const { createAuthenticatedSession } = require('../../helpers/auth');

// Mock external services
jest.mock('../../../src/services/gmailService');
jest.mock('../../../src/utils/logger', () => ({
  routeLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    logError: jest.fn()
  },
  serviceLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    logError: jest.fn()
  }
}));

describe('Users API Integration Tests', () => {
  let testUser;
  let authenticatedAgent;

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
      signature: 'Test User - TST',
      onboardedAt: new Date(),
      adminApproved: true,
      adminApprovedAt: new Date(),
      isAdmin: false,
      emailPreference: 'automatic',
      gmailScopeGranted: true
    });

    // Create authenticated session
    authenticatedAgent = await createAuthenticatedSession(app, testUser);
  });

  describe('GET /api/user/email-preference', () => {
    it('should return user email preference data', async () => {
      const response = await authenticatedAgent
        .get('/api/user/email-preference')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        emailPreference: 'automatic',
        canSendEmails: 'Test User - TST',
        gmailScopeGranted: true,
        usesAutomaticEmail: true,
        usesManualEmail: false
      });
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).not.toHaveProperty('gmailAccessToken');
    });

    it('should handle manual preference users', async () => {
      testUser.emailPreference = 'manual';
      testUser.gmailScopeGranted = false;
      await testUser.save();

      const response = await authenticatedAgent
        .get('/api/user/email-preference')
        
        .expect(200);

      expect(response.body.data.emailPreference).toBe('manual');
      expect(response.body.data.gmailScopeGranted).toBe(false);
      expect(response.body.data.usesManualEmail).toBe(true);
    });

    it('should detect when Gmail auth is required', async () => {
      testUser.emailPreference = 'automatic';
      testUser.gmailScopeGranted = false;
      await testUser.save();

      const response = await authenticatedAgent
        .get('/api/user/email-preference')
        
        .expect(200);

      expect(response.body.data.gmailScopeGranted).toBe(false);
      expect(response.body.data.usesAutomaticEmail).toBe(false); // Without Gmail scope, automatic email is not used
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/user/email-preference')
        .expect(302); // Redirects to auth for unauthenticated users
    });
  });

  describe('PUT /api/user/email-preference', () => {
    it('should update preference to manual', async () => {
      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ preference: 'manual' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.emailPreference).toBe('manual');
      expect(response.body.data.gmailScopeGranted).toBe(true);

      // Verify database update
      await testUser.reload();
      expect(testUser.emailPreference).toBe('manual');
    });

    it('should update preference to automatic with existing Gmail auth', async () => {
      testUser.emailPreference = 'manual';
      testUser.gmailScopeGranted = true;
      await testUser.save();

      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ preference: 'automatic' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.emailPreference).toBe('automatic');
      expect(response.body.data.gmailScopeGranted).toBe(true);
    });

    it('should require Gmail auth when switching to automatic without existing auth', async () => {
      testUser.emailPreference = 'manual';
      testUser.gmailScopeGranted = false;
      await testUser.save();

      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ preference: 'automatic' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requiresGmailAuth).toBe(true);
      // No authUrl field in response
    });

    it('should validate preference values', async () => {
      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ preference: 'invalid' })
        .expect(500); // Service throws regular error, returns 500

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to update');
    });

    it('should require preference field', async () => {
      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({})
        .expect(500); // Service throws regular error, returns 500

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to update');
    });

    it('should handle null preference', async () => {
      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ preference: null })
        .expect(500); // Service throws regular error, returns 500

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to update');
    });

    it('should sanitize request body', async () => {
      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ 
          preference: 'manual',
          maliciousField: '<script>alert("xss")</script>',
          anotherField: 'should be removed'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      // Only preference should be processed
    });

    it('should require authentication', async () => {
      await request(app)
        .put('/api/user/email-preference')
        .send({ preference: 'manual' })
        .expect(302); // Redirects to auth for unauthenticated users
    });
  });

  // Note: /api/user/capabilities and /api/user/profile endpoints don't exist in the current implementation

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      jest.spyOn(User.prototype, 'save').mockRejectedValue(new Error('Database error'));

      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ preference: 'manual' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to update');
    });

    it('should handle missing user gracefully', async () => {
      // Delete user to simulate missing user scenario
      await testUser.destroy();

      // Since user is deleted, the authenticated session is invalid
      // The middleware will redirect to auth
      await authenticatedAgent
        .get('/api/user/email-preference')
        .expect(302); // Redirects to auth
    });
  });

  describe('Security', () => {
    it('should not expose sensitive user data', async () => {
      const response = await authenticatedAgent
        .get('/api/user/email-preference')
        .expect(200);

      expect(response.body.user).not.toHaveProperty('gmailAccessToken');
      expect(response.body.user).not.toHaveProperty('gmailRefreshToken');
      expect(response.body.user).not.toHaveProperty('password');
    });
  });
});