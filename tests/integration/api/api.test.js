// tests/integration/api/api.test.js - Integration tests for main API router
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

describe('API Router Integration Tests', () => {
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

  describe('GET /api', () => {
    it('should return API information and endpoints', async () => {
      const response = await authenticatedAgent
        .get('/api')
        .expect(200);

      expect(response.body).toEqual({
        message: 'TUIfly Time-Off API',
        version: '2.0.0',
        user: expect.objectContaining({
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
          code: testUser.code
        }),
        endpoints: expect.objectContaining({
          'GET /api/requests': 'Get all time-off requests for current user',
          'POST /api/requests': 'Create new time-off request',
          'POST /api/requests/group': 'Create group time-off request (consecutive dates)',
          'PUT /api/requests/:id': 'Update time-off request',
          'DELETE /api/requests/:id': 'Delete time-off request'
        })
      });

      // Should not expose sensitive user data
      expect(response.body.user).not.toHaveProperty('gmailAccessToken');
      expect(response.body.user).not.toHaveProperty('gmailRefreshToken');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api')
        .expect(401);
    });

    it('should require onboarding completion', async () => {
      testUser.onboardedAt = null;
      testUser.adminApproved = false;
      await testUser.save();

      const response = await authenticatedAgent
        .get('/api')
        .expect(403);

      expect(response.body.error).toContain('onboarding');
    });
  });

  describe('Authentication Middleware', () => {
    it('should reject requests without authentication', async () => {
      const endpoints = [
        'GET /api/requests',
        'POST /api/requests',
        'GET /api/user/email-preference',
        'PUT /api/user/email-preference',
        'GET /api/gmail/status'
      ];

      for (const endpoint of endpoints) {
        const [method, path] = endpoint.split(' ');
        const req = request(app)[method.toLowerCase()](path);
        
        await req.expect(401);
      }
    });

    it('should reject requests with invalid session', async () => {
      await request(app)
        .get('/api/requests')
        .set('Cookie', 'invalid-session')
        .expect(401);
    });

    it('should accept requests with valid authentication', async () => {
      // Test multiple endpoints to ensure middleware works across routes
      const validEndpoints = [
        { method: 'get', path: '/api' },
        { method: 'get', path: '/api/requests' },
        { method: 'get', path: '/api/user/email-preference' }
      ];

      for (const endpoint of validEndpoints) {
        await authenticatedAgent[endpoint.method](endpoint.path)
          .expect((res) => {
            expect(res.status).not.toBe(401);
          });
      }
    });
  });

  describe('Onboarding Middleware', () => {
    it('should reject requests from non-onboarded users', async () => {
      testUser.onboardedAt = null;
      testUser.adminApproved = false;
      await testUser.save();

      const response = await authenticatedAgent
        .get('/api/requests')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('complete your onboarding');
      expect(response.body.redirectUrl).toBe('/onboarding');
    });

    it('should allow requests from onboarded users', async () => {
      testUser.onboardedAt = new Date();
      testUser.adminApproved = true;
      await testUser.save();

      await authenticatedAgent
        .get('/api/requests')
        .expect(200);
    });

    it('should allow admin users regardless of onboarding status', async () => {
      testUser.isAdmin = true;
      testUser.onboardedAt = null;
      testUser.adminApproved = false;
      await testUser.save();

      await authenticatedAgent
        .get('/api/requests')
        .expect(200);
    });
  });

  describe('Request Sanitization', () => {
    it('should sanitize request bodies', async () => {
      const maliciousData = {
        preference: 'manual',
        '<script>': 'alert("xss")',
        'malicious<img src=x onerror=alert(1)>': 'test',
        normalField: 'should work'
      };

      const response = await authenticatedAgent
        .put('/api/user/email-preference')
        .send(maliciousData)
        .expect(200);

      expect(response.body.success).toBe(true);
      // The malicious fields should be filtered out by sanitization middleware
    });

    it('should handle nested object sanitization', async () => {
      const maliciousNestedData = {
        dates: [
          { 
            date: '2024-02-01', 
            type: 'REQ_DO',
            '<script>alert("nested")</script>': 'malicious'
          }
        ],
        customMessage: 'Normal message'
      };

      // This would normally be processed by the group request endpoint
      // but we're testing the sanitization middleware
      await authenticatedAgent
        .post('/api/requests/group')
        .send(maliciousNestedData)
        .expect((res) => {
          // Response should not contain the malicious script
          expect(JSON.stringify(res.body)).not.toContain('<script>');
        });
    });
  });

  describe('Error Handling Middleware', () => {
    it('should handle 404 errors for non-existent API endpoints', async () => {
      const response = await authenticatedAgent
        .get('/api/non-existent-endpoint')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Not found');
    });

    it('should handle method not allowed errors', async () => {
      const response = await authenticatedAgent
        .patch('/api/requests') // PATCH not allowed, should be POST/GET
        .expect(405);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Method not allowed');
    });

    it('should handle malformed JSON requests', async () => {
      const response = await authenticatedAgent
        .post('/api/requests')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}') // Malformed JSON
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid JSON');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid successive requests', async () => {
      // Make multiple rapid requests to test rate limiting
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          authenticatedAgent
            .get('/api')
        );
      }

      const responses = await Promise.all(promises);
      
      // All requests should succeed (no rate limiting configured to be too strict)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Content Type Validation', () => {
    it('should require application/json for POST requests', async () => {
      const response = await authenticatedAgent
        .post('/api/requests')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415);

      expect(response.body.error).toContain('Content-Type');
    });

    it('should accept application/json for POST requests', async () => {
      await authenticatedAgent
        .post('/api/requests')
        .set('Content-Type', 'application/json')
        .send({
          startDate: '2024-02-01',
          endDate: '2024-02-01',
          type: 'REQ_DO'
        })
        .expect((res) => {
          expect(res.status).not.toBe(415);
        });
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in API responses', async () => {
      const response = await authenticatedAgent
        .get('/api')
        .expect(200);

      // Check for common security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should prevent XSS in response data', async () => {
      // Test that any user-generated content is properly escaped
      testUser.name = '<script>alert("xss")</script>';
      await testUser.save();

      const response = await authenticatedAgent
        .get('/api')
        .expect(200);

      // The response should not contain executable script tags
      expect(JSON.stringify(response.body)).not.toContain('<script>');
      expect(response.body.user.name).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });
  });

  describe('API Versioning', () => {
    it('should return correct API version', async () => {
      const response = await authenticatedAgent
        .get('/api')
        .expect(200);

      expect(response.body.version).toBe('2.0.0');
    });

    it('should handle version-specific headers', async () => {
      const response = await authenticatedAgent
        .get('/api')
        .set('Accept', 'application/vnd.tuifly.v2+json')
        .expect(200);

      expect(response.body.version).toBe('2.0.0');
    });
  });

  describe('CORS Handling', () => {
    it('should handle preflight OPTIONS requests', async () => {
      const response = await request(app)
        .options('/api')
        .set('Origin', 'https://timeoff.tuifly.com')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });

    it('should include CORS headers for API responses', async () => {
      const response = await authenticatedAgent
        .get('/api')
        .set('Origin', 'https://timeoff.tuifly.com')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Logging Integration', () => {
    it('should log API requests', async () => {
      const { routeLogger } = require('../../../src/utils/logger');
      
      await authenticatedAgent
        .get('/api')
        .expect(200);

      // Verify that logging was called (mocked)
      expect(routeLogger.info).toHaveBeenCalled();
    });

    it('should log API errors', async () => {
      const { routeLogger } = require('../../../src/utils/logger');
      
      await authenticatedAgent
        .get('/api/non-existent')
        .expect(404);

      expect(routeLogger.logError).toHaveBeenCalled();
    });
  });
});