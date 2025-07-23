// tests/integration/api/requests.test.js - Integration tests for request API endpoints
const request = require('supertest');
const app = require('../../../src/app');
const { User, TimeOffRequest, sequelize } = require('../../../src/models');
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

describe('Requests API Integration Tests', () => {
  let testUser;
  let authenticatedAgent;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await TimeOffRequest.destroy({ where: {}, force: true });
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

  describe('GET /api/requests', () => {
    it('should return user requests with pagination', async () => {
      // Create test requests
      await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING',
        customMessage: 'Test request 1'
      });

      await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'APPROVED',
        customMessage: 'Test request 2'
      });

      const response = await authenticatedAgent
        .get('/api/requests')
        
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('emailStatus');
      expect(response.body.data[0]).toHaveProperty('emailStatusIcon');
      expect(response.body.data[0]).toHaveProperty('canManualEmailBeSent');
    });

    it('should filter requests by status', async () => {
      await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING'
      });

      await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'APPROVED'
      });

      const response = await authenticatedAgent
        .get('/api/requests?status=PENDING')
        
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('PENDING');
    });

    it('should apply pagination', async () => {
      // Create 5 requests
      for (let i = 0; i < 5; i++) {
        await TimeOffRequest.create({
          userId: testUser.id,
          startDate: new Date(`2024-02-0${i + 1}`),
          endDate: new Date(`2024-02-0${i + 1}`),
          type: 'REQ_DO',
          status: 'PENDING'
        });
      }

      const response = await authenticatedAgent
        .get('/api/requests?limit=3&offset=1')
        
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toEqual({
        limit: 3,
        offset: 1,
        total: 5,
        hasMore: true
      });
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/requests')
        .expect(401);
    });
  });

  describe('POST /api/requests', () => {
    it('should create single request successfully', async () => {
      const requestData = {
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'REQ_DO',
        customMessage: 'Please approve'
      };

      const response = await authenticatedAgent
        .post('/api/requests')
        
        .send(requestData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.type).toBe('REQ_DO');
      expect(response.body.data.customMessage).toBe('Please approve');
    });

    it('should validate required fields', async () => {
      const response = await authenticatedAgent
        .post('/api/requests')
        
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('validation');
    });

    it('should prevent duplicate date requests', async () => {
      const requestData = {
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'REQ_DO'
      };

      // Create first request
      await request(app)
        .post('/api/requests')
        
        .send(requestData)
        .expect(201);

      // Try to create duplicate
      const response = await authenticatedAgent
        .post('/api/requests')
        
        .send(requestData)
        .expect(400);

      expect(response.body.error).toContain('duplicate');
    });

    it('should handle automatic email workflow', async () => {
      testUser.emailPreference = 'automatic';
      testUser.gmailScopeGranted = true;
      await testUser.save();

      const response = await authenticatedAgent
        .post('/api/requests')
        
        .send({
          startDate: '2024-02-01',
          endDate: '2024-02-01',
          type: 'REQ_DO'
        })
        .expect(201);

      expect(response.body.emailSent).toBeDefined();
      expect(response.body.emailMode).toBe('automatic');
    });
  });

  describe('GET /api/requests/:id', () => {
    let testRequest;

    beforeEach(async () => {
      testRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING'
      });
    });

    it('should return request details', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}`)
        
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testRequest.id);
      expect(response.body.data).toHaveProperty('emailStatus');
    });

    it('should return 404 for non-existent request', async () => {
      await request(app)
        .get('/api/requests/99999')
        
        .expect(404);
    });

    it('should not allow access to other users requests', async () => {
      const otherUser = await User.create({
        googleId: 'other_google_id',
        email: 'other@tuifly.com',
        name: 'Other User',
        code: 'OTH',
        isOnboarded: true
      });

      const otherRequest = await TimeOffRequest.create({
        userId: otherUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING'
      });

      await request(app)
        .get(`/api/requests/${otherRequest.id}`)
        
        .expect(404);
    });
  });

  describe('PUT /api/requests/:id', () => {
    let testRequest;

    beforeEach(async () => {
      testRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING',
        customMessage: 'Original message'
      });
    });

    it('should update request successfully', async () => {
      const updateData = {
        customMessage: 'Updated message',
        type: 'PM_OFF'
      };

      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}`)
        
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.customMessage).toBe('Updated message');
      expect(response.body.data.type).toBe('PM_OFF');
    });

    it('should prevent updating non-editable requests', async () => {
      testRequest.status = 'APPROVED';
      await testRequest.save();

      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}`)
        
        .send({ customMessage: 'Updated' })
        .expect(400);

      expect(response.body.error).toContain('cannot be updated');
    });
  });

  describe('DELETE /api/requests/:id', () => {
    let testRequest;

    beforeEach(async () => {
      testRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING'
      });
    });

    it('should delete request successfully', async () => {
      const response = await authenticatedAgent
        .delete(`/api/requests/${testRequest.id}`)
        
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');

      // Verify deletion
      const deletedRequest = await TimeOffRequest.findByPk(testRequest.id);
      expect(deletedRequest).toBeNull();
    });

    it('should prevent deleting non-deletable requests', async () => {
      testRequest.status = 'APPROVED';
      await testRequest.save();

      const response = await authenticatedAgent
        .delete(`/api/requests/${testRequest.id}`)
        
        .expect(400);

      expect(response.body.error).toContain('cannot be deleted');
    });
  });

  describe('GET /api/requests/conflicts', () => {
    beforeEach(async () => {
      await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'APPROVED'
      });
    });

    it('should detect date conflicts', async () => {
      const response = await authenticatedAgent
        .get('/api/requests/conflicts?startDate=2024-02-01&endDate=2024-02-01')
        
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasConflicts).toBe(true);
      expect(response.body.conflicts).toHaveLength(1);
    });

    it('should return no conflicts for available dates', async () => {
      const response = await authenticatedAgent
        .get('/api/requests/conflicts?startDate=2024-02-10&endDate=2024-02-10')
        
        .expect(200);

      expect(response.body.hasConflicts).toBe(false);
      expect(response.body.conflicts).toHaveLength(0);
    });
  });

  describe('GET /api/requests/stats', () => {
    beforeEach(async () => {
      await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING'
      });

      await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'APPROVED'
      });
    });

    it('should return request statistics', async () => {
      const response = await authenticatedAgent
        .get('/api/requests/stats')
        
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        total: 2,
        pending: 1,
        approved: 1,
        denied: 0
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      jest.spyOn(TimeOffRequest, 'findAllByUser').mockRejectedValue(new Error('Database error'));

      const response = await authenticatedAgent
        .get('/api/requests')
        
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to fetch requests');
    });

    it('should validate request data', async () => {
      const response = await authenticatedAgent
        .post('/api/requests')
        
        .send({
          startDate: 'invalid-date',
          type: 'INVALID_TYPE'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('validation');
    });
  });
});