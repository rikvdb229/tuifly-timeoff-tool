// tests/integration/api/emails.test.js - Integration tests for email API endpoints
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

describe('Emails API Integration Tests', () => {
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

    // Create test request
    testRequest = await TimeOffRequest.create({
      userId: testUser.id,
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-01'),
      type: 'REQ_DO',
      status: 'PENDING',
      customMessage: 'Test request',
      emailMode: 'automatic'
    });

    // Create authenticated session
    authenticatedAgent = await createAuthenticatedSession(app, testUser);
  });

  describe('POST /api/requests/:id/resend-email', () => {
    it('should resend email for automatic mode request', async () => {
      testUser.emailPreference = 'automatic';
      testUser.gmailScopeGranted = true;
      await testUser.save();

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/resend-email`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sent).toBe(true);
      expect(response.body.data.updatedCount).toBe(1);
      expect(response.body.data.isGroup).toBe(false);
      expect(response.body.message).toBe('Email resent successfully');
    });

    it('should resend email for group request', async () => {
      // Create group requests
      const groupId = 'test-group-resend';
      testRequest.groupId = groupId;
      await testRequest.save();

      const groupRequest2 = await TimeOffRequest.create({
        userId: testUser.id,
        groupId,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'PENDING',
        emailMode: 'automatic'
      });

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/resend-email`)
        .expect(200);

      expect(response.body.data.updatedCount).toBe(2);
      expect(response.body.data.isGroup).toBe(true);
      expect(response.body.data.groupId).toBe(groupId);
      expect(response.body.message).toBe('Email group resent successfully');
    });

    it('should throw error for manual mode requests', async () => {
      testUser.emailPreference = 'manual';
      await testUser.save();

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/resend-email`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Resend is only available in automatic email mode');
    });

    it('should handle Gmail authorization errors', async () => {
      testUser.gmailScopeGranted = false;
      await testUser.save();

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/resend-email`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Gmail authorization required');
      expect(response.body.needsReauth).toBe(true);
      expect(response.body.authUrl).toBe('/auth/google');
    });

    it('should return 404 for non-existent request', async () => {
      await authenticatedAgent
        .post('/api/requests/99999/resend-email')
        .expect(404);
    });
  });

  describe('GET /api/requests/:id/email-content', () => {
    beforeEach(async () => {
      testRequest.emailMode = 'manual';
      testRequest.manualEmailContent = JSON.stringify({
        to: 'scheduling@tuifly.be',
        subject: 'TST CREW REQUEST - February 2024',
        body: 'Dear,\n\n01FEB24 REQ DO\n\nTest request\n\nBrgds,\nTest User\nTST'
      });
      await testRequest.save();
    });

    it('should return email content for manual mode request', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/email-content`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.emailContent).toEqual({
        to: 'scheduling@tuifly.be',
        subject: 'TST CREW REQUEST - February 2024',
        body: 'Dear,\n\n01FEB24 REQ DO\n\nTest request\n\nBrgds,\nTest User\nTST'
      });
      expect(response.body.data.canBeSent).toBeDefined();
      expect(response.body.data.emailStatus).toBeDefined();
    });

    it('should throw error for automatic mode requests', async () => {
      testRequest.emailMode = 'automatic';
      await testRequest.save();

      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/email-content`)
        .expect(400);

      expect(response.body.error).toBe('This request is not in manual email mode');
    });
  });

  describe('POST /api/requests/:id/mark-email-sent', () => {
    beforeEach(async () => {
      testRequest.emailMode = 'manual';
      testRequest.emailSent = false;
      testRequest.manualEmailConfirmed = false;
      await testRequest.save();
    });

    it('should mark single request email as sent', async () => {
      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/mark-email-sent`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.updatedRequests).toBe(1);
      expect(response.body.data.emailStatus).toBe('confirmed');
      expect(response.body.data.emailStatusIcon).toBe('✅');
      expect(response.body.message).toBe('Email marked as sent successfully');

      // Verify database update
      await testRequest.reload();
      expect(testRequest.manualEmailConfirmed).toBe(true);
    });

    it('should mark group requests email as sent', async () => {
      const groupId = 'test-group-mark-sent';
      testRequest.groupId = groupId;
      await testRequest.save();

      const groupRequest2 = await TimeOffRequest.create({
        userId: testUser.id,
        groupId,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'PENDING',
        emailMode: 'manual',
        manualEmailConfirmed: false
      });

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/mark-email-sent`)
        .expect(200);

      expect(response.body.data.updatedRequests).toBe(2);
      expect(response.body.data.groupId).toBe(groupId);
      expect(response.body.message).toBe('Email marked as sent for group of 2 request(s)');

      // Verify both requests are marked
      await testRequest.reload();
      await groupRequest2.reload();
      expect(testRequest.manualEmailConfirmed).toBe(true);
      expect(groupRequest2.manualEmailConfirmed).toBe(true);
    });

    it('should prevent marking when automatic email already sent', async () => {
      testRequest.emailSent = true;
      await testRequest.save();

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/mark-email-sent`)
        .expect(400);

      expect(response.body.error).toContain('This request already has an automatic email sent');
    });

    it('should prevent marking when already marked as sent', async () => {
      testRequest.manualEmailConfirmed = true;
      await testRequest.save();

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/mark-email-sent`)
        .expect(400);

      expect(response.body.error).toBe('Email already marked as sent');
    });
  });

  describe('GET /api/requests/:id/email-status', () => {
    it('should return comprehensive email status', async () => {
      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/email-status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('icon');
      expect(response.body.data).toHaveProperty('label');
      expect(response.body.data).toHaveProperty('canBeSent');
      expect(response.body.data).toHaveProperty('isEmailSent');
      expect(response.body.data).toHaveProperty('hasReply');
    });

    it('should show sent status for sent emails', async () => {
      testRequest.emailSent = true;
      testRequest.emailSentAt = new Date();
      await testRequest.save();

      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/email-status`)
        .expect(200);

      expect(response.body.data.status).toBe('sent');
      expect(response.body.data.isEmailSent).toBe(true);
    });

    it('should show failed status for failed emails', async () => {
      testRequest.emailFailed = true;
      testRequest.emailError = 'SMTP connection failed';
      testRequest.emailFailureCount = 1;
      await testRequest.save();

      const response = await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/email-status`)
        .expect(200);

      expect(response.body.data.status).toBe('failed');
      expect(response.body.data.canResend).toBe(true);
      expect(response.body.data.failureCount).toBe(1);
    });
  });

  describe('POST /api/requests/:id/reset-email-status', () => {
    beforeEach(async () => {
      testRequest.emailSent = true;
      testRequest.emailSentAt = new Date();
      testRequest.emailFailed = false;
      await testRequest.save();
    });

    it('should reset email status successfully', async () => {
      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/reset-email-status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Email status reset successfully');

      // Verify database reset
      await testRequest.reload();
      expect(testRequest.emailSent).toBe(false);
      expect(testRequest.emailSentAt).toBe(null);
      expect(testRequest.emailFailed).toBe(false);
      expect(testRequest.emailFailureCount).toBe(0);
    });

    it('should reset group email status', async () => {
      const groupId = 'test-group-reset';
      testRequest.groupId = groupId;
      await testRequest.save();

      const groupRequest2 = await TimeOffRequest.create({
        userId: testUser.id,
        groupId,
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'PM_OFF',
        status: 'PENDING',
        emailSent: true,
        emailSentAt: new Date()
      });

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/reset-email-status`)
        .expect(200);

      expect(response.body.data.updatedCount).toBe(2);
      expect(response.body.data.isGroup).toBe(true);

      // Verify both requests are reset
      await testRequest.reload();
      await groupRequest2.reload();
      expect(testRequest.emailSent).toBe(false);
      expect(groupRequest2.emailSent).toBe(false);
    });
  });

  describe('GET /api/email-templates', () => {
    it('should return available email templates', async () => {
      const response = await authenticatedAgent
        .get('/api/email-templates')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('templates');
      expect(response.body.data).toHaveProperty('placeholders');
      expect(Array.isArray(response.body.data.templates)).toBe(true);
    });
  });

  describe('POST /api/email-templates/preview', () => {
    it('should generate email preview', async () => {
      const previewData = {
        templateType: 'REQUEST',
        variables: {
          '3LTR_CODE': 'TST',
          'YEAR': '2024',
          'MONTH_NAME': 'February',
          'REQUEST_LINES': '01FEB24 REQ DO',
          'CUSTOM_MESSAGE': 'Test preview',
          'EMPLOYEE_SIGNATURE': 'Test User\nTST'
        }
      };

      const response = await authenticatedAgent
        .post('/api/email-templates/preview')
        .send(previewData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('subject');
      expect(response.body.data).toHaveProperty('body');
      expect(response.body.data.subject).toContain('TST');
      expect(response.body.data.body).toContain('01FEB24 REQ DO');
    });

    it('should validate template type', async () => {
      const response = await authenticatedAgent
        .post('/api/email-templates/preview')
        .send({
          templateType: 'INVALID_TYPE',
          variables: {}
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid template type');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      // Mock service error
      const emailService = require('../../../src/services/emailService');
      jest.spyOn(emailService.prototype, 'resendEmail').mockRejectedValue(new Error('Service error'));

      const response = await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/resend-email`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to resend email');
    });

    it('should validate request ownership', async () => {
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
        status: 'PENDING'
      });

      await authenticatedAgent
        .post(`/api/requests/${otherRequest.id}/resend-email`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/resend-email`)
        .expect(401);

      await authenticatedAgent
        .get(`/api/requests/${testRequest.id}/email-content`)
        .expect(401);

      await authenticatedAgent
        .post(`/api/requests/${testRequest.id}/mark-email-sent`)
        .expect(401);
    });
  });
});