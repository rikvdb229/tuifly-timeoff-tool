// tests/unit/routes/requests.test.js - Unit tests for requests API route handler

// Mock dependencies first
jest.mock('../../../../src/models', () => ({
  TimeOffRequest: {
    findAllByUser: jest.fn(),
    createForUser: jest.fn(),
    findByPkAndUser: jest.fn(),
    getStatusCountsForUser: jest.fn(),
    getConflictsForUser: jest.fn(),
  },
  User: {
    findByPk: jest.fn(),
  },
}));

jest.mock('../../../../src/services/gmailService', () => {
  return jest.fn().mockImplementation(() => ({
    generateEmailContent: jest.fn().mockReturnValue({
      to: 'test@example.com',
      subject: 'Test Subject',
      text: 'Test Body',
      html: 'Test HTML Body'
    }),
    sendEmail: jest.fn().mockResolvedValue({
      messageId: 'message-123',
      threadId: 'thread-123',
      to: 'test@example.com',
      subject: 'Test Subject'
    })
  }));
});

jest.mock('../../../../src/utils/sanitize', () => ({
  sanitizeRequestBody: jest.fn(() => (req, res, next) => next()),
}));

jest.mock('../../../../src/utils/logger', () => ({
  routeLogger: {
    info: jest.fn(),
    logError: jest.fn(),
  },
}));

const express = require('express');
const request = require('supertest');
const requestsRouter = require('../../../../src/routes/api/requests');
const { TimeOffRequest, User } = require('../../../../src/models');
const { routeLogger } = require('../../../../src/utils/logger');
const GmailService = require('../../../../src/services/gmailService');

describe('Requests API Route Handler', () => {
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
      canSendEmails: jest.fn().mockReturnValue(true),
      toSafeObject: jest.fn().mockReturnValue({ id: 'user123', name: 'Test User' }),
    };
    
    // Mock authenticated user middleware
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });
    
    app.use('/', requestsRouter);

    jest.clearAllMocks();
  });

  describe('GET /requests', () => {
    it('should return user requests with enhancement', async () => {
      const mockRequests = [
        {
          id: 1,
          startDate: '2024-02-01',
          endDate: '2024-02-01',
          type: 'REQ_DO',
          status: 'PENDING',
          toJSON: jest.fn().mockReturnValue({
            id: 1,
            startDate: '2024-02-01',
            endDate: '2024-02-01',
            type: 'REQ_DO',
            status: 'PENDING'
          }),
          getEmailStatus: jest.fn().mockReturnValue({
            status: 'sent',
            icon: '✅',
            label: 'Email sent',
          }),
          getEmailStatusIcon: jest.fn().mockReturnValue('✅'),
          getEmailStatusLabel: jest.fn().mockReturnValue('Email sent'),
          canManualEmailBeSent: jest.fn().mockReturnValue(true),
          isEmailSent: jest.fn().mockReturnValue(true),
          hasReply: jest.fn().mockReturnValue(false),
        },
      ];

      TimeOffRequest.findAllByUser.mockResolvedValue(mockRequests);
      mockUser.toSafeObject = jest.fn().mockReturnValue({ id: 'user123', name: 'Test User' });

      const response = await request(app)
        .get('/requests')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toHaveProperty('emailStatus');
      expect(response.body.data[0]).toHaveProperty('canManualEmailBeSent');
      expect(response.body.count).toBe(1);
    });

    it('should handle pagination parameters', async () => {
      TimeOffRequest.findAllByUser.mockResolvedValue([]);
      mockUser.toSafeObject = jest.fn().mockReturnValue({ id: 'user123', name: 'Test User' });

      await request(app)
        .get('/requests?limit=10&offset=5')
        .expect(200);

      expect(TimeOffRequest.findAllByUser).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          limit: 10,
          offset: 5,
        })
      );
    });

    it('should handle status filter', async () => {
      TimeOffRequest.findAllByUser.mockResolvedValue([]);
      mockUser.toSafeObject = jest.fn().mockReturnValue({ id: 'user123', name: 'Test User' });

      await request(app)
        .get('/requests?status=APPROVED')
        .expect(200);

      expect(TimeOffRequest.findAllByUser).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          where: { status: 'APPROVED' },
        })
      );
    });

    it('should handle database errors', async () => {
      TimeOffRequest.findAllByUser.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/requests')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch requests');
      expect(routeLogger.logError).toHaveBeenCalled();
    });
  });

  describe('POST /requests', () => {
    it('should create a new request successfully with automatic email', async () => {
      const requestData = {
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'REQ_DO',
        customMessage: 'Please approve',
      };

      const mockCreatedRequest = {
        id: 1,
        ...requestData,
        userId: mockUser.id,
        status: 'PENDING',
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          ...requestData,
          userId: mockUser.id,
          status: 'PENDING',
        }),
        getEmailStatus: jest.fn().mockReturnValue({ status: 'sent' }),
        getEmailStatusIcon: jest.fn().mockReturnValue('✅'),
        getEmailStatusLabel: jest.fn().mockReturnValue('Email sent'),
        markEmailSent: jest.fn(),
      };

      TimeOffRequest.createForUser.mockResolvedValue(mockCreatedRequest);
      
      const response = await request(app)
        .post('/requests')
        .send(requestData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('emailStatus');
      expect(TimeOffRequest.createForUser).toHaveBeenCalledWith(
        mockUser.id,
        {
          ...requestData,
          flightNumber: null,
        }
      );
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/requests')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required fields');
      expect(response.body.details).toBeDefined();
    });

    it('should handle creation errors', async () => {
      TimeOffRequest.createForUser.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .post('/requests')
        .send({
          startDate: '2024-02-01',
          endDate: '2024-02-01',
          type: 'REQ_DO',
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to create request');
    });
  });

  describe('GET /requests/:id', () => {
    it('should return specific request', async () => {
      const mockRequest = {
        id: 1,
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'REQ_DO',
        status: 'PENDING',
        userId: mockUser.id,
      };

      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);

      const response = await request(app)
        .get('/requests/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(1);
      expect(TimeOffRequest.findByPkAndUser).toHaveBeenCalledWith(1, mockUser.id);
    });

    it('should return 404 for non-existent request', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .get('/requests/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Request not found');
    });

    it('should handle database errors', async () => {
      TimeOffRequest.findByPkAndUser.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/requests/1')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch request');
    });
  });

  describe('PUT /requests/:id', () => {
    it('should update request successfully', async () => {
      const updateData = {
        customMessage: 'Updated message',
        type: 'PM_OFF',
      };

      const mockRequest = {
        id: 1,
        userId: mockUser.id,
        isEditable: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(),
      };

      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);

      const response = await request(app)
        .put('/requests/1')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Time-off request updated successfully');
      expect(mockRequest.update).toHaveBeenCalledWith(updateData);
    });

    it('should handle non-editable requests', async () => {
      const mockRequest = {
        id: 1,
        userId: mockUser.id,
        isEditable: jest.fn().mockReturnValue(false),
      };

      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);

      const response = await request(app)
        .put('/requests/1')
        .send({ customMessage: 'Updated' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Request cannot be edited');
    });

    it('should handle request not found', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .put('/requests/1')
        .send({ customMessage: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Request not found');
    });
  });

  describe('DELETE /requests/:id', () => {
    it('should delete request successfully', async () => {
      const mockRequest = {
        id: 1,
        userId: mockUser.id,
        type: 'REQ_DO',
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        canBeDeleted: jest.fn().mockReturnValue(true),
        destroy: jest.fn().mockResolvedValue(),
      };

      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);

      const response = await request(app)
        .delete('/requests/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Request deleted successfully');
      expect(mockRequest.destroy).toHaveBeenCalled();
    });

    it('should handle non-deletable requests', async () => {
      const mockRequest = {
        id: 1,
        userId: mockUser.id,
        canBeDeleted: jest.fn().mockReturnValue(false),
      };

      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);

      const response = await request(app)
        .delete('/requests/1')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Cannot delete request: email has already been sent');
    });

    it('should handle invalid request ID', async () => {
      const response = await request(app)
        .delete('/requests/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid request ID');
    });

    it('should handle request not found', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .delete('/requests/1')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Request not found');
    });
  });

  describe('GET /requests/conflicts', () => {
    it('should check for date conflicts', async () => {
      const mockConflicts = [
        {
          id: 1,
          startDate: '2024-02-01',
          endDate: '2024-02-01',
          type: 'REQ_DO',
        },
      ];

      TimeOffRequest.getConflictsForUser.mockResolvedValue(mockConflicts);

      const response = await request(app)
        .get('/requests/conflicts?startDate=2024-02-01&endDate=2024-02-01')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasConflicts).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(TimeOffRequest.getConflictsForUser).toHaveBeenCalledWith(
        mockUser.id,
        '2024-02-01',
        '2024-02-01',
        undefined
      );
    });

    it('should require date parameters', async () => {
      const response = await request(app)
        .get('/requests/conflicts')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('startDate and endDate are required');
    });
  });

  describe('GET /requests/stats', () => {
    it('should return request statistics', async () => {
      const mockStats = {
        total: 5,
        pending: 2,
        approved: 2,
        denied: 1,
      };

      TimeOffRequest.getStatusCountsForUser.mockResolvedValue(mockStats);
      mockUser.toSafeObject = jest.fn().mockReturnValue({ id: 'user123', name: 'Test User' });

      const response = await request(app)
        .get('/requests/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
      expect(TimeOffRequest.getStatusCountsForUser).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle stats errors', async () => {
      TimeOffRequest.getStatusCountsForUser.mockRejectedValue(
        new Error('Stats error')
      );

      const response = await request(app)
        .get('/requests/stats')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch statistics');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      // Simulate malformed JSON by sending invalid data
      const response = await request(app)
        .post('/requests')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      // Express should handle this before our route
      expect(response.status).toBe(400);
    });

    it('should handle general errors', async () => {
      TimeOffRequest.findAllByUser.mockRejectedValue(new Error('Unexpected error'));

      const response = await request(app)
        .get('/requests')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch requests');
    });
  });
});