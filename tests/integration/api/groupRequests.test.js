// tests/integration/api/groupRequests.test.js - Integration tests for group requests API
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

describe('Group Requests API Integration Tests', () => {
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

  describe('POST /api/requests/group', () => {
    it('should create group request successfully', async () => {
      const groupData = {
        dates: [
          { date: '2024-02-01', type: 'REQ_DO' },
          { date: '2024-02-02', type: 'PM_OFF' },
          { date: '2024-02-03', type: 'REQ_DO' }
        ],
        customMessage: 'Group vacation request'
      };

      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send(groupData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(3);
      expect(response.body.data.groupId).toBeDefined();
      expect(response.body.data.totalDates).toBe(3);
      expect(response.body.data.emailMode).toBe('automatic');
      
      // All requests should have the same group ID
      const groupId = response.body.data.groupId;
      response.body.data.requests.forEach(req => {
        expect(req.groupId).toBe(groupId);
      });
    });

    it('should handle flight requests with flight numbers', async () => {
      const groupData = {
        dates: [
          { date: '2024-02-01', type: 'FLIGHT', flightNumber: 'TUI123' },
          { date: '2024-02-02', type: 'REQ_DO' }
        ],
        customMessage: 'Flight duty request'
      };

      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send(groupData)
        .expect(201);

      expect(response.body.success).toBe(true);
      const flightRequest = response.body.data.requests.find(r => r.type === 'FLIGHT');
      expect(flightRequest.flightNumber).toBe('TUI123');
    });

    it('should validate dates array', async () => {
      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send({ dates: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid dates array');
    });

    it('should validate individual date objects', async () => {
      const groupData = {
        dates: [
          { date: '2024-02-01' }, // missing type
          { type: 'REQ_DO' }, // missing date
          { date: '2024-02-03', type: 'INVALID_TYPE' } // invalid type
        ]
      };

      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send(groupData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContain('Type is required');
      expect(response.body.details).toContain('Date is required');
      expect(response.body.details).toContain('Invalid type');
    });

    it('should enforce maximum days limit', async () => {
      // Set MAX_DAYS_PER_REQUEST for test
      process.env.MAX_DAYS_PER_REQUEST = '3';

      const groupData = {
        dates: [
          { date: '2024-02-01', type: 'REQ_DO' },
          { date: '2024-02-02', type: 'REQ_DO' },
          { date: '2024-02-03', type: 'REQ_DO' },
          { date: '2024-02-04', type: 'REQ_DO' } // exceeds limit
        ]
      };

      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send(groupData)
        .expect(400);

      expect(response.body.details).toContain('Maximum 3 dates allowed');
    });

    it('should require flight number for flight requests', async () => {
      const groupData = {
        dates: [
          { date: '2024-02-01', type: 'FLIGHT' } // missing flightNumber
        ]
      };

      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send(groupData)
        .expect(400);

      expect(response.body.details).toContain('Flight number is required');
    });

    it('should handle automatic email workflow', async () => {
      testUser.emailPreference = 'automatic';
      testUser.gmailScopeGranted = true;
      await testUser.save();

      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send({
          dates: [
            { date: '2024-02-01', type: 'REQ_DO' },
            { date: '2024-02-02', type: 'PM_OFF' }
          ]
        })
        .expect(201);

      expect(response.body.data.emailSent).toBeDefined();
      expect(response.body.data.emailMode).toBe('automatic');
    });

    it('should require authentication', async () => {
      await authenticatedAgent
        .post('/api/requests/group')
        .send({
          dates: [{ date: '2024-02-01', type: 'REQ_DO' }]
        })
        .expect(401);
    });
  });

  describe('POST /api/requests/group-manual', () => {
    beforeEach(() => {
      testUser.emailPreference = 'manual';
    });

    it('should create manual group request', async () => {
      const groupData = {
        dates: [
          { date: '2024-02-01', type: 'REQ_DO' },
          { date: '2024-02-02', type: 'PM_OFF' }
        ],
        customMessage: 'Manual group request'
      };

      const response = await authenticatedAgent
        .post('/api/requests/group-manual')
        .send(groupData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestCount).toBe(2);
      expect(response.body.data.groupId).toBeDefined();
      expect(response.body.message).toContain('Email marked as sent');

      // Verify all requests are marked as manually confirmed
      response.body.data.requests.forEach(req => {
        expect(req.manualEmailConfirmed).toBe(true);
      });
    });

    it('should only allow manual mode users', async () => {
      testUser.emailPreference = 'automatic';
      await testUser.save();

      const response = await authenticatedAgent
        .post('/api/requests/group-manual')
        .send({
          dates: [{ date: '2024-02-01', type: 'REQ_DO' }]
        })
        .expect(400);

      expect(response.body.error).toContain('Manual request creation only available for users in manual email mode');
    });
  });

  describe('GET /api/requests/group/:groupId', () => {
    let groupId;
    
    beforeEach(async () => {
      // Create a group of requests
      groupId = 'test-group-123';
      
      await TimeOffRequest.create({
        userId: testUser.id,
        groupId,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING'
      });

      await TimeOffRequest.create({
        userId: testUser.id,
        groupId,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'PENDING'
      });
    });

    it('should return group requests', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/group/${groupId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(2);
      expect(response.body.data.count).toBe(2);
    });

    it('should return 404 for non-existent group', async () => {
      await authenticatedAgent
        .get('/api/requests/group/non-existent-group')
        .expect(404);
    });
  });

  describe('GET /api/requests/:id/group-details', () => {
    let groupRequest;

    beforeEach(async () => {
      // Create a group request
      groupRequest = await TimeOffRequest.create({
        userId: testUser.id,
        groupId: 'test-group-456',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING'
      });

      await TimeOffRequest.create({
        userId: testUser.id,
        groupId: 'test-group-456',
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'APPROVED'
      });
    });

    it('should return group details', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${groupRequest.id}/group-details`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.groupId).toBe('test-group-456');
      expect(response.body.data.totalRequests).toBe(2);
      expect(response.body.data.requests).toHaveLength(2);
      expect(response.body.data.statusSummary).toEqual({
        pending: 1,
        approved: 1,
        denied: 0
      });
    });

    it('should return single request details for non-group request', async () => {
      const singleRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-03'),
        endDate: new Date('2024-02-03'),
        type: 'REQ_DO',
        status: 'PENDING'
      });

      const response = await authenticatedAgent
        .get(`/api/requests/${singleRequest.id}/group-details`)
        .expect(200);

      expect(response.body.data.groupId).toBeNull();
      expect(response.body.data.totalRequests).toBe(1);
    });
  });

  describe('DELETE /api/requests/:id/delete-group', () => {
    let groupRequest;

    beforeEach(async () => {
      groupRequest = await TimeOffRequest.create({
        userId: testUser.id,
        groupId: 'deletable-group',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING',
        emailSent: false,
        manualEmailConfirmed: false
      });

      await TimeOffRequest.create({
        userId: testUser.id,
        groupId: 'deletable-group',
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'PENDING',
        emailSent: false,
        manualEmailConfirmed: false
      });
    });

    it('should delete entire group successfully', async () => {
      const response = await authenticatedAgent
        .delete(`/api/requests/${groupRequest.id}/delete-group`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBe(2);
      expect(response.body.data.groupId).toBe('deletable-group');
      expect(response.body.message).toBe('Group request deleted successfully');

      // Verify all requests are deleted
      const remainingRequests = await TimeOffRequest.findAll({
        where: { groupId: 'deletable-group' }
      });
      expect(remainingRequests).toHaveLength(0);
    });

    it('should prevent deletion when emails are sent', async () => {
      // Mark one request as having email sent
      groupRequest.emailSent = true;
      await groupRequest.save();

      const response = await authenticatedAgent
        .delete(`/api/requests/${groupRequest.id}/delete-group`)
        .expect(400);

      expect(response.body.error).toContain('Cannot delete group: some requests have emails already sent');
      expect(response.body.details).toContain('1 out of 2 requests cannot be deleted');
    });

    it('should prevent deletion when manual emails are confirmed', async () => {
      groupRequest.manualEmailConfirmed = true;
      await groupRequest.save();

      const response = await authenticatedAgent
        .delete(`/api/requests/${groupRequest.id}/delete-group`)
        .expect(400);

      expect(response.body.error).toContain('Cannot delete group');
    });

    it('should throw error for non-group request', async () => {
      const singleRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-05'),
        endDate: new Date('2024-02-05'),
        type: 'REQ_DO',
        status: 'PENDING'
      });

      const response = await authenticatedAgent
        .delete(`/api/requests/${singleRequest.id}/delete-group`)
        .expect(400);

      expect(response.body.error).toBe('This is not a group request');
    });
  });

  describe('GET /api/requests/:id/group-email-content', () => {
    let groupRequest;

    beforeEach(async () => {
      groupRequest = await TimeOffRequest.create({
        userId: testUser.id,
        groupId: 'email-group',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING',
        customMessage: 'Group email test'
      });

      await TimeOffRequest.create({
        userId: testUser.id,
        groupId: 'email-group',
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'PENDING',
        customMessage: 'Group email test'
      });
    });

    it('should generate group email content', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${groupRequest.id}/group-email-content`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.emailContent).toHaveProperty('to');
      expect(response.body.data.emailContent).toHaveProperty('subject');
      expect(response.body.data.emailContent).toHaveProperty('text');
      expect(response.body.data.isGroup).toBe(true);
      expect(response.body.data.groupId).toBe('email-group');
    });

    it('should handle single request email content', async () => {
      const singleRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-05'),
        endDate: new Date('2024-02-05'),
        type: 'REQ_DO',
        status: 'PENDING'
      });

      const response = await authenticatedAgent
        .get(`/api/requests/${singleRequest.id}/group-email-content`)
        .expect(200);

      expect(response.body.data.isGroup).toBe(false);
      expect(response.body.data.groupId).toBeNull();
    });
  });

  describe('Validation and Error Handling', () => {
    it('should validate consecutive dates', async () => {
      const groupData = {
        dates: [
          { date: '2024-02-01', type: 'REQ_DO' },
          { date: '2024-02-03', type: 'REQ_DO' } // Gap in dates
        ],
        validateConsecutive: true
      };

      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send(groupData)
        .expect(400);

      expect(response.body.error).toContain('non-consecutive dates');
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      jest.spyOn(TimeOffRequest, 'create').mockRejectedValue(new Error('Database error'));

      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send({
          dates: [{ date: '2024-02-01', type: 'REQ_DO' }]
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to create group request');
    });

    it('should validate date formats', async () => {
      const response = await authenticatedAgent
        .post('/api/requests/group')
        .send({
          dates: [{ date: 'invalid-date', type: 'REQ_DO' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('validation');
    });
  });
});