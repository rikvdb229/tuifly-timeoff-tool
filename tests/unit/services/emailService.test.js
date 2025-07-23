// tests/unit/services/emailService.test.js - Tests for EmailService
const EmailService = require('../../../src/services/emailService');
const GmailService = require('../../../src/services/gmailService');
const { TimeOffRequest } = require('../../../src/models');

// Mock dependencies
jest.mock('../../../src/services/gmailService');
jest.mock('../../../src/models');
jest.mock('../../../src/utils/logger', () => ({
  serviceLogger: {
    logError: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

describe('EmailService', () => {
  let emailService;
  let mockGmailService;
  let mockUserService;
  let mockUser;
  let mockRequests;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Gmail service
    mockGmailService = {
      generateEmailContent: jest.fn(),
      sendEmail: jest.fn(),
    };

    // Mock user service
    mockUserService = {
      getUserById: jest.fn()
    };

    // Mock user
    mockUser = {
      id: 1,
      email: 'test@tuifly.com',
      emailPreference: 'automatic',
      canSendEmails: jest.fn().mockReturnValue(true),
    };

    // Mock requests
    mockRequests = [
      {
        id: 1,
        markEmailSent: jest.fn(),
        markEmailFailed: jest.fn(),
        storeManualEmailContent: jest.fn(),
      },
      {
        id: 2,
        markEmailSent: jest.fn(),
        markEmailFailed: jest.fn(),
        storeManualEmailContent: jest.fn(),
      }
    ];

    emailService = new EmailService(mockGmailService, mockUserService);
  });

  describe('Constructor', () => {
    it('should initialize with provided services', () => {
      expect(emailService.gmailService).toBe(mockGmailService);
      expect(emailService.userService).toBe(mockUserService);
    });

    it('should create default Gmail service if not provided', () => {
      const service = new EmailService();
      expect(service.gmailService).toBeInstanceOf(GmailService);
    });
  });

  describe('handleEmailWorkflow', () => {
    it('should call sendAutomaticEmail for automatic mode', async () => {
      mockUser.emailPreference = 'automatic';
      const mockResult = { sent: true, messageId: 'msg123' };
      
      jest.spyOn(emailService, 'sendAutomaticEmail').mockResolvedValue(mockResult);

      const result = await emailService.handleEmailWorkflow(mockUser, mockRequests);

      expect(emailService.sendAutomaticEmail).toHaveBeenCalledWith(mockUser, mockRequests);
      expect(result).toBe(mockResult);
    });

    it('should call sendAutomaticEmail when user can send emails', async () => {
      mockUser.emailPreference = 'manual';
      mockUser.canSendEmails.mockReturnValue(true);
      const mockResult = { sent: true, messageId: 'msg123' };
      
      jest.spyOn(emailService, 'sendAutomaticEmail').mockResolvedValue(mockResult);

      const result = await emailService.handleEmailWorkflow(mockUser, mockRequests, 'automatic');

      expect(emailService.sendAutomaticEmail).toHaveBeenCalledWith(mockUser, mockRequests);
      expect(result).toBe(mockResult);
    });

    it('should call prepareManualEmail for manual mode', async () => {
      mockUser.emailPreference = 'manual';
      mockUser.canSendEmails.mockReturnValue(false);
      const mockResult = { sent: false, emailContent: { subject: 'Test' } };
      
      jest.spyOn(emailService, 'prepareManualEmail').mockResolvedValue(mockResult);

      const result = await emailService.handleEmailWorkflow(mockUser, mockRequests);

      expect(emailService.prepareManualEmail).toHaveBeenCalledWith(mockUser, mockRequests);
      expect(result).toBe(mockResult);
    });
  });

  describe('sendAutomaticEmail', () => {
    beforeEach(() => {
      GmailService.needsReauthorization = jest.fn().mockReturnValue(false);
    });

    it('should send email successfully', async () => {
      const emailResult = {
        messageId: 'msg123',
        threadId: 'thread456',
        to: 'scheduling@tuifly.be',
        subject: 'Test Subject'
      };

      mockGmailService.sendEmail.mockResolvedValue(emailResult);

      const result = await emailService.sendAutomaticEmail(mockUser, mockRequests);

      expect(mockGmailService.sendEmail).toHaveBeenCalledWith(mockUser, mockRequests);
      expect(mockRequests[0].markEmailSent).toHaveBeenCalledWith('msg123', 'thread456');
      expect(mockRequests[1].markEmailSent).toHaveBeenCalledWith('msg123', 'thread456');
      
      expect(result).toEqual({
        sent: true,
        messageId: 'msg123',
        threadId: 'thread456',
        to: 'scheduling@tuifly.be',
        subject: 'Test Subject',
        mode: 'automatic',
        message: 'Group email sent automatically for 2 requests'
      });
    });

    it('should handle single request message', async () => {
      const emailResult = { messageId: 'msg123', threadId: 'thread456' };
      mockGmailService.sendEmail.mockResolvedValue(emailResult);

      const result = await emailService.sendAutomaticEmail(mockUser, [mockRequests[0]]);

      expect(result.message).toBe('Email sent automatically');
    });

    it('should throw authorization error when reauthorization needed', async () => {
      GmailService.needsReauthorization.mockReturnValue(true);

      await expect(emailService.sendAutomaticEmail(mockUser, mockRequests))
        .rejects.toThrow('Gmail authorization required');
    });

    it('should handle email send errors', async () => {
      const emailError = new Error('SMTP failed');
      emailError.statusCode = 500;
      mockGmailService.sendEmail.mockRejectedValue(emailError);

      await expect(emailService.sendAutomaticEmail(mockUser, mockRequests))
        .rejects.toThrow('Email send failed: SMTP failed');

      expect(mockRequests[0].markEmailFailed).toHaveBeenCalledWith('SMTP failed');
      expect(mockRequests[1].markEmailFailed).toHaveBeenCalledWith('SMTP failed');
    });
  });

  describe('prepareManualEmail', () => {
    it('should prepare email content successfully', async () => {
      const emailContent = {
        to: 'scheduling@tuifly.be',
        subject: 'Test Subject',
        body: 'Test Body'
      };

      mockGmailService.generateEmailContent.mockReturnValue(emailContent);

      const result = await emailService.prepareManualEmail(mockUser, mockRequests);

      expect(mockGmailService.generateEmailContent).toHaveBeenCalledWith(mockUser, mockRequests);
      expect(mockRequests[0].storeManualEmailContent).toHaveBeenCalledWith(emailContent);
      expect(mockRequests[1].storeManualEmailContent).toHaveBeenCalledWith(emailContent);

      expect(result).toEqual({
        sent: false,
        emailContent,
        mode: 'manual',
        message: 'Group email content prepared for 2 requests. Ready to copy.'
      });
    });

    it('should handle single request message', async () => {
      mockGmailService.generateEmailContent.mockReturnValue({ subject: 'Test' });

      const result = await emailService.prepareManualEmail(mockUser, [mockRequests[0]]);

      expect(result.message).toBe('Email content ready to copy.');
    });

    it('should handle email content generation errors', async () => {
      const error = new Error('Template not found');
      mockGmailService.generateEmailContent.mockRejectedValue(error);

      await expect(emailService.prepareManualEmail(mockUser, mockRequests))
        .rejects.toThrow('Email content generation failed: Template not found');
    });
  });

  describe('resendEmail', () => {
    let mockRequest;

    beforeEach(() => {
      mockRequest = {
        id: 1,
        userId: mockUser.id,
        groupId: null,
        getUser: jest.fn().mockResolvedValue(mockUser)
      };

      TimeOffRequest.findByPkAndUser = jest.fn().mockResolvedValue(mockRequest);
      jest.spyOn(emailService, 'sendAutomaticEmail').mockResolvedValue({
        sent: true,
        messageId: 'resent123'
      });
    });

    it('should resend email for single request', async () => {
      mockUser.emailPreference = 'automatic';

      const result = await emailService.resendEmail(1, mockUser.id);

      expect(TimeOffRequest.findByPkAndUser).toHaveBeenCalledWith(1, mockUser.id);
      expect(emailService.sendAutomaticEmail).toHaveBeenCalledWith(mockUser, [mockRequest]);
      
      expect(result).toEqual({
        sent: true,
        messageId: 'resent123',
        updatedCount: 1,
        isGroup: false,
        groupId: null,
        message: 'Email resent successfully'
      });
    });

    it('should resend email for group request', async () => {
      mockRequest.groupId = 'group123';
      mockUser.emailPreference = 'automatic';
      const groupRequests = [mockRequest, { id: 2 }];

      TimeOffRequest.getByGroupIdAndUser = jest.fn().mockResolvedValue(groupRequests);

      const result = await emailService.resendEmail(1, mockUser.id);

      expect(TimeOffRequest.getByGroupIdAndUser).toHaveBeenCalledWith('group123', mockUser.id);
      expect(emailService.sendAutomaticEmail).toHaveBeenCalledWith(mockUser, groupRequests);
      
      expect(result.updatedCount).toBe(2);
      expect(result.isGroup).toBe(true);
      expect(result.message).toBe('Email group resent successfully');
    });

    it('should throw error if request not found', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      await expect(emailService.resendEmail(999, mockUser.id))
        .rejects.toThrow('Request not found');
    });

    it('should throw error if user not in automatic mode', async () => {
      mockUser.emailPreference = 'manual';

      await expect(emailService.resendEmail(1, mockUser.id))
        .rejects.toThrow('Resend is only available in automatic email mode');
    });
  });

  describe('getEmailContent', () => {
    let mockRequest;

    beforeEach(() => {
      mockRequest = {
        id: 1,
        emailMode: 'manual',
        manualEmailContent: { subject: 'Test', body: 'Test body' },
        canManualEmailBeSent: jest.fn().mockReturnValue(true),
        getEmailStatus: jest.fn().mockReturnValue('pending'),
        getEmailStatusIcon: jest.fn().mockReturnValue('⏳'),
        getEmailStatusLabel: jest.fn().mockReturnValue('Pending')
      };

      TimeOffRequest.findByPkAndUser = jest.fn().mockResolvedValue(mockRequest);
    });

    it('should return email content for manual request', async () => {
      const result = await emailService.getEmailContent(1, mockUser.id);

      expect(result).toEqual({
        emailContent: { subject: 'Test', body: 'Test body' },
        canBeSent: true,
        emailStatus: 'pending',
        emailStatusIcon: '⏳',
        emailStatusLabel: 'Pending'
      });
    });

    it('should throw error if request not found', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      await expect(emailService.getEmailContent(999, mockUser.id))
        .rejects.toThrow('Request not found');
    });

    it('should throw error if request not in manual mode', async () => {
      mockRequest.emailMode = 'automatic';

      await expect(emailService.getEmailContent(1, mockUser.id))
        .rejects.toThrow('This request is not in manual email mode');
    });
  });

  describe('markEmailAsSent', () => {
    let mockRequest;

    beforeEach(() => {
      mockRequest = {
        id: 1,
        groupId: null,
        emailSent: false,
        manualEmailConfirmed: false,
        markManualEmailSent: jest.fn(),
        getEmailStatus: jest.fn().mockReturnValue('confirmed'),
        getEmailStatusIcon: jest.fn().mockReturnValue('✅'),
        getEmailStatusLabel: jest.fn().mockReturnValue('Email Confirmed Sent')
      };

      TimeOffRequest.findByPkAndUser = jest.fn().mockResolvedValue(mockRequest);
    });

    it('should mark single request as sent', async () => {
      const result = await emailService.markEmailAsSent(1, mockUser.id);

      expect(mockRequest.markManualEmailSent).toHaveBeenCalled();
      expect(result).toEqual({
        updatedRequests: 1,
        emailStatus: 'confirmed',
        emailStatusIcon: '✅',
        emailStatusLabel: 'Email Confirmed Sent',
        message: 'Email marked as sent successfully'
      });
    });

    it('should mark group requests as sent', async () => {
      mockRequest.groupId = 'group123';
      const groupRequests = [
        { ...mockRequest, markManualEmailSent: jest.fn() },
        { id: 2, manualEmailConfirmed: false, markManualEmailSent: jest.fn() }
      ];

      TimeOffRequest.getByGroupIdAndUser = jest.fn().mockResolvedValue(groupRequests);

      const result = await emailService.markEmailAsSent(1, mockUser.id);

      expect(groupRequests[0].markManualEmailSent).toHaveBeenCalled();
      expect(groupRequests[1].markManualEmailSent).toHaveBeenCalled();
      
      expect(result.updatedRequests).toBe(2);
      expect(result.groupId).toBe('group123');
      expect(result.message).toBe('Email marked as sent for group of 2 request(s)');
    });

    it('should throw error if email already sent automatically', async () => {
      mockRequest.emailSent = true;

      await expect(emailService.markEmailAsSent(1, mockUser.id))
        .rejects.toThrow('This request already has an automatic email sent. Cannot mark as manually sent.');
    });

    it('should throw error if email already marked as sent', async () => {
      mockRequest.manualEmailConfirmed = true;

      await expect(emailService.markEmailAsSent(1, mockUser.id))
        .rejects.toThrow('Email already marked as sent');
    });
  });

  describe('generateEmailContent', () => {
    let mockRequest;

    beforeEach(() => {
      mockRequest = {
        id: 1,
        groupId: null,
        getUser: jest.fn().mockResolvedValue(mockUser),
        generateEmailContent: jest.fn().mockResolvedValue({
          to: 'scheduling@tuifly.be',
          subject: 'Test Request',
          body: 'Test body'
        })
      };

      TimeOffRequest.findByPkAndUser = jest.fn().mockResolvedValue(mockRequest);
    });

    it('should generate email content for single request', async () => {
      const result = await emailService.generateEmailContent(1, mockUser.id);

      expect(mockRequest.generateEmailContent).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual({
        emailContent: {
          to: 'scheduling@tuifly.be',
          subject: 'Test Request',
          body: 'Test body'
        },
        isGroup: false,
        groupId: null
      });
    });

    it('should generate email content for group request', async () => {
      mockRequest.groupId = 'group123';

      const result = await emailService.generateEmailContent(1, mockUser.id);

      expect(result.isGroup).toBe(true);
      expect(result.groupId).toBe('group123');
    });

    it('should throw error if request not found', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      await expect(emailService.generateEmailContent(999, mockUser.id))
        .rejects.toThrow('Request not found');
    });
  });

  describe('getEmailStatus', () => {
    it('should return comprehensive email status', () => {
      const mockRequest = {
        getEmailStatus: jest.fn().mockReturnValue('sent'),
        getEmailStatusIcon: jest.fn().mockReturnValue('✅'),
        getEmailStatusLabel: jest.fn().mockReturnValue('Email Sent'),
        canManualEmailBeSent: jest.fn().mockReturnValue(false),
        isEmailSent: jest.fn().mockReturnValue(true),
        hasReply: jest.fn().mockReturnValue(false)
      };

      const result = emailService.getEmailStatus(mockRequest);

      expect(result).toEqual({
        status: 'sent',
        icon: '✅',
        label: 'Email Sent',
        canBeSent: false,
        isEmailSent: true,
        hasReply: false
      });
    });
  });

  describe('checkEmailPrerequisites', () => {
    it('should return no issues for valid automatic mode user', () => {
      mockUser.emailPreference = 'automatic';
      mockUser.gmailScopeGranted = true;
      mockUser.gmailAccessToken = 'token123';

      const result = emailService.checkEmailPrerequisites(mockUser, mockRequests);

      expect(result).toEqual({
        canSendEmail: true,
        issues: []
      });
    });

    it('should detect Gmail authorization issues', () => {
      mockUser.emailPreference = 'automatic';
      mockUser.gmailScopeGranted = false;
      mockUser.gmailAccessToken = null;

      const result = emailService.checkEmailPrerequisites(mockUser, mockRequests);

      expect(result.canSendEmail).toBe(false);
      expect(result.issues).toContain('Gmail authorization required for automatic email mode');
    });

    it('should detect already sent emails', () => {
      mockUser.emailPreference = 'manual';
      const requestsWithSent = [
        { isEmailSent: jest.fn().mockReturnValue(true) },
        { isEmailSent: jest.fn().mockReturnValue(false) }
      ];

      const result = emailService.checkEmailPrerequisites(mockUser, requestsWithSent);

      expect(result.canSendEmail).toBe(false);
      expect(result.issues).toContain('1 request(s) already have emails sent');
    });

    it('should handle manual mode without issues', () => {
      mockUser.emailPreference = 'manual';
      const requestsNotSent = [
        { isEmailSent: jest.fn().mockReturnValue(false) },
        { isEmailSent: jest.fn().mockReturnValue(false) }
      ];

      const result = emailService.checkEmailPrerequisites(mockUser, requestsNotSent);

      expect(result.canSendEmail).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });
});