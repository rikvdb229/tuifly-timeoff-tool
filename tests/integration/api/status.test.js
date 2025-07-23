// tests/integration/api/status.test.js - Integration tests for status API endpoints
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

describe('Status API Integration Tests', () => {
  let testUser;
  let authenticatedAgent;
  let testRequest;

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

    // Create test request with email sent (prerequisite for status updates)
    testRequest = await TimeOffRequest.create({
      userId: testUser.id,
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-01'),
      type: 'REQ_DO',
      status: 'PENDING',
      customMessage: 'Test request',
      emailMode: 'automatic',
      emailSent: true,
      emailSentAt: new Date()
    });

    // Create authenticated session
    authenticatedAgent = await createAuthenticatedSession(app, testUser);
  });

  describe('PUT /api/requests/:id/status', () => {
    it('should update request status to APPROVED', async () => {
      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.updatedCount).toBe(1);
      expect(response.body.data.status).toBe('APPROVED');
      expect(response.body.data.statusUpdatedAt).toBeDefined();
      expect(response.body.data.isGroup).toBe(false);
      expect(response.body.data.method).toBe('manual_user_update');
      expect(response.body.message).toBe('Request marked as approved successfully');

      // Verify database update
      await testRequest.reload();
      expect(testRequest.status).toBe('APPROVED');
      expect(testRequest.approvalDate).toBeDefined();
    });

    it('should update request status to DENIED', async () => {
      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ status: 'DENIED' })
        .expect(200);

      expect(response.body.data.status).toBe('DENIED');

      // Verify database update
      await testRequest.reload();
      expect(testRequest.status).toBe('DENIED');
      expect(testRequest.approvalDate).toBe(null);
    });

    it('should update request status to PENDING', async () => {
      // First set to approved
      testRequest.status = 'APPROVED';
      testRequest.approvalDate = new Date();
      await testRequest.save();

      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ status: 'PENDING' })
        .expect(200);

      expect(response.body.data.status).toBe('PENDING');

      // Verify database update
      await testRequest.reload();
      expect(testRequest.status).toBe('PENDING');
      expect(testRequest.approvalDate).toBe(null);
    });

    it('should update group status when updateGroup is true', async () => {
      const groupId = 'test-group-status';
      testRequest.groupId = groupId;
      await testRequest.save();

      const groupRequest2 = await TimeOffRequest.create({
        userId: testUser.id,
        groupId,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'PENDING',
        emailMode: 'automatic',
        emailSent: true
      });

      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ 
          status: 'APPROVED',
          updateGroup: true
        })
        .expect(200);

      expect(response.body.data.updatedCount).toBe(2);
      expect(response.body.data.isGroup).toBe(true);
      expect(response.body.data.updateGroup).toBe(true);
      expect(response.body.message).toBe('Requests marked as approved successfully');

      // Verify both requests are updated
      await testRequest.reload();
      await groupRequest2.reload();
      expect(testRequest.status).toBe('APPROVED');
      expect(groupRequest2.status).toBe('APPROVED');
    });

    it('should validate status values', async () => {
      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid status');
      expect(response.body.details).toBe('Status must be APPROVED, DENIED, or PENDING');
    });

    it('should require email to be sent before status update', async () => {
      // Create request without email sent
      const noEmailRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-05'),
        endDate: new Date('2024-02-05'),
        type: 'REQ_DO',
        status: 'PENDING',
        emailSent: false
      });

      const response = await authenticatedAgent
        .put(`/api/requests/${noEmailRequest.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(400);

      expect(response.body.error).toBe('Cannot update status before email is sent');
      expect(response.body.details).toBe('Please send the email first before updating the status');
    });

    it('should handle manual email mode prerequisites', async () => {
      const manualRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-10'),
        endDate: new Date('2024-02-10'),
        type: 'REQ_DO',
        status: 'PENDING',
        emailMode: 'manual',
        manualEmailConfirmed: true,
        manualEmailConfirmedAt: new Date()
      });

      const response = await authenticatedAgent
        .put(`/api/requests/${manualRequest.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent request', async () => {
      await authenticatedAgent
        .put('/api/requests/99999/status')
        .send({ status: 'APPROVED' })
        .expect(404);
    });

    it('should not allow access to other users requests', async () => {
      const otherUser = await User.create({
        googleId: 'other_google_id',
        email: 'other@tuifly.com',
        name: 'Other User',
        code: 'OTH',
        signature: 'Other User - OTH',
        onboardedAt: new Date(),
        adminApproved: true,
        adminApprovedAt: new Date()
      });

      const otherRequest = await TimeOffRequest.create({
        userId: otherUser.id,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING',
        emailSent: true
      });

      await authenticatedAgent
        .put(`/api/requests/${otherRequest.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(404);
    });
  });

  describe('PUT /api/requests/group/:groupId/status', () => {
    let groupId;
    let groupRequest1, groupRequest2;

    beforeEach(async () => {
      groupId = 'test-group-batch-status';
      
      groupRequest1 = await TimeOffRequest.create({
        userId: testUser.id,
        groupId,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        status: 'PENDING',
        emailSent: true
      });

      groupRequest2 = await TimeOffRequest.create({
        userId: testUser.id,
        groupId,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'PENDING',
        emailSent: true
      });
    });

    it('should update all requests in group', async () => {
      const response = await authenticatedAgent
        .put(`/api/requests/group/${groupId}/status`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.updatedCount).toBe(2);
      expect(response.body.data.status).toBe('APPROVED');
      expect(response.body.data.groupId).toBe(groupId);
      expect(response.body.message).toBe('All 2 requests in group marked as approved successfully');

      // Verify both requests are updated
      await groupRequest1.reload();
      await groupRequest2.reload();
      expect(groupRequest1.status).toBe('APPROVED');
      expect(groupRequest2.status).toBe('APPROVED');
    });

    it('should prevent update if any request lacks email prerequisites', async () => {
      // Make one request without email sent
      groupRequest2.emailSent = false;
      await groupRequest2.save();

      const response = await authenticatedAgent
        .put(`/api/requests/group/${groupId}/status`)
        .send({ status: 'APPROVED' })
        .expect(400);

      expect(response.body.error).toBe('Cannot update group status: some requests have not sent emails yet');
    });

    it('should return 404 for non-existent group', async () => {
      await authenticatedAgent
        .put('/api/requests/group/non-existent-group/status')
        .send({ status: 'APPROVED' })
        .expect(404);
    });
  });

  describe('GET /api/requests/:id/status-validation', () => {
    it('should validate status update is allowed', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/status-validation?newStatus=APPROVED`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(true);
      expect(response.body.data.issues).toHaveLength(0);
    });

    it('should detect validation issues', async () => {
      // Test with same status
      testRequest.status = 'APPROVED';
      await testRequest.save();

      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/status-validation?newStatus=APPROVED`)
        .expect(200);

      expect(response.body.data.isValid).toBe(false);
      expect(response.body.data.issues).toContain('Request is already approved');
    });

    it('should detect email prerequisite issues', async () => {
      const noEmailRequest = await TimeOffRequest.create({
        userId: testUser.id,
        startDate: new Date('2024-02-05'),
        endDate: new Date('2024-02-05'),
        type: 'REQ_DO',
        status: 'PENDING',
        emailSent: false
      });

      const response = await authenticatedAgent
        .get(`/api/requests/${noEmailRequest.id}/status-validation?newStatus=APPROVED`)
        .expect(200);

      expect(response.body.data.isValid).toBe(false);
      expect(response.body.data.issues).toContain('Email must be sent before status can be updated');
    });

    it('should validate status parameter', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/status-validation?newStatus=INVALID`)
        .expect(200);

      expect(response.body.data.isValid).toBe(false);
      expect(response.body.data.issues).toContain('Invalid status value');
    });
  });

  describe('GET /api/requests/:id/status-transitions', () => {
    it('should return available status transitions', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/status-transitions`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.currentStatus).toBe('PENDING');
      expect(response.body.data.availableTransitions).toEqual(['APPROVED', 'DENIED']);
    });

    it('should exclude current status from transitions', async () => {
      testRequest.status = 'APPROVED';
      await testRequest.save();

      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/status-transitions`)
        .expect(200);

      expect(response.body.data.currentStatus).toBe('APPROVED');
      expect(response.body.data.availableTransitions).toEqual(['PENDING', 'DENIED']);
    });
  });

  describe('GET /api/requests/:id/status-history', () => {
    beforeEach(async () => {
      // Update status to create history
      testRequest.status = 'APPROVED';
      testRequest.statusUpdatedAt = new Date();
      testRequest.statusUpdateMethod = 'manual_user_update';
      testRequest.approvalDate = new Date();
      await testRequest.save();
    });

    it('should return status history', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/status-history`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.history)).toBe(true);
      expect(response.body.data.history.length).toBeGreaterThan(0);

      const history = response.body.data.history;
      expect(history[0]).toHaveProperty('status');
      expect(history[0]).toHaveProperty('date');
      expect(history[0]).toHaveProperty('method');
      expect(history[0]).toHaveProperty('description');
    });

    it('should sort history by date', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/status-history`)
        .expect(200);

      const history = response.body.data.history;
      for (let i = 1; i < history.length; i++) {
        const prevDate = new Date(history[i - 1].date);
        const currentDate = new Date(history[i].date);
        expect(prevDate.getTime()).toBeLessThanOrEqual(currentDate.getTime());
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      jest.spyOn(TimeOffRequest.prototype, 'update').mockRejectedValue(new Error('Database error'));

      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to update status');
    });

    it('should validate request data', async () => {
      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({}) // Missing status
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Status is required');
    });

    it('should require authentication', async () => {
      await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(401);

      await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/status-validation`)
        .expect(401);
    });
  });

  describe('Custom Status Update Methods', () => {
    it('should support custom update methods', async () => {
      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ 
          status: 'APPROVED',
          method: 'admin_override'
        })
        .expect(200);

      expect(response.body.data.method).toBe('admin_override');

      await testRequest.reload();
      expect(testRequest.statusUpdateMethod).toBe('admin_override');
    });

    it('should default to manual_user_update method', async () => {
      const response = await authenticatedAgent
        .put(`/api/requests/${testRequest.id}/status`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.data.method).toBe('manual_user_update');
    });
  });
});