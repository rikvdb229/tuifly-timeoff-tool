// tests/unit/routes/api/users.test.js - Unit tests for users API route handler

// Mock dependencies first
jest.mock('../../../../src/utils/sanitize', () => ({
  sanitizeRequestBody: jest.fn(() => (req, res, next) => next()),
}));

jest.mock('../../../../src/services', () => ({
  serviceContainer: {
    getService: jest.fn(),
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  routeLogger: {
    info: jest.fn(),
    logError: jest.fn(),
  },
}));

const express = require('express');
const request = require('supertest');
const usersRouter = require('../../../../src/routes/api/users');
const { serviceContainer } = require('../../../../src/services');
const { routeLogger } = require('../../../../src/utils/logger');

describe('Users API Route Handler', () => {
  let app;
  let mockUser;
  let mockUserService;

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
    };
    
    mockUserService = {
      getEmailPreference: jest.fn(),
      updateEmailPreference: jest.fn(),
      getUserSafeObject: jest.fn(),
    };
    
    // Mock authenticated user middleware
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });
    
    app.use('/', usersRouter);

    serviceContainer.getService.mockReturnValue(mockUserService);
    jest.clearAllMocks();
  });

  describe('GET /user/email-preference', () => {
    it('should return user email preference successfully', async () => {
      const preferenceData = {
        emailPreference: 'automatic',
        canSendEmails: 'Test User - TST',
        gmailScopeGranted: true,
        usesAutomaticEmail: true,
        usesManualEmail: false,
      };

      const userSafeObject = {
        id: 'user123',
        name: 'Test User',
        code: 'TST',
        email: 'test@tuifly.com',
      };

      mockUserService.getEmailPreference.mockResolvedValue(preferenceData);
      mockUserService.getUserSafeObject.mockReturnValue(userSafeObject);

      const response = await request(app)
        .get('/user/email-preference')
        .expect(200);

      expect(serviceContainer.getService).toHaveBeenCalledWith('userService');
      expect(mockUserService.getEmailPreference).toHaveBeenCalledWith(mockUser);
      expect(mockUserService.getUserSafeObject).toHaveBeenCalledWith(mockUser);

      expect(response.body).toEqual({
        success: true,
        data: preferenceData,
        user: userSafeObject,
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Service unavailable');
      error.statusCode = 503;
      mockUserService.getEmailPreference.mockRejectedValue(error);

      const response = await request(app)
        .get('/user/email-preference')
        .expect(503);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch email preference',
        message: 'Service unavailable',
      });

      expect(routeLogger.logError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          operation: 'fetchUserEmailPreference',
          userId: 'user123',
          userEmail: 'test@tuifly.com',
          endpoint: '/user/email-preference',
        })
      );
    });

    it('should handle service errors without status code', async () => {
      const error = new Error('Unexpected error');
      mockUserService.getEmailPreference.mockRejectedValue(error);

      const response = await request(app)
        .get('/user/email-preference')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch email preference',
        message: 'Unexpected error',
      });
    });

    it('should handle missing user service', async () => {
      serviceContainer.getService.mockReturnValue(null);

      const response = await request(app)
        .get('/user/email-preference')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch email preference');
    });
  });

  describe('PUT /user/email-preference', () => {
    it('should update email preference successfully', async () => {
      const updateResult = {
        emailPreference: 'manual',
        requiresGmailAuth: false,
        gmailScopeGranted: true,
        message: 'Email preference updated to manual mode',
      };

      const userSafeObject = {
        id: 'user123',
        name: 'Test User',
        code: 'TST',
        email: 'test@tuifly.com',
        emailPreference: 'manual',
      };

      mockUserService.updateEmailPreference.mockResolvedValue(updateResult);
      mockUserService.getUserSafeObject.mockReturnValue(userSafeObject);

      const response = await request(app)
        .put('/user/email-preference')
        .send({ preference: 'manual' })
        .expect(200);

      expect(mockUserService.updateEmailPreference).toHaveBeenCalledWith(
        mockUser,
        'manual'
      );

      expect(response.body).toEqual({
        success: true,
        message: 'Email preference updated to manual mode',
        data: {
          emailPreference: 'manual',
          requiresGmailAuth: false,
          gmailScopeGranted: true,
        },
        user: userSafeObject,
      });

      expect(routeLogger.info).toHaveBeenCalledWith(
        'User email preference updated successfully',
        expect.objectContaining({
          userId: 'user123',
          userEmail: 'test@tuifly.com',
          newPreference: 'manual',
          operation: 'updateUserEmailPreference',
        })
      );
    });

    it('should update to automatic preference requiring Gmail auth', async () => {
      const updateResult = {
        emailPreference: 'automatic',
        requiresGmailAuth: true,
        gmailScopeGranted: false,
        message: 'Email preference updated to automatic mode. Gmail authorization required.',
      };

      mockUserService.updateEmailPreference.mockResolvedValue(updateResult);
      mockUserService.getUserSafeObject.mockReturnValue({
        id: 'user123',
        emailPreference: 'automatic',
      });

      const response = await request(app)
        .put('/user/email-preference')
        .send({ preference: 'automatic' })
        .expect(200);

      expect(response.body.data.requiresGmailAuth).toBe(true);
      expect(response.body.data.gmailScopeGranted).toBe(false);
      expect(response.body.message).toContain('Gmail authorization required');
    });

    it('should handle validation errors from service', async () => {
      const error = new Error('Invalid preference value');
      error.statusCode = 400;
      mockUserService.updateEmailPreference.mockRejectedValue(error);

      const response = await request(app)
        .put('/user/email-preference')
        .send({ preference: 'invalid' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to update email preference',
        message: 'Invalid preference value',
      });

      expect(routeLogger.logError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          operation: 'updateUserEmailPreference',
          userId: 'user123',
          requestedPreference: 'invalid',
          endpoint: 'PUT /user/email-preference',
        })
      );
    });

    it('should handle service errors without status code', async () => {
      const error = new Error('Database connection failed');
      mockUserService.updateEmailPreference.mockRejectedValue(error);

      const response = await request(app)
        .put('/user/email-preference')
        .send({ preference: 'manual' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to update email preference',
        message: 'Database connection failed',
      });
    });

    it('should handle missing request body', async () => {
      const error = new Error('Preference is required');
      error.statusCode = 400;
      mockUserService.updateEmailPreference.mockRejectedValue(error);

      const response = await request(app)
        .put('/user/email-preference')
        .send({})
        .expect(400);

      expect(mockUserService.updateEmailPreference).toHaveBeenCalledWith(
        mockUser,
        undefined
      );

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to update email preference');
    });

    it('should handle null preference value', async () => {
      const error = new Error('Preference cannot be null');
      error.statusCode = 400;
      mockUserService.updateEmailPreference.mockRejectedValue(error);

      const response = await request(app)
        .put('/user/email-preference')
        .send({ preference: null })
        .expect(400);

      expect(mockUserService.updateEmailPreference).toHaveBeenCalledWith(
        mockUser,
        null
      );
    });

    it('should handle empty string preference', async () => {
      const error = new Error('Preference cannot be empty');
      error.statusCode = 400;
      mockUserService.updateEmailPreference.mockRejectedValue(error);

      const response = await request(app)
        .put('/user/email-preference')
        .send({ preference: '' })
        .expect(400);

      expect(mockUserService.updateEmailPreference).toHaveBeenCalledWith(
        mockUser,
        ''
      );
    });

    it('should handle missing user service', async () => {
      serviceContainer.getService.mockReturnValue(null);

      const response = await request(app)
        .put('/user/email-preference')
        .send({ preference: 'manual' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to update email preference');
    });
  });


  describe('Error Handling Edge Cases', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .put('/user/email-preference')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.status).toBe(400);
    });

    it('should handle service throwing non-Error objects', async () => {
      mockUserService.getEmailPreference.mockRejectedValue('String error');

      const response = await request(app)
        .get('/user/email-preference')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch email preference');
    });

    it('should handle service returning unexpected response format', async () => {
      mockUserService.updateEmailPreference.mockResolvedValue(null);

      const response = await request(app)
        .put('/user/email-preference')
        .send({ preference: 'manual' })
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle concurrent requests', async () => {
      mockUserService.getEmailPreference.mockResolvedValue({
        emailPreference: 'automatic',
      });
      mockUserService.getUserSafeObject.mockReturnValue({ id: 'user123' });

      const requests = Array(5).fill().map(() =>
        request(app).get('/user/email-preference')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      expect(mockUserService.getEmailPreference).toHaveBeenCalledTimes(5);
    });
  });

  describe('Logging', () => {
    it('should log successful operations with correct context', async () => {
      const updateResult = {
        emailPreference: 'manual',
        requiresGmailAuth: false,
        gmailScopeGranted: true,
        message: 'Updated successfully',
      };

      mockUserService.updateEmailPreference.mockResolvedValue(updateResult);
      mockUserService.getUserSafeObject.mockReturnValue({ id: 'user123' });

      await request(app)
        .put('/user/email-preference')
        .send({ preference: 'manual' })
        .expect(200);

      expect(routeLogger.info).toHaveBeenCalledWith(
        'User email preference updated successfully',
        {
          userId: 'user123',
          userEmail: 'test@tuifly.com',
          newPreference: 'manual',
          requiresGmailAuth: false,
          operation: 'updateUserEmailPreference',
        }
      );
    });

    it('should log errors with appropriate context', async () => {
      const error = new Error('Test error');
      error.statusCode = 400;
      mockUserService.getEmailPreference.mockRejectedValue(error);

      await request(app)
        .get('/user/email-preference')
        .expect(400);

      expect(routeLogger.logError).toHaveBeenCalledWith(
        error,
        {
          operation: 'fetchUserEmailPreference',
          userId: 'user123',
          userEmail: 'test@tuifly.com',
          endpoint: '/user/email-preference',
        }
      );
    });

    it('should handle logging when user is missing', async () => {
      app = express();
      app.use(express.json());
      
      // No user middleware
      app.use('/', usersRouter);
      
      const error = new Error('User not found');
      mockUserService.getEmailPreference.mockRejectedValue(error);

      await request(app)
        .get('/user/email-preference')
        .expect(500);

      expect(routeLogger.logError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          userId: undefined,
          userEmail: undefined,
        })
      );
    });
  });
});