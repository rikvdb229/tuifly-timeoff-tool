// tests/unit/services/emailNotificationService.test.js - Tests for EmailNotificationService
const EmailNotificationService = require('../../../src/services/emailNotificationService');
const nodemailer = require('nodemailer');

// Mock dependencies
jest.mock('nodemailer');
jest.mock('../../../src/utils/logger', () => ({
  serviceLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    logError: jest.fn()
  }
}));

describe('EmailNotificationService', () => {
  let mockTransporter;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the service instance
    const service = require('../../../src/services/emailNotificationService');
    service.initialized = false;
    service.transporter = null;
    service.mockEmailMode = false;

    // Mock transporter
    mockTransporter = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg123' })
    };

    nodemailer.createTransporter = jest.fn().mockReturnValue(mockTransporter);
  });

  describe('initialize', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should initialize with SMTP configuration', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'password123';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_SECURE = 'false';

      await EmailNotificationService.initialize();

      expect(nodemailer.createTransporter).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: '587',
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'password123'
        }
      });

      expect(mockTransporter.verify).toHaveBeenCalled();
      expect(EmailNotificationService.initialized).toBe(true);
      expect(EmailNotificationService.mockEmailMode).toBe(false);
    });

    it('should use secure connection when configured', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'password123';
      process.env.SMTP_SECURE = 'true';

      await EmailNotificationService.initialize();

      expect(nodemailer.createTransporter).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: true
        })
      );
    });

    it('should fall back to mock mode when no SMTP configured', async () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASSWORD;

      await EmailNotificationService.initialize();

      expect(nodemailer.createTransporter).not.toHaveBeenCalled();
      expect(EmailNotificationService.mockEmailMode).toBe(true);
      expect(EmailNotificationService.initialized).toBe(true);
    });

    it('should fall back to mock mode on SMTP connection error', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'password123';
      
      mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));

      await EmailNotificationService.initialize();

      expect(EmailNotificationService.mockEmailMode).toBe(true);
      expect(EmailNotificationService.initialized).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      EmailNotificationService.initialized = true;

      await EmailNotificationService.initialize();

      expect(nodemailer.createTransporter).not.toHaveBeenCalled();
    });
  });

  describe('notifyAdminOfNewUser', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        id: 1,
        email: 'newuser@tuifly.com',
        name: 'New User',
        code: 'NEW',
        createdAt: new Date('2024-01-01'),
        isOnboarded: jest.fn().mockReturnValue(false)
      };

      process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@tuifly.com';
      process.env.HOST = 'https://timeoff.tuifly.com';
    });

    it('should send admin notification email via SMTP', async () => {
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;

      const result = await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@tuifly.com',
          subject: 'TUIfly Time-Off Tool - New User Needs Approval',
          text: expect.stringContaining('newuser@tuifly.com'),
          text: expect.stringContaining('New User'),
          text: expect.stringContaining('NEW'),
          text: expect.stringContaining('https://timeoff.tuifly.com/admin/users')
        })
      );

      expect(result).toBe(true);
    });

    it('should send admin notification in mock mode', async () => {
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = true;

      const result = await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should auto-initialize if not initialized', async () => {
      EmailNotificationService.initialized = false;
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'password123';

      const result = await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(nodemailer.createTransporter).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when no admin email configured', async () => {
      delete process.env.ADMIN_NOTIFICATION_EMAIL;
      EmailNotificationService.initialized = true;

      const result = await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(result).toBe(false);
    });

    it('should handle SMTP send errors gracefully', async () => {
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;
      
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP failed'));

      const result = await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(result).toBe(false);
    });

    it('should use default host when not configured', async () => {
      delete process.env.HOST;
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;

      await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('http://localhost:3000/admin/users')
        })
      );
    });

    it('should handle users without name or code', async () => {
      mockUser.name = null;
      mockUser.code = null;
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;

      await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Not set yet')
        })
      );
    });

    it('should show onboarded status correctly', async () => {
      mockUser.isOnboarded.mockReturnValue(true);
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;

      await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Onboarded: Yes')
        })
      );
    });

    it('should use custom SMTP_FROM when configured', async () => {
      process.env.SMTP_FROM = '"TUIfly Admin" <admin@tuifly.com>';
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;

      await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"TUIfly Admin" <admin@tuifly.com>'
        })
      );
    });
  });

  describe('notifyUserApproval', () => {
    let mockUser, mockAdmin;

    beforeEach(() => {
      mockUser = {
        id: 1,
        email: 'user@tuifly.com',
        name: 'Test User'
      };

      mockAdmin = {
        id: 2,
        email: 'admin@tuifly.com',
        name: 'Admin User'
      };

      process.env.HOST = 'https://timeoff.tuifly.com';
    });

    it('should send user approval notification via SMTP', async () => {
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;

      const result = await EmailNotificationService.notifyUserApproval(mockUser, mockAdmin);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@tuifly.com',
          subject: 'TUIfly Time-Off Tool - Access Approved!',
          text: expect.stringContaining('Your access to the TUIfly Time-Off Tool has been approved'),
          text: expect.stringContaining('https://timeoff.tuifly.com'),
          text: expect.stringContaining('Approved by: Admin User')
        })
      );

      expect(result).toBe(true);
    });

    it('should send user approval notification in mock mode', async () => {
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = true;

      const result = await EmailNotificationService.notifyUserApproval(mockUser, mockAdmin);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should use admin email when name not available', async () => {
      mockAdmin.name = null;
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;

      await EmailNotificationService.notifyUserApproval(mockUser, mockAdmin);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Approved by: admin@tuifly.com')
        })
      );
    });

    it('should use default host when not configured', async () => {
      delete process.env.HOST;
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;

      await EmailNotificationService.notifyUserApproval(mockUser, mockAdmin);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('http://localhost:3000')
        })
      );
    });

    it('should handle SMTP send errors gracefully', async () => {
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;
      
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP failed'));

      const result = await EmailNotificationService.notifyUserApproval(mockUser, mockAdmin);

      expect(result).toBe(false);
    });

    it('should auto-initialize if not initialized', async () => {
      EmailNotificationService.initialized = false;
      EmailNotificationService.mockEmailMode = true;

      const result = await EmailNotificationService.notifyUserApproval(mockUser, mockAdmin);

      expect(EmailNotificationService.initialized).toBe(true);
      expect(result).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'password123';
      
      nodemailer.createTransporter.mockImplementation(() => {
        throw new Error('Transporter creation failed');
      });

      await EmailNotificationService.initialize();

      expect(EmailNotificationService.mockEmailMode).toBe(true);
      expect(EmailNotificationService.initialized).toBe(true);
    });

    it('should handle missing environment variables', async () => {
      const originalEnv = process.env;
      process.env = {}; // Clear all env vars

      const mockUser = {
        email: 'test@tuifly.com',
        isOnboarded: jest.fn().mockReturnValue(false)
      };

      const result = await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(result).toBe(false);
      
      process.env = originalEnv;
    });

    it('should handle network timeouts', async () => {
      EmailNotificationService.initialized = true;
      EmailNotificationService.mockEmailMode = false;
      EmailNotificationService.transporter = mockTransporter;
      
      const timeoutError = new Error('Connection timeout');
      timeoutError.code = 'ETIMEDOUT';
      
      mockTransporter.sendMail.mockRejectedValue(timeoutError);

      const mockUser = {
        email: 'test@tuifly.com',
        isOnboarded: jest.fn().mockReturnValue(false)
      };

      process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@tuifly.com';

      const result = await EmailNotificationService.notifyAdminOfNewUser(mockUser);

      expect(result).toBe(false);
    });
  });

  describe('Service Configuration', () => {
    it('should export singleton instance', () => {
      const service1 = require('../../../src/services/emailNotificationService');
      const service2 = require('../../../src/services/emailNotificationService');
      
      expect(service1).toBe(service2);
    });

    it('should handle different port configurations', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'password123';
      process.env.SMTP_PORT = '465';

      await EmailNotificationService.initialize();

      expect(nodemailer.createTransporter).toHaveBeenCalledWith(
        expect.objectContaining({
          port: '465'
        })
      );
    });

    it('should use default port when not specified', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'password123';
      delete process.env.SMTP_PORT;

      await EmailNotificationService.initialize();

      expect(nodemailer.createTransporter).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587
        })
      );
    });
  });
});