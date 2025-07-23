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

      expect(response.body.data.current).toBe('manual');
      expect(response.body.data.gmailConnected).toBe(false);
      expect(response.body.data.requiresGmailAuth).toBe(false);
    });

    it('should detect when Gmail auth is required', async () => {
      testUser.emailPreference = 'automatic';
      testUser.gmailScopeGranted = false;
      await testUser.save();

      const response = await authenticatedAgent
        .get('/api/user/email-preference')
        
        .expect(200);

      expect(response.body.data.requiresGmailAuth).toBe(true);
      expect(response.body.data.authUrl).toBe('/auth/google');
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
      expect(response.body.data.newPreference).toBe('manual');
      expect(response.body.data.requiresGmailAuth).toBe(false);

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
      expect(response.body.data.newPreference).toBe('automatic');
      expect(response.body.data.requiresGmailAuth).toBe(false);
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
      expect(response.body.data.authUrl).toBe('/auth/google');
    });

    it('should validate preference values', async () => {
      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ preference: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid preference');
    });

    it('should require preference field', async () => {
      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should handle null preference', async () => {
      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        
        .send({ preference: null })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Preference cannot be null');
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

  describe('GET /api/user/capabilities', () => {
    it('should return user capabilities for regular user', async () => {
      const response = await authenticatedAgent
        .get('/api/user/capabilities')
        
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        canCreateRequests: true,
        canSendEmails: true,
        canAccessAdmin: false,
        canManageUsers: false,
        maxRequestsPerMonth: expect.any(Number),
        maxDaysPerRequest: expect.any(Number)
      });
    });

    it('should return admin capabilities for admin user', async () => {
      testUser.isAdmin = true;
      await testUser.save();

      const response = await authenticatedAgent
        .get('/api/user/capabilities')
        
        .expect(200);

      expect(response.body.data.canAccessAdmin).toBe(true);
      expect(response.body.data.canManageUsers).toBe(true);
    });

    it('should handle users without Gmail capabilities', async () => {
      testUser.emailPreference = 'manual';
      testUser.gmailScopeGranted = false;
      await testUser.save();

      const response = await authenticatedAgent
        .get('/api/user/capabilities')
        
        .expect(200);

      expect(response.body.data.canSendEmails).toBe(false);
    });
  });

  describe('GET /api/user/profile', () => {
    it('should return user profile data', async () => {
      const response = await authenticatedAgent
        .get('/api/user/profile')
        
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        code: testUser.code,
        isAdmin: false,
        emailPreference: 'automatic',
        isOnboarded: true,
        gmailConnected: true,
        lastLogin: expect.any(String),
        createdAt: expect.any(String)
      });
      // Should not include sensitive data
      expect(response.body.data).not.toHaveProperty('gmailAccessToken');
      expect(response.body.data).not.toHaveProperty('gmailRefreshToken');
    });
  });

  describe('PUT /api/user/profile', () => {
    it('should update user profile', async () => {
      const updateData = {
        name: 'Updated Name',
        code: 'UPD'
      };

      const response = await authenticatedAgent
        .put('/api/user/profile')
        
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.code).toBe('UPD');

      // Verify database update
      await testUser.reload();
      expect(testUser.name).toBe('Updated Name');
      expect(testUser.code).toBe('UPD');
    });

    it('should validate profile data', async () => {
      const response = await authenticatedAgent
        .put('/api/user/profile')
        
        .send({
          name: '', // Empty name should be invalid
          code: 'TOOLONG' // Code too long
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('validation');
    });

    it('should not allow updating restricted fields', async () => {
      const response = await authenticatedAgent
        .put('/api/user/profile')
        
        .send({
          isAdmin: true, // Should be ignored
          googleId: 'new_id', // Should be ignored
          name: 'Valid Name'
        })
        .expect(200);

      await testUser.reload();
      expect(testUser.isAdmin).toBe(false); // Should not be changed
      expect(testUser.googleId).toBe('test_google_id'); // Should not be changed
      expect(testUser.name).toBe('Valid Name'); // Should be changed
    });
  });

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

      const response = await authenticatedAgent
        .get('/api/user/email-preference')
        
        .expect(401); // Should redirect to login

      expect(response.body.success).toBe(false);
    });
  });

  describe('Security', () => {
    it('should not expose sensitive user data', async () => {
      const response = await authenticatedAgent
        .get('/api/user/profile')
        
        .expect(200);

      expect(response.body.data).not.toHaveProperty('gmailAccessToken');
      expect(response.body.data).not.toHaveProperty('gmailRefreshToken');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should sanitize input data', async () => {
      const maliciousData = {
        name: '<script>alert("xss")</script>Test User',
        code: 'TST<img src=x onerror=alert(1)>',
        maliciousField: 'should be removed'
      };

      const response = await authenticatedAgent
        .put('/api/user/profile')
        
        .send(maliciousData)
        .expect(200);

      // Input should be sanitized
      expect(response.body.data.name).not.toContain('<script>');
      expect(response.body.data.code).not.toContain('<img');
    });
  });
});