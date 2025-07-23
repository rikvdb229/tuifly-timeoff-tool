// tests/e2e/userWorkflows.test.js - End-to-end tests for critical user workflows
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

describe('Critical User Workflows E2E Tests', () => {
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

  describe('Complete Time-Off Request Workflow', () => {
    it('should complete entire single request lifecycle', async () => {
      // 1. User checks their current requests (should be empty)
      let response = await authenticatedAgent
        .get('/api/requests')
        .expect(200);
      
      expect(response.body.data).toHaveLength(0);

      // 2. User creates a new time-off request
      const newRequest = {
        startDate: '2024-03-01',
        endDate: '2024-03-01',
        type: 'REQ_DO',
        customMessage: 'Need this day off for personal reasons'
      };

      response = await authenticatedAgent
        .post('/api/requests')
        .send(newRequest)
        .expect(201);

      const requestId = response.body.data.id;
      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('REQ_DO');
      expect(response.body.emailSent).toBe(true); // Automatic mode

      // 3. User views their requests (should show new request)
      response = await authenticatedAgent
        .get('/api/requests')
        .expect(200);
      
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(requestId);
      expect(response.body.data[0].emailStatus).toBe('sent');

      // 4. User checks specific request details
      response = await authenticatedAgent
        .get(`/api/requests/${requestId}`)
        .expect(200);

      expect(response.body.data.customMessage).toBe('Need this day off for personal reasons');
      expect(response.body.data.status).toBe('PENDING');

      // 5. User updates the request status to approved (simulating manager action)
      response = await authenticatedAgent
        .put(`/api/requests/${requestId}/status`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.data.status).toBe('APPROVED');
      expect(response.body.data.updatedCount).toBe(1);

      // 6. User views updated request
      response = await authenticatedAgent
        .get(`/api/requests/${requestId}`)
        .expect(200);

      expect(response.body.data.status).toBe('APPROVED');
      expect(response.body.data.approvalDate).toBeDefined();

      // 7. User checks statistics
      response = await authenticatedAgent
        .get('/api/requests/stats')
        .expect(200);

      expect(response.body.data).toEqual({
        total: 1,
        pending: 0,
        approved: 1,
        denied: 0
      });
    });

    it('should handle manual email mode workflow', async () => {
      // 1. User switches to manual email mode
      let response = await authenticatedAgent
        .put('/api/user/email-preference')
        .send({ preference: 'manual' })
        .expect(200);

      expect(response.body.data.newPreference).toBe('manual');

      // 2. User creates request in manual mode
      response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-03-05',
          endDate: '2024-03-05',
          type: 'PM_OFF',
          customMessage: 'Half day request'
        })
        .expect(201);

      const requestId = response.body.data.id;
      expect(response.body.emailSent).toBe(false); // Manual mode

      // 3. User gets email content for manual sending
      response = await authenticatedAgent
        .get(`/api/requests/${requestId}/email-content`)
        .expect(200);

      expect(response.body.data.emailContent).toHaveProperty('to');
      expect(response.body.data.emailContent).toHaveProperty('subject');
      expect(response.body.data.emailContent.subject).toContain('TST');
      expect(response.body.data.canBeSent).toBe(true);

      // 4. User marks email as sent
      response = await authenticatedAgent
        .post(`/api/requests/${requestId}/mark-email-sent`)
        .expect(200);

      expect(response.body.data.emailStatus).toBe('confirmed');
      expect(response.body.data.emailStatusIcon).toBe('✅');

      // 5. Now user can update status (email prerequisite met)
      response = await authenticatedAgent
        .put(`/api/requests/${requestId}/status`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Group Request Workflow', () => {
    it('should complete entire group request lifecycle', async () => {
      // 1. User creates group request for consecutive days
      const groupRequestData = {
        dates: [
          { date: '2024-03-01', type: 'REQ_DO' },
          { date: '2024-03-02', type: 'REQ_DO' },
          { date: '2024-03-03', type: 'REQ_DO' }
        ],
        customMessage: 'Long weekend vacation'
      };

      let response = await authenticatedAgent
        .post('/api/requests/group')
        .send(groupRequestData)
        .expect(201);

      const groupId = response.body.data.groupId;
      expect(response.body.data.requests).toHaveLength(3);
      expect(response.body.data.totalDates).toBe(3);
      expect(response.body.data.emailSent).toBe(true);

      // 2. User views group details
      const firstRequestId = response.body.data.requests[0].id;
      response = await authenticatedAgent
        .get(`/api/requests/${firstRequestId}/group-details`)
        .expect(200);

      expect(response.body.data.groupId).toBe(groupId);
      expect(response.body.data.totalRequests).toBe(3);
      expect(response.body.data.statusSummary.pending).toBe(3);

      // 3. User updates entire group status
      response = await authenticatedAgent
        .put(`/api/requests/group/${groupId}/status`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.data.updatedCount).toBe(3);
      expect(response.body.data.status).toBe('APPROVED');

      // 4. Verify all requests in group are approved
      response = await authenticatedAgent
        .get(`/api/requests/${firstRequestId}/group-details`)
        .expect(200);

      expect(response.body.data.statusSummary.approved).toBe(3);
      expect(response.body.data.statusSummary.pending).toBe(0);

      // 5. User gets group email content
      response = await authenticatedAgent
        .get(`/api/requests/${firstRequestId}/group-email-content`)
        .expect(200);

      expect(response.body.data.isGroup).toBe(true);
      expect(response.body.data.groupId).toBe(groupId);
      expect(response.body.data.emailContent.text).toContain('01/03/2024');
      expect(response.body.data.emailContent.text).toContain('02/03/2024');
      expect(response.body.data.emailContent.text).toContain('03/03/2024');
    });

    it('should handle group request deletion workflow', async () => {
      // 1. Create group request (without email sent to allow deletion)
      testUser.emailPreference = 'manual';
      await testUser.save();

      const groupData = {
        dates: [
          { date: '2024-03-10', type: 'REQ_DO' },
          { date: '2024-03-11', type: 'PM_OFF' }
        ],
        customMessage: 'Test group for deletion'
      };

      let response = await authenticatedAgent
        .post('/api/requests/group')
        .send(groupData)
        .expect(201);

      const groupId = response.body.data.groupId;
      const firstRequestId = response.body.data.requests[0].id;

      // 2. User decides to delete entire group
      response = await authenticatedAgent
        .delete(`/api/requests/${firstRequestId}/delete-group`)
        .expect(200);

      expect(response.body.data.deletedCount).toBe(2);
      expect(response.body.data.groupId).toBe(groupId);

      // 3. Verify group is completely deleted
      response = await authenticatedAgent
        .get(`/api/requests/group/${groupId}`)
        .expect(404);

      // 4. Verify no requests remain
      response = await authenticatedAgent
        .get('/api/requests')
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('Email Preference Management Workflow', () => {
    it('should complete email preference change workflow', async () => {
      // 1. User checks current email preference
      let response = await authenticatedAgent
        .get('/api/user/email-preference')
        .expect(200);

      expect(response.body.data.current).toBe('automatic');
      expect(response.body.data.gmailConnected).toBe(true);

      // 2. User switches to manual mode
      response = await authenticatedAgent
        .put('/api/user/email-preference')
        .send({ preference: 'manual' })
        .expect(200);

      expect(response.body.data.newPreference).toBe('manual');
      expect(response.body.data.requiresGmailAuth).toBe(false);

      // 3. Verify preference was updated
      response = await authenticatedAgent
        .get('/api/user/email-preference')
        .expect(200);

      expect(response.body.data.current).toBe('manual');

      // 4. User creates request in manual mode
      response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-03-15',
          endDate: '2024-03-15',
          type: 'REQ_DO'
        })
        .expect(201);

      expect(response.body.emailSent).toBe(false);
      expect(response.body.data.emailMode).toBe('manual');

      // 5. User switches back to automatic mode
      response = await authenticatedAgent
        .put('/api/user/email-preference')
        .send({ preference: 'automatic' })
        .expect(200);

      expect(response.body.data.newPreference).toBe('automatic');
      expect(response.body.data.requiresGmailAuth).toBe(false); // Already has Gmail auth

      // 6. User creates new request in automatic mode
      response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-03-16',
          endDate: '2024-03-16',
          type: 'PM_OFF'
        })
        .expect(201);

      expect(response.body.emailSent).toBe(true);
      expect(response.body.data.emailMode).toBe('automatic');
    });
  });

  describe('Error Recovery Workflows', () => {
    it('should handle email failure and resend workflow', async () => {
      // 1. Create request that will have email failure
      let response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-03-20',
          endDate: '2024-03-20',
          type: 'REQ_DO'
        })
        .expect(201);

      const requestId = response.body.data.id;

      // 2. Simulate email failure (manually update database)
      const request = await TimeOffRequest.findByPk(requestId);
      await request.markEmailFailed('SMTP connection timeout');

      // 3. User checks email status
      response = await authenticatedAgent
        .get(`/api/requests/${requestId}/email-status`)
        .expect(200);

      expect(response.body.data.status).toBe('failed');
      expect(response.body.data.canResend).toBe(true);

      // 4. User resends email
      response = await authenticatedAgent
        .post(`/api/requests/${requestId}/resend-email`)
        .expect(200);

      expect(response.body.data.sent).toBe(true);
      expect(response.body.message).toBe('Email resent successfully');

      // 5. Verify email status is now sent
      response = await authenticatedAgent
        .get(`/api/requests/${requestId}/email-status`)
        .expect(200);

      expect(response.body.data.status).toBe('sent');
      expect(response.body.data.isEmailSent).toBe(true);
    });

    it('should handle date conflict resolution workflow', async () => {
      // 1. User creates initial request
      let response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-03-25',
          endDate: '2024-03-25',
          type: 'REQ_DO'
        })
        .expect(201);

      // 2. User tries to create conflicting request
      response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-03-25', // Same date
          endDate: '2024-03-25',
          type: 'PM_OFF'
        })
        .expect(400);

      expect(response.body.error).toContain('duplicate');

      // 3. User checks for conflicts first
      response = await authenticatedAgent
        .get('/api/requests/conflicts?startDate=2024-03-25&endDate=2024-03-25')
        .expect(200);

      expect(response.body.hasConflicts).toBe(true);
      expect(response.body.conflicts).toHaveLength(1);

      // 4. User chooses different date
      response = await authenticatedAgent
        .get('/api/requests/conflicts?startDate=2024-03-26&endDate=2024-03-26')
        .expect(200);

      expect(response.body.hasConflicts).toBe(false);

      // 5. User successfully creates request with different date
      response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-03-26',
          endDate: '2024-03-26',
          type: 'PM_OFF'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Status History and Audit Trail Workflow', () => {
    it('should maintain complete audit trail of request changes', async () => {
      // 1. User creates request
      let response = await authenticatedAgent
        .post('/api/requests')
        .send({
          startDate: '2024-03-30',
          endDate: '2024-03-30',
          type: 'REQ_DO',
          customMessage: 'Initial request'
        })
        .expect(201);

      const requestId = response.body.data.id;

      // 2. Check initial status history
      response = await authenticatedAgent
        .get(`/api/requests/${requestId}/status-history`)
        .expect(200);

      expect(response.body.data.history).toHaveLength(1);
      expect(response.body.data.history[0].status).toBe('PENDING');
      expect(response.body.data.history[0].method).toBe('system');

      // 3. Update request details
      response = await authenticatedAgent
        .put(`/api/requests/${requestId}`)
        .send({ customMessage: 'Updated request message' })
        .expect(200);

      // 4. Update status to approved
      response = await authenticatedAgent
        .put(`/api/requests/${requestId}/status`)
        .send({ status: 'APPROVED', method: 'manager_approval' })
        .expect(200);

      // 5. Check complete status history
      response = await authenticatedAgent
        .get(`/api/requests/${requestId}/status-history`)
        .expect(200);

      const history = response.body.data.history;
      expect(history.length).toBeGreaterThan(1);
      
      // Should show creation and approval
      expect(history.some(h => h.status === 'PENDING' && h.method === 'system')).toBe(true);
      expect(history.some(h => h.status === 'APPROVED' && h.method === 'manager_approval')).toBe(true);

      // 6. Change status to denied
      response = await authenticatedAgent
        .put(`/api/requests/${requestId}/status`)
        .send({ status: 'DENIED', method: 'manager_review' })
        .expect(200);

      // 7. Verify complete audit trail
      response = await authenticatedAgent
        .get(`/api/requests/${requestId}/status-history`)
        .expect(200);

      const finalHistory = response.body.data.history;
      expect(finalHistory.length).toBeGreaterThan(2);
      expect(finalHistory.some(h => h.status === 'DENIED' && h.method === 'manager_review')).toBe(true);
    });
  });

  describe('Performance and Pagination Workflow', () => {
    it('should handle large number of requests with pagination', async () => {
      // 1. Create many requests
      const requestPromises = [];
      for (let i = 0; i < 15; i++) {
        requestPromises.push(
          authenticatedAgent
            .post('/api/requests')
            .send({
              startDate: `2024-04-${String(i + 1).padStart(2, '0')}`,
              endDate: `2024-04-${String(i + 1).padStart(2, '0')}`,
              type: 'REQ_DO',
              customMessage: `Request ${i + 1}`
            })
        );
      }

      await Promise.all(requestPromises);

      // 2. Test pagination
      let response = await authenticatedAgent
        .get('/api/requests?limit=5&offset=0')
        .expect(200);

      expect(response.body.data).toHaveLength(5);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.pagination.offset).toBe(0);
      expect(response.body.pagination.total).toBe(15);
      expect(response.body.pagination.hasMore).toBe(true);

      // 3. Get next page
      response = await authenticatedAgent
        .get('/api/requests?limit=5&offset=5')
        .expect(200);

      expect(response.body.data).toHaveLength(5);
      expect(response.body.pagination.offset).toBe(5);

      // 4. Get last page
      response = await authenticatedAgent
        .get('/api/requests?limit=5&offset=10')
        .expect(200);

      expect(response.body.data).toHaveLength(5);
      expect(response.body.pagination.hasMore).toBe(false);

      // 5. Filter by status
      response = await authenticatedAgent
        .get('/api/requests?status=PENDING&limit=10')
        .expect(200);

      expect(response.body.data).toHaveLength(10);
      expect(response.body.data.every(r => r.status === 'PENDING')).toBe(true);
    });
  });
});