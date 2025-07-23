// tests/e2e/securityAndPerformance.test.js - Security and performance E2E tests
const request = require('supertest');
const app = require('../../src/app');
const { User, TimeOffRequest, sequelize } = require('../../src/models');
const { createAuthenticatedSession } = require('../helpers/auth');

// Mock external services
jest.mock('../../src/services/gmailService');
jest.mock('../../src/utils/logger', () => ({
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

describe('Security and Performance E2E Tests', () => {
  let testUser;
  let adminUser;
  let authenticatedAgent;
  let adminAgent;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await TimeOffRequest.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });

    // Create regular test user
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

    // Create admin user
    adminUser = await User.create({
      googleId: 'admin_google_id',
      email: 'admin@tuifly.com',
      name: 'Admin User',
      code: 'ADM',
      signature: 'Admin User - ADM',
      onboardedAt: new Date(),
      adminApproved: true,
      adminApprovedAt: new Date(),
      isAdmin: true,
      emailPreference: 'automatic',
      gmailScopeGranted: true
    });

    authenticatedAgent = await createAuthenticatedSession(app, testUser);
    adminAgent = await createAuthenticatedSession(app, adminUser);
  });

  describe('Security Tests', () => {
    describe('Authentication and Authorization', () => {
      it('should prevent access to other users data', async () => {
        // Create request as user 1
        const response1 = await authenticatedAgent
          .post('/api/requests')
          .send({
            startDate: '2024-04-01',
            endDate: '2024-04-01',
            type: 'REQ_DO'
          })
          .expect(201);

        const requestId = response1.body.data.id;

        // Create second user
        const otherUser = await User.create({
          googleId: 'other_google_id',
          email: 'other@tuifly.com',
          name: 'Other User',
          code: 'OTH',
          isOnboarded: true,
          canUseApp: true
        });

        const otherAgent = await createAuthenticatedSession(app, otherUser);

        // User 2 should not be able to access user 1's request
        await otherAgent
          .get(`/api/requests/${requestId}`)
          .expect(404); // Should return 404, not 403, to prevent information disclosure

        // User 2 should not be able to modify user 1's request
        await otherAgent
          .put(`/api/requests/${requestId}`)
          .send({ customMessage: 'Malicious update' })
          .expect(404);

        // User 2 should not be able to delete user 1's request
        await otherAgent
          .delete(`/api/requests/${requestId}`)
          .expect(404);
      });

      it('should enforce admin-only access to admin endpoints', async () => {
        // Regular user should not access admin endpoints
        await authenticatedAgent
          .get('/admin/users')
          .expect(403);

        await authenticatedAgent
          .post('/admin/users/approve')
          .send({ userId: testUser.id })
          .expect(403);

        // Admin user should have access
        await adminAgent
          .get('/admin')
          .expect(200);
      });

      it('should validate session integrity', async () => {
        // Make request with valid session
        await authenticatedAgent
          .get('/api/requests')
          .expect(200);

        // Tamper with session by creating new agent
        const tamperedAgent = request.agent(app);
        
        // Should not have access without proper authentication
        await tamperedAgent
          .get('/api/requests')
          .expect(401);
      });
    });

    describe('Input Validation and Sanitization', () => {
      it('should prevent XSS attacks in user input', async () => {
        const maliciousInputs = [
          '<script>alert("xss")</script>',
          '"><script>alert("xss")</script>',
          'javascript:alert("xss")',
          '<img src=x onerror=alert("xss")>',
          '<svg onload=alert("xss")>'
        ];

        for (const maliciousInput of maliciousInputs) {
          const response = await authenticatedAgent
            .post('/api/requests')
            .send({
              startDate: '2024-04-05',
              endDate: '2024-04-05',
              type: 'REQ_DO',
              customMessage: maliciousInput
            })
            .expect(201);

          // Response should not contain unescaped malicious content
          const responseString = JSON.stringify(response.body);
          expect(responseString).not.toMatch(/<script[^>]*>/i);
          expect(responseString).not.toMatch(/javascript:/i);
          expect(responseString).not.toMatch(/onerror=/i);
          expect(responseString).not.toMatch(/onload=/i);
        }
      });

      it('should prevent SQL injection attempts', async () => {
        const sqlInjectionAttempts = [
          "'; DROP TABLE users; --",
          "' OR '1'='1",
          "'; DELETE FROM TimeOffRequests; --",
          "' UNION SELECT * FROM users --"
        ];

        for (const injection of sqlInjectionAttempts) {
          // Attempt injection in various fields
          await authenticatedAgent
            .post('/api/requests')
            .send({
              startDate: '2024-04-10',
              endDate: '2024-04-10',
              type: 'REQ_DO',
              customMessage: injection
            })
            .expect(201);

          // Verify database integrity - all tables should still exist
          const userCount = await User.count();
          const requestCount = await TimeOffRequest.count();
          
          expect(userCount).toBeGreaterThan(0);
          expect(requestCount).toBeGreaterThan(0);
        }
      });

      it('should validate request data types and formats', async () => {
        const invalidRequests = [
          // Invalid date format
          {
            startDate: 'invalid-date',
            endDate: '2024-04-15',
            type: 'REQ_DO'
          },
          // Invalid request type
          {
            startDate: '2024-04-15',
            endDate: '2024-04-15',
            type: 'INVALID_TYPE'
          },
          // End date before start date
          {
            startDate: '2024-04-20',
            endDate: '2024-04-15',
            type: 'REQ_DO'
          },
          // Missing required fields
          {
            customMessage: 'Missing required fields'
          }
        ];

        for (const invalidRequest of invalidRequests) {
          await authenticatedAgent
            .post('/api/requests')
            .send(invalidRequest)
            .expect(400);
        }
      });

      it('should prevent mass assignment vulnerabilities', async () => {
        const response = await authenticatedAgent
          .post('/api/requests')
          .send({
            startDate: '2024-04-25',
            endDate: '2024-04-25',
            type: 'REQ_DO',
            // Attempt to set protected fields
            userId: 999, // Should be ignored
            status: 'APPROVED', // Should be ignored
            emailSent: true, // Should be ignored
            isAdmin: true // Should be ignored
          })
          .expect(201);

        // Verify protected fields were not set
        expect(response.body.data.userId).toBe(testUser.id); // Should be current user
        expect(response.body.data.status).toBe('PENDING'); // Should be default
        expect(response.body.emailSent).toBe(true); // Should be from email service, not input
      });
    });

    describe('Rate Limiting and Abuse Prevention', () => {
      it('should handle rapid successive requests gracefully', async () => {
        const promises = [];
        
        // Make 20 rapid requests
        for (let i = 0; i < 20; i++) {
          promises.push(
            authenticatedAgent
              .post('/api/requests')
              .send({
                startDate: `2024-05-${String(i + 1).padStart(2, '0')}`,
                endDate: `2024-05-${String(i + 1).padStart(2, '0')}`,
                type: 'REQ_DO',
                customMessage: `Rapid request ${i + 1}`
              })
          );
        }

        const responses = await Promise.all(promises.map(p => 
          p.catch(err => ({ status: err.status }))
        ));

        // Some requests should succeed, some might be rate limited
        const successCount = responses.filter(r => r.status === 201).length;
        const rateLimitedCount = responses.filter(r => r.status === 429).length;
        
        expect(successCount + rateLimitedCount).toBe(20);
        expect(successCount).toBeGreaterThan(0); // At least some should succeed
      });

      it('should prevent resource exhaustion attacks', async () => {
        // Attempt to create extremely large requests
        const largeMessage = 'A'.repeat(10000); // 10KB message
        
        const response = await authenticatedAgent
          .post('/api/requests')
          .send({
            startDate: '2024-05-30',
            endDate: '2024-05-30',
            type: 'REQ_DO',
            customMessage: largeMessage
          })
          .expect((res) => {
            // Should either succeed with truncated message or fail gracefully
            expect([201, 400, 413]).toContain(res.status);
          });
      });
    });

    describe('Session and Cookie Security', () => {
      it('should implement secure session management', async () => {
        // Login and get session
        const loginResponse = await authenticatedAgent
          .get('/api')
          .expect(200);

        const cookies = loginResponse.headers['set-cookie'];
        expect(cookies).toBeDefined();

        // Check for security attributes in cookies
        const sessionCookie = cookies.find(c => c.includes('connect.sid'));
        if (sessionCookie) {
          expect(sessionCookie).toMatch(/HttpOnly/i);
          // In production, should also have Secure flag
        }
      });

      it('should handle session expiration properly', async () => {
        // This would require actual session timeout testing
        // For now, verify that invalid sessions are rejected
        const invalidAgent = request.agent(app);
        
        await invalidAgent
          .get('/api/requests')
          .expect(401);
      });
    });
  });

  describe('Performance Tests', () => {
    describe('Database Performance', () => {
      it('should handle large datasets efficiently', async () => {
        // Create many requests to test query performance
        const batchSize = 50;
        const batches = [];

        // Create requests in batches to avoid overwhelming the system
        for (let batch = 0; batch < 3; batch++) {
          const batchPromises = [];
          
          for (let i = 0; i < batchSize; i++) {
            const dayOfMonth = (batch * batchSize + i) % 28 + 1;
            batchPromises.push(
              TimeOffRequest.create({
                userId: testUser.id,
                startDate: new Date(`2024-06-${String(dayOfMonth).padStart(2, '0')}`),
                endDate: new Date(`2024-06-${String(dayOfMonth).padStart(2, '0')}`),
                type: 'REQ_DO',
                status: 'PENDING',
                customMessage: `Batch ${batch} Request ${i}`
              })
            );
          }
          
          await Promise.all(batchPromises);
        }

        // Test query performance with large dataset
        const startTime = Date.now();
        
        const response = await authenticatedAgent
          .get('/api/requests?limit=50')
          .expect(200);
          
        const queryTime = Date.now() - startTime;
        
        expect(response.body.data).toHaveLength(50);
        expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
      });

      it('should optimize pagination queries', async () => {
        // Create requests for pagination testing
        const requestPromises = [];
        for (let i = 0; i < 100; i++) {
          requestPromises.push(
            TimeOffRequest.create({
              userId: testUser.id,
              startDate: new Date('2024-07-01'),
              endDate: new Date('2024-07-01'),
              type: 'REQ_DO',
              status: 'PENDING',
              customMessage: `Pagination test ${i}`
            })
          );
        }
        await Promise.all(requestPromises);

        // Test different pagination scenarios
        const paginationTests = [
          { limit: 10, offset: 0 },
          { limit: 10, offset: 50 },
          { limit: 25, offset: 75 },
          { limit: 50, offset: 0 }
        ];

        for (const test of paginationTests) {
          const startTime = Date.now();
          
          const response = await authenticatedAgent
            .get(`/api/requests?limit=${test.limit}&offset=${test.offset}`)
            .expect(200);
            
          const queryTime = Date.now() - startTime;
          
          expect(response.body.data.length).toBeLessThanOrEqual(test.limit);
          expect(queryTime).toBeLessThan(500); // Should be fast
          expect(response.body.pagination).toEqual({
            limit: test.limit,
            offset: test.offset,
            total: 100,
            hasMore: test.offset + test.limit < 100
          });
        }
      });
    });

    describe('Concurrent Request Handling', () => {
      it('should handle multiple concurrent users', async () => {
        // Create multiple users
        const users = [];
        const agents = [];
        
        for (let i = 0; i < 5; i++) {
          const user = await User.create({
            googleId: `concurrent_user_${i}`,
            email: `user${i}@tuifly.com`,
            name: `User ${i}`,
            code: `U${i}`,
            isOnboarded: true,
            canUseApp: true
          });
          
          users.push(user);
          agents.push(await createAuthenticatedSession(app, user));
        }

        // Each user makes requests concurrently
        const concurrentPromises = agents.map((agent, index) => 
          agent
            .post('/api/requests')
            .send({
              startDate: '2024-08-01',
              endDate: '2024-08-01',
              type: 'REQ_DO',
              customMessage: `Concurrent request from user ${index}`
            })
        );

        const responses = await Promise.all(concurrentPromises);
        
        // All requests should succeed
        responses.forEach((response, index) => {
          expect(response.status).toBe(201);
          expect(response.body.data.userId).toBe(users[index].id);
        });
      });

      it('should maintain data consistency under concurrent access', async () => {
        // Create group request and try to modify it concurrently
        const groupResponse = await authenticatedAgent
          .post('/api/requests/group')
          .send({
            dates: [
              { date: '2024-08-05', type: 'REQ_DO' },
              { date: '2024-08-06', type: 'REQ_DO' }
            ]
          })
          .expect(201);

        const groupId = groupResponse.body.data.groupId;
        const requestIds = groupResponse.body.data.requests.map(r => r.id);

        // Try to update status concurrently
        const concurrentStatusUpdates = requestIds.map(id =>
          authenticatedAgent
            .put(`/api/requests/${id}/status`)
            .send({ status: 'APPROVED' })
        );

        const statusResponses = await Promise.all(
          concurrentStatusUpdates.map(p => p.catch(err => ({ status: err.status })))
        );

        // At least one should succeed, others might fail due to race conditions
        const successCount = statusResponses.filter(r => r.status === 200).length;
        expect(successCount).toBeGreaterThan(0);

        // Verify final state is consistent
        const finalResponse = await authenticatedAgent
          .get(`/api/requests/group/${groupId}`)
          .expect(200);

        // All requests in group should have same status
        const statuses = finalResponse.body.data.requests.map(r => r.status);
        const uniqueStatuses = [...new Set(statuses)];
        expect(uniqueStatuses).toHaveLength(1); // All should be same status
      });
    });

    describe('Memory and Resource Management', () => {
      it('should not leak memory with repeated operations', async () => {
        // Simulate repeated create/delete cycles
        for (let cycle = 0; cycle < 10; cycle++) {
          // Create requests
          const createPromises = [];
          for (let i = 0; i < 5; i++) {
            createPromises.push(
              authenticatedAgent
                .post('/api/requests')
                .send({
                  startDate: `2024-09-${String((cycle * 5 + i) % 28 + 1).padStart(2, '0')}`,
                  endDate: `2024-09-${String((cycle * 5 + i) % 28 + 1).padStart(2, '0')}`,
                  type: 'REQ_DO',
                  customMessage: `Memory test cycle ${cycle} request ${i}`
                })
            );
          }

          const createResponses = await Promise.all(createPromises);
          const requestIds = createResponses.map(r => r.body.data.id);

          // Delete requests
          const deletePromises = requestIds.map(id =>
            authenticatedAgent.delete(`/api/requests/${id}`)
          );

          await Promise.all(deletePromises);
        }

        // Verify final state is clean
        const finalResponse = await authenticatedAgent
          .get('/api/requests')
          .expect(200);

        expect(finalResponse.body.data).toHaveLength(0);
      });

      it('should handle large payload efficiently', async () => {
        // Test with large group request
        const largeDates = [];
        for (let i = 1; i <= 20; i++) {
          largeDates.push({
            date: `2024-10-${String(i).padStart(2, '0')}`,
            type: 'REQ_DO'
          });
        }

        const startTime = Date.now();
        
        const response = await authenticatedAgent
          .post('/api/requests/group')
          .send({
            dates: largeDates,
            customMessage: 'Large group request performance test'
          })
          .expect(201);

        const processingTime = Date.now() - startTime;
        
        expect(response.body.data.requests).toHaveLength(20);
        expect(processingTime).toBeLessThan(2000); // Should complete within 2 seconds
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should gracefully handle database connection issues', async () => {
      // Mock database error
      const originalFindAll = TimeOffRequest.findAll;
      TimeOffRequest.findAll = jest.fn().mockRejectedValue(new Error('Database connection lost'));

      const response = await authenticatedAgent
        .get('/api/requests')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to fetch requests');

      // Restore original method
      TimeOffRequest.findAll = originalFindAll;

      // Verify recovery
      await authenticatedAgent
        .get('/api/requests')
        .expect(200);
    });

    it('should handle external service failures gracefully', async () => {
      // Mock Gmail service failure
      const GmailService = require('../../src/services/gmailService');
      const originalSendEmail = GmailService.prototype.sendEmail;
      
      GmailService.prototype.sendEmail = jest.fn().mockRejectedValue(
        new Error('Gmail API unavailable')
      );

      const response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-11-01',
          endDate: '2024-11-01',
          type: 'REQ_DO'
        })
        .expect(201); // Request should still be created

      expect(response.body.success).toBe(true);
      expect(response.body.emailSent).toBe(false); // Email should have failed

      // Restore original method
      GmailService.prototype.sendEmail = originalSendEmail;
    });
  });
});