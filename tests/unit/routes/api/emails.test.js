// tests/unit/routes/api/emails.test.js - Unit tests for emails API route handler

// Mock dependencies first
jest.mock('../../../../src/models', () => ({
  TimeOffRequest: {
    findByPkAndUser: jest.fn(),
    getByGroupIdAndUser: jest.fn(),
  },
}));

jest.mock('../../../../src/services/gmailService', () => {
  const mockInstance = {
    sendEmail: jest.fn(),
    generateEmailContent: jest.fn(),
  };
  const MockGmailService = jest.fn(() => mockInstance);
  MockGmailService.needsReauthorization = jest.fn();
  MockGmailService.prototype = mockInstance;
  return MockGmailService;
});

jest.mock('../../../../src/utils/logger', () => ({
  routeLogger: {
    info: jest.fn(),
    logError: jest.fn(),
  },
}));

const express = require('express');
const request = require('supertest');
const emailsRouter = require('../../../../src/routes/api/emails');
const { TimeOffRequest } = require('../../../../src/models');
const GmailService = require('../../../../src/services/gmailService');
const { routeLogger } = require('../../../../src/utils/logger');

describe('Emails API Route Handler', () => {
  let app;
  let mockUser;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    mockUser = {
      id: 'user123',
      email: 'test@tuifly.com',
      name: 'Test User',
      code: 'TST',
      emailPreference: 'automatic',
      gmailScopeGranted: true,
      gmailAccessToken: 'token123',
    };
    
    // Mock authenticated user middleware
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });
    
    app.use('/', emailsRouter);

    jest.clearAllMocks();
  });

  describe('POST /requests/:id/resend-email', () => {
    const mockRequest = {
      id: 1,
      userId: 'user123',
      type: 'REQ_DO',
      groupId: null,
      markEmailSent: jest.fn(),
      markEmailFailed: jest.fn(),
    };

    beforeEach(() => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);
      GmailService.needsReauthorization.mockReturnValue(false);
    });

    it('should resend email for single request successfully', async () => {
      const emailResult = {
        messageId: 'msg123',
        threadId: 'thread456',
        to: 'scheduling@tuifly.be',
        subject: 'TST CREW REQUEST - February 2024',
      };

      const mockGmailInstance = {
        sendEmail: jest.fn().mockResolvedValue(emailResult),
      };
      GmailService.mockImplementation(() => mockGmailInstance);

      const response = await request(app)
        .post('/requests/1/resend-email')
        .expect(200);

      expect(TimeOffRequest.findByPkAndUser).toHaveBeenCalledWith('1', 'user123');
      expect(mockGmailInstance.sendEmail).toHaveBeenCalledWith(mockUser, [mockRequest]);
      expect(mockRequest.markEmailSent).toHaveBeenCalledWith('msg123', 'thread456');
      
      expect(response.body).toEqual({
        success: true,
        message: 'Email resent successfully',
        data: {
          updatedCount: 1,
          isGroup: false,
          groupId: null,
          messageId: 'msg123',
          threadId: 'thread456',
          to: 'scheduling@tuifly.be',
          subject: 'TST CREW REQUEST - February 2024',
        },
      });

      expect(routeLogger.info).toHaveBeenCalledWith(
        'Resending email for request',
        expect.objectContaining({
          requestId: '1',
          userId: 'user123',
          operation: 'resendEmail',
        })
      );
    });

    it('should resend email for group request successfully', async () => {
      mockRequest.groupId = 'group123';
      const groupRequests = [
        mockRequest,
        {
          id: 2,
          userId: 'user123',
          type: 'REQ_DO',
          groupId: 'group123',
          markEmailSent: jest.fn(),
          markEmailFailed: jest.fn(),
        },
      ];

      TimeOffRequest.getByGroupIdAndUser.mockResolvedValue(groupRequests);

      const emailResult = {
        messageId: 'msg123',
        threadId: 'thread456',
        to: 'scheduling@tuifly.be',
        subject: 'TST CREW REQUEST - February 2024',
      };

      const mockGmailInstance = {
        sendEmail: jest.fn().mockResolvedValue(emailResult),
      };
      GmailService.mockImplementation(() => mockGmailInstance);

      const response = await request(app)
        .post('/requests/1/resend-email')
        .expect(200);

      expect(TimeOffRequest.getByGroupIdAndUser).toHaveBeenCalledWith('group123', 'user123');
      expect(mockGmailInstance.sendEmail).toHaveBeenCalledWith(mockUser, groupRequests);
      expect(groupRequests[0].markEmailSent).toHaveBeenCalledWith('msg123', 'thread456');
      expect(groupRequests[1].markEmailSent).toHaveBeenCalledWith('msg123', 'thread456');
      
      expect(response.body.data.updatedCount).toBe(2);
      expect(response.body.data.isGroup).toBe(true);
      expect(response.body.data.groupId).toBe('group123');
    });

    it('should return 404 for non-existent request', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .post('/requests/999/resend-email')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Request not found',
      });

      expect(routeLogger.info).not.toHaveBeenCalled();
    });

    it('should return 400 for manual mode users', async () => {
      mockUser.emailPreference = 'manual';

      const response = await request(app)
        .post('/requests/1/resend-email')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Resend is only available in automatic email mode',
      });
    });

    it('should return 400 when Gmail authorization required', async () => {
      GmailService.needsReauthorization.mockReturnValue(true);

      const response = await request(app)
        .post('/requests/1/resend-email')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Gmail authorization required',
        message: 'Please authorize Gmail access to send emails automatically',
        authRequired: true,
        authUrl: '/auth/google',
      });
    });

    it('should handle Gmail send errors', async () => {
      // Reset mockRequest for this test to ensure clean state
      const testRequest = {
        id: 1,
        userId: 'user123',
        type: 'REQ_DO',
        groupId: null, // Explicitly null for single request
        markEmailSent: jest.fn(),
        markEmailFailed: jest.fn(),
      };
      TimeOffRequest.findByPkAndUser.mockResolvedValueOnce(testRequest);
      
      const emailError = new Error('Gmail API error');
      emailError.statusCode = 429;

      const mockGmailInstance = {
        sendEmail: jest.fn().mockRejectedValue(emailError),
      };
      GmailService.mockImplementation(() => mockGmailInstance);

      const response = await request(app)
        .post('/requests/1/resend-email')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to resend email',
        message: 'Gmail API error',
        canRetry: true,
        data: {
          updatedCount: 1,
          isGroup: false,
        },
      });

      expect(routeLogger.logError).toHaveBeenCalledWith(
        emailError,
        expect.objectContaining({
          operation: 'resendEmail',
        })
      );
    });

    it('should handle database errors', async () => {
      TimeOffRequest.findByPkAndUser.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/requests/1/resend-email')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to resend email');
    });

    it('should handle email marking errors', async () => {
      const emailResult = {
        messageId: 'msg123',
        threadId: 'thread456',
      };

      const mockGmailInstance = {
        sendEmail: jest.fn().mockResolvedValue(emailResult),
      };
      GmailService.mockImplementation(() => mockGmailInstance);

      mockRequest.markEmailSent.mockRejectedValue(new Error('Database update failed'));

      const response = await request(app)
        .post('/requests/1/resend-email')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to resend email');
    });
  });

  describe('GET /requests/:id/email-content', () => {
    const mockRequest = {
      id: 1,
      userId: 'user123',
      emailMode: 'manual',
      manualEmailContent: {
        to: 'scheduling@tuifly.be',
        subject: 'TST CREW REQUEST - February 2024',
        text: 'Dear,\n\nREQ DO - 01/02/2024\n\nBrgds,\nTest User - TST',
        html: 'Dear,<br><br>REQ DO - 01/02/2024<br><br>Brgds,<br>Test User - TST',
      },
      canManualEmailBeSent: jest.fn().mockReturnValue(true),
      getEmailStatus: jest.fn().mockReturnValue('ready'),
      getEmailStatusIcon: jest.fn().mockReturnValue('📝'),
      getEmailStatusLabel: jest.fn().mockReturnValue('Ready to send'),
    };

    beforeEach(() => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);
    });

    it('should return email content for manual mode request', async () => {
      const response = await request(app)
        .get('/requests/1/email-content')
        .expect(200);

      expect(TimeOffRequest.findByPkAndUser).toHaveBeenCalledWith('1', 'user123');
      expect(response.body).toEqual({
        success: true,
        data: {
          emailContent: mockRequest.manualEmailContent,
          canBeSent: true,
          emailStatus: 'ready',
          emailStatusIcon: '📝',
          emailStatusLabel: 'Ready to send',
        },
      });
    });

    it('should return 404 for non-existent request', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .get('/requests/999/email-content')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Request not found',
      });
    });

    it('should return 400 for non-manual mode request', async () => {
      mockRequest.emailMode = 'automatic';

      const response = await request(app)
        .get('/requests/1/email-content')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'This request is not in manual email mode',
      });
    });

    it('should handle database errors', async () => {
      TimeOffRequest.findByPkAndUser.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/requests/1/email-content')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch email content');
    });
  });

  describe('POST /requests/:id/mark-email-sent', () => {
    const mockRequest = {
      id: 1,
      userId: 'user123',
      groupId: null,
      emailSent: false,
      manualEmailConfirmed: false,
      markManualEmailSent: jest.fn(),
      getEmailStatus: jest.fn().mockReturnValue('confirmed'),
      getEmailStatusIcon: jest.fn().mockReturnValue('✅'),
      getEmailStatusLabel: jest.fn().mockReturnValue('Email Confirmed Sent'),
    };

    beforeEach(() => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);
    });

    it('should mark single request email as sent', async () => {
      const response = await request(app)
        .post('/requests/1/mark-email-sent')
        .expect(200);

      expect(mockRequest.markManualEmailSent).toHaveBeenCalled();
      expect(response.body).toEqual({
        success: true,
        message: 'Email marked as sent successfully',
        data: {
          updatedRequests: 1,
          emailStatus: 'confirmed',
          emailStatusIcon: '✅',
          emailStatusLabel: 'Email Confirmed Sent',
        },
      });
    });

    it('should mark group request emails as sent', async () => {
      mockRequest.groupId = 'group123';
      const groupRequests = [
        { ...mockRequest, manualEmailConfirmed: false, markManualEmailSent: jest.fn() },
        { id: 2, manualEmailConfirmed: false, markManualEmailSent: jest.fn() },
      ];

      TimeOffRequest.getByGroupIdAndUser.mockResolvedValue(groupRequests);

      const response = await request(app)
        .post('/requests/1/mark-email-sent')
        .expect(200);

      expect(TimeOffRequest.getByGroupIdAndUser).toHaveBeenCalledWith('group123', 'user123');
      expect(groupRequests[0].markManualEmailSent).toHaveBeenCalled();
      expect(groupRequests[1].markManualEmailSent).toHaveBeenCalled();
      
      expect(response.body.data.updatedRequests).toBe(2);
      expect(response.body.message).toContain('Email marked as sent for group of 2 request(s)');
    });

    it('should return 404 for non-existent request', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .post('/requests/999/mark-email-sent')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Request not found',
      });
    });

    it('should return 400 if automatic email already sent', async () => {
      mockRequest.emailSent = true;

      const response = await request(app)
        .post('/requests/1/mark-email-sent')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'This request already has an automatic email sent. Cannot mark as manually sent.',
      });
    });

    it('should return 400 if already marked as sent', async () => {
      mockRequest.emailSent = false; // Reset from previous test
      mockRequest.manualEmailConfirmed = true;

      const response = await request(app)
        .post('/requests/1/mark-email-sent')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Email already marked as sent',
      });
    });

    it('should handle database errors', async () => {
      TimeOffRequest.findByPkAndUser.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/requests/1/mark-email-sent')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to mark email as sent');
    });

    it('should handle marking errors', async () => {
      // Create a fresh mock request for this test to avoid interference
      const errorRequest = {
        id: 1,
        userId: 'user123',
        groupId: null,
        emailSent: false,
        manualEmailConfirmed: false,
        markManualEmailSent: jest.fn().mockRejectedValue(new Error('Update failed')),
        getEmailStatus: jest.fn().mockReturnValue('confirmed'),
        getEmailStatusIcon: jest.fn().mockReturnValue('✅'),
        getEmailStatusLabel: jest.fn().mockReturnValue('Email Confirmed Sent')
      };

      TimeOffRequest.findByPkAndUser.mockResolvedValueOnce(errorRequest);

      const response = await request(app)
        .post('/requests/1/mark-email-sent')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to mark email as sent');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/requests/1/resend-email')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.status).toBe(400);
    });

    it('should handle invalid request IDs', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .post('/requests/invalid-id/resend-email')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Request not found');
    });

    it('should handle network timeouts', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ETIMEDOUT';

      const mockGmailInstance = {
        sendEmail: jest.fn().mockRejectedValue(timeoutError),
      };
      GmailService.mockImplementation(() => mockGmailInstance);

      TimeOffRequest.findByPkAndUser.mockResolvedValue({
        id: 1,
        userId: 'user123',
        groupId: null,
        markEmailSent: jest.fn(),
        markEmailFailed: jest.fn(),
      });

      const response = await request(app)
        .post('/requests/1/resend-email')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to resend email');
    });
  });
});