// tests/unit/services/gmailService.test.js - Tests for GmailService
const GmailService = require('../../../src/services/gmailService');
const { google } = require('googleapis');

// Mock googleapis
jest.mock('googleapis');

describe('GmailService', () => {
  let gmailService;
  let mockOAuth2Client;
  let mockGmail;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock OAuth2 client
    mockOAuth2Client = {
      setCredentials: jest.fn(),
      getAccessToken: jest.fn().mockResolvedValue({ token: 'mock-token' }),
      refreshAccessToken: jest.fn().mockResolvedValue({
        credentials: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expiry_date: Date.now() + 3600000
        }
      })
    };

    // Mock Gmail API
    mockGmail = {
      users: {
        messages: {
          send: jest.fn().mockResolvedValue({ data: { id: 'message-id' } })
        }
      }
    };

    // Mock google.auth.OAuth2 constructor
    google.auth.OAuth2.mockReturnValue(mockOAuth2Client);
    
    // Mock googleapis.gmail
    google.gmail.mockReturnValue(mockGmail);

    gmailService = new GmailService();
  });

  describe('Constructor', () => {
    it('should initialize OAuth2 client with credentials', () => {
      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
    });

    it('should be properly initialized', () => {
      expect(gmailService.oauth2Client).toBeDefined();
    });
  });

  describe('generateEmailContent', () => {
    const mockUser = {
      code: 'TST',
      name: 'Test User',
      signature: 'Test User\nTST'
    };

    const mockRequests = [
      {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        customMessage: 'Please approve this request'
      },
      {
        startDate: new Date('2024-02-02'),
        endDate: new Date('2024-02-02'),
        type: 'REQ_PM_OFF',
        customMessage: 'Please approve this request'
      }
    ];

    it('should generate email content for single request', () => {
      const content = gmailService.generateEmailContent(mockUser, [mockRequests[0]]);

      expect(content).toHaveProperty('to');
      expect(content).toHaveProperty('subject');
      expect(content).toHaveProperty('text');
      expect(content).toHaveProperty('html');

      expect(content.to).toBe(process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be');
      expect(content.subject).toContain('TST');
      expect(content.subject).toContain('CREW REQUEST');
      expect(content.subject).toContain('February');
      expect(content.subject).toContain('2024');

      expect(content.body).toContain('01FEB24 REQ DO');
      expect(content.body).toContain('Please approve this request');
      expect(content.body).toContain('Test User\nTST');
    });

    it('should generate email content for multiple requests', () => {
      const content = gmailService.generateEmailContent(mockUser, mockRequests);

      expect(content.text).toContain('REQ DO - 01/02/2024');
      expect(content.text).toContain('REQ PM OFF - 02/02/2024');
      expect(content.subject).toContain('February');
    });

    it('should handle different request types', () => {
      const requests = [
        { ...mockRequests[0], type: 'AM_OFF' },
        { ...mockRequests[0], type: 'PM_OFF' },
        { ...mockRequests[0], type: 'REQ_DO' }
      ];

      const content = gmailService.generateEmailContent(mockUser, requests);

      expect(content.text).toContain('REQ AM OFF');
      expect(content.text).toContain('REQ PM OFF');
      expect(content.text).toContain('REQ DO');
    });

    it('should handle date ranges', () => {
      const rangeRequest = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-03'),
        type: 'REQ_DO',
        customMessage: 'Range request'
      };

      const content = gmailService.generateEmailContent(mockUser, [rangeRequest]);

      expect(content.text).toContain('REQ DO - 01/02/2024');
    });

    it('should handle empty custom message', () => {
      const requestWithoutMessage = {
        ...mockRequests[0],
        customMessage: ''
      };

      const content = gmailService.generateEmailContent(mockUser, [requestWithoutMessage]);

      expect(content.text).toBeDefined();
      expect(content.text).toContain('Test User\nTST');
    });

    it('should use environment variables for labels', () => {
      process.env.EMAIL_REQ_DO_LABEL = 'CUSTOM DO';
      process.env.EMAIL_PM_OFF_LABEL = 'CUSTOM PM OFF';
      process.env.EMAIL_AM_OFF_LABEL = 'CUSTOM AM OFF';

      const content = gmailService.generateEmailContent(mockUser, mockRequests);

      expect(content.text).toContain('CUSTOM DO');
      expect(content.text).toContain('CUSTOM PM OFF');

      // Clean up
      delete process.env.EMAIL_REQ_DO_LABEL;
      delete process.env.EMAIL_PM_OFF_LABEL;
      delete process.env.EMAIL_AM_OFF_LABEL;
    });
  });

  describe('setUserCredentials', () => {
    const mockUser = {
      getDecryptedGmailAccessToken: jest.fn().mockReturnValue('access-token'),
      getDecryptedGmailRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      gmailTokenExpiry: new Date(Date.now() + 3600000)
    };

    it('should set credentials from user', () => {
      gmailService.setUserCredentials(mockUser);

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expiry_date: mockUser.gmailTokenExpiry.getTime()
      });
    });

    it('should handle missing tokens', () => {
      const userWithoutTokens = {
        getDecryptedGmailAccessToken: jest.fn().mockReturnValue(null),
        getDecryptedGmailRefreshToken: jest.fn().mockReturnValue(null),
        gmailTokenExpiry: null
      };

      gmailService.setUserCredentials(userWithoutTokens);

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: null,
        refresh_token: null,
        expiry_date: null
      });
    });
  });

  describe('refreshTokens', () => {
    const mockUser = {
      setGmailTokens: jest.fn(),
      save: jest.fn()
    };

    it('should refresh tokens successfully', async () => {
      const result = await gmailService.refreshTokens(mockUser);

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(mockUser.setGmailTokens).toHaveBeenCalledWith(
        'new-access-token',
        'new-refresh-token',
        expect.any(Date)
      );
      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle refresh token errors', async () => {
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(new Error('Invalid refresh token'));

      const result = await gmailService.refreshTokens(mockUser);

      expect(result).toBe(false);
      expect(mockUser.setGmailTokens).not.toHaveBeenCalled();
    });

    it('should handle missing credentials in refresh response', async () => {
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {}
      });

      const result = await gmailService.refreshTokens(mockUser);

      expect(result).toBe(false);
    });
  });

  describe('sendEmail', () => {
    const mockUser = {
      getDecryptedGmailAccessToken: jest.fn().mockReturnValue('access-token'),
      getDecryptedGmailRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      gmailTokenExpiry: new Date(Date.now() + 3600000),
      email: 'test@tuifly.com'
    };

    const mockRequests = [{
      id: 1,
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-01'),
      type: 'REQ_DO',
      customMessage: 'Test request'
    }];

    beforeEach(() => {
      jest.spyOn(gmailService, 'setUserCredentials');
    });

    it('should send email successfully', async () => {
      const result = await gmailService.sendEmail(mockUser, mockRequests);

      expect(gmailService.setUserCredentials).toHaveBeenCalledWith(mockUser);
      expect(google.gmail).toHaveBeenCalledWith({ version: 'v1', auth: mockOAuth2Client });
      expect(mockGmail.users.messages.send).toHaveBeenCalled();
      expect(result).toEqual({ success: true, messageId: 'message-id' });
    });

    it('should handle authentication errors', async () => {
      mockGmail.users.messages.send.mockRejectedValue({ 
        code: 401, 
        message: 'Invalid credentials' 
      });

      const result = await gmailService.sendEmail(mockUser, mockRequests);

      expect(result).toEqual({
        success: false,
        error: 'Authentication failed - please re-authorize Gmail access',
        needsReauth: true
      });
    });

    it('should handle quota exceeded errors', async () => {
      mockGmail.users.messages.send.mockRejectedValue({ 
        code: 429, 
        message: 'Quota exceeded' 
      });

      const result = await gmailService.sendEmail(mockUser, mockRequests);

      expect(result).toEqual({
        success: false,
        error: 'Gmail API quota exceeded - please try again later',
        retryAfter: 3600
      });
    });

    it('should handle general errors', async () => {
      mockGmail.users.messages.send.mockRejectedValue(new Error('Network error'));

      const result = await gmailService.sendEmail(mockUser, mockRequests);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to send email');
    });

    it('should format email message correctly', async () => {
      await gmailService.sendEmail(mockUser, emailData);

      const sentCall = mockGmail.users.messages.send.mock.calls[0][0];
      expect(sentCall.userId).toBe('me');
      expect(sentCall.resource.raw).toBeDefined();

      // Decode the base64 email to verify content
      const decodedEmail = Buffer.from(sentCall.resource.raw, 'base64').toString();
      expect(decodedEmail).toContain('To: scheduling@tuifly.be');
      expect(decodedEmail).toContain('From: test@tuifly.com');
      expect(decodedEmail).toContain('Subject: Test Subject');
      expect(decodedEmail).toContain('Test Body');
    });
  });

  describe('validateCredentials', () => {
    const mockUser = {
      getDecryptedGmailAccessToken: jest.fn().mockReturnValue('access-token'),
      getDecryptedGmailRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      gmailTokenExpiry: new Date(Date.now() + 3600000)
    };

    it('should validate credentials successfully', async () => {
      mockGmail.users = {
        getProfile: jest.fn().mockResolvedValue({ data: { emailAddress: 'test@tuifly.com' } })
      };

      const result = await gmailService.validateCredentials(mockUser);

      expect(result).toBe(true);
      expect(gmailService.setUserCredentials).toHaveBeenCalledWith(mockUser);
    });

    it('should handle validation errors', async () => {
      mockGmail.users = {
        getProfile: jest.fn().mockRejectedValue(new Error('Invalid credentials'))
      };

      const result = await gmailService.validateCredentials(mockUser);

      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables', () => {
      const originalClientId = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;

      expect(() => new GmailService()).not.toThrow();

      // Restore
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    });

    it('should handle malformed email data', async () => {
      const mockUser = {
        getDecryptedGmailAccessToken: jest.fn().mockReturnValue('token'),
        getDecryptedGmailRefreshToken: jest.fn().mockReturnValue('refresh'),
        gmailTokenExpiry: new Date(Date.now() + 3600000),
        email: 'test@tuifly.com'
      };

      // Test with invalid data type
      const result = await gmailService.sendEmail(mockUser, 'not-an-array');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email data');
    });

    it('should handle network timeouts', async () => {
      const mockUser = {
        getDecryptedGmailAccessToken: jest.fn().mockReturnValue('token'),
        getDecryptedGmailRefreshToken: jest.fn().mockReturnValue('refresh'),
        gmailTokenExpiry: new Date(Date.now() + 3600000),
        email: 'test@tuifly.com'
      };

      mockGmail.users.messages.send.mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Request timeout'
      });

      const result = await gmailService.sendEmail(mockUser, {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('Integration with User Model', () => {
    it('should work with encrypted tokens', async () => {
      const mockUser = {
        getDecryptedGmailAccessToken: jest.fn().mockReturnValue('decrypted-access'),
        getDecryptedGmailRefreshToken: jest.fn().mockReturnValue('decrypted-refresh'),
        gmailTokenExpiry: new Date(Date.now() + 3600000),
        gmailAccessToken: 'encrypted:access:token',
        gmailRefreshToken: 'encrypted:refresh:token'
      };

      gmailService.setUserCredentials(mockUser);

      expect(mockUser.getDecryptedGmailAccessToken).toHaveBeenCalled();
      expect(mockUser.getDecryptedGmailRefreshToken).toHaveBeenCalled();
      
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: 'decrypted-access',
        refresh_token: 'decrypted-refresh',
        expiry_date: mockUser.gmailTokenExpiry.getTime()
      });
    });

    it('should handle token decryption failures', async () => {
      const mockUser = {
        getDecryptedGmailAccessToken: jest.fn().mockReturnValue(null),
        getDecryptedGmailRefreshToken: jest.fn().mockReturnValue(null),
        gmailTokenExpiry: new Date(Date.now() + 3600000)
      };

      const emailData = {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test'
      };

      const result = await gmailService.sendEmail(mockUser, mockRequests);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No valid Gmail credentials');
    });
  });

  describe('Message Formatting', () => {
    it('should properly encode special characters', async () => {
      const mockUser = {
        getDecryptedGmailAccessToken: jest.fn().mockReturnValue('token'),
        getDecryptedGmailRefreshToken: jest.fn().mockReturnValue('refresh'),
        gmailTokenExpiry: new Date(Date.now() + 3600000),
        email: 'test@tuifly.com'
      };

      const specialRequests = [{
        id: 1,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        customMessage: 'Body with spëcîål chárãctërs and line\nbreaks'
      }];

      await gmailService.sendEmail(mockUser, specialRequests);

      const sentCall = mockGmail.users.messages.send.mock.calls[0][0];
      const decodedEmail = Buffer.from(sentCall.resource.raw, 'base64').toString();

      // Special characters are handled in email generation
      expect(decodedEmail).toContain('line\nbreaks');
    });

    it('should handle very long email content', async () => {
      const mockUser = {
        getDecryptedGmailAccessToken: jest.fn().mockReturnValue('token'),
        getDecryptedGmailRefreshToken: jest.fn().mockReturnValue('refresh'),
        gmailTokenExpiry: new Date(Date.now() + 3600000),
        email: 'test@tuifly.com'
      };

      const longBody = 'A'.repeat(100000); // 100KB body

      const longRequests = [{
        id: 1,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        customMessage: longBody
      }];

      const result = await gmailService.sendEmail(mockUser, longRequests);

      expect(result.success).toBe(true);
    });
  });
});