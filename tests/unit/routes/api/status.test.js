// tests/unit/routes/api/status.test.js - Unit tests for status API route handler

// Mock dependencies first
jest.mock('../../../../src/models', () => ({
  TimeOffRequest: {
    findByPkAndUser: jest.fn(),
    getByGroupIdAndUser: jest.fn(),
  },
}));

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
const statusRouter = require('../../../../src/routes/api/status');
const { TimeOffRequest } = require('../../../../src/models');
const { routeLogger } = require('../../../../src/utils/logger');

describe('Status API Route Handler', () => {
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
    };
    
    // Mock authenticated user middleware
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });
    
    app.use('/', statusRouter);

    jest.clearAllMocks();
  });

  describe('PUT /requests/:id/status', () => {
    const mockRequest = {
      id: 1,
      userId: 'user123',
      groupId: null,
      emailMode: 'automatic',
      emailSent: true,
      manualEmailConfirmed: false,
      status: 'PENDING',
      update: jest.fn(),
    };

    beforeEach(() => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);
      mockRequest.update.mockResolvedValue(mockRequest);
    });

    it('should update request status to APPROVED successfully', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(TimeOffRequest.findByPkAndUser).toHaveBeenCalledWith('1', 'user123');
      
      expect(mockRequest.update).toHaveBeenCalledWith({
        status: 'APPROVED',
        statusUpdateMethod: 'manual_user_update',
        statusUpdatedAt: expect.any(Date),
        approvalDate: expect.any(Date),
        denialReason: null,
      });

      expect(response.body).toEqual({
        success: true,
        message: 'Request marked as approved successfully',
        data: {
          updatedCount: 1,
          status: 'APPROVED',
          statusUpdatedAt: expect.any(String),
          isGroup: false,
          groupId: null,
          method: 'manual_user_update',
          updateGroup: false,
        },
      });

      expect(routeLogger.info).toHaveBeenCalledWith(
        'Request status updated successfully',
        expect.objectContaining({
          userId: 'user123',
          userEmail: 'test@tuifly.com',
          requestId: '1',
          newStatus: 'APPROVED',
          method: 'manual_user_update',
          operation: 'updateRequestStatus',
        })
      );
    });

    it('should update request status to DENIED successfully', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'DENIED', method: 'reply_email_parsing' })
        .expect(200);

      expect(mockRequest.update).toHaveBeenCalledWith({
        status: 'DENIED',
        statusUpdateMethod: 'reply_email_parsing',
        statusUpdatedAt: expect.any(Date),
        approvalDate: null,
      });

      expect(response.body.data.status).toBe('DENIED');
      expect(response.body.data.method).toBe('reply_email_parsing');
      expect(response.body.message).toBe('Request marked as denied successfully');
    });

    it('should update request status to PENDING successfully', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'PENDING' })
        .expect(200);

      expect(mockRequest.update).toHaveBeenCalledWith({
        status: 'PENDING',
        statusUpdateMethod: 'manual_user_update',
        statusUpdatedAt: expect.any(Date),
        approvalDate: null,
        denialReason: null,
      });

      expect(response.body.data.status).toBe('PENDING');
      expect(response.body.message).toBe('Request marked as pending successfully');
    });

    it('should update group requests when updateGroup is true', async () => {
      mockRequest.groupId = 'group123';
      const groupRequests = [
        { ...mockRequest, id: 1, update: jest.fn() },
        { id: 2, update: jest.fn() },
      ];

      TimeOffRequest.getByGroupIdAndUser.mockResolvedValue(groupRequests);

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED', updateGroup: true })
        .expect(200);

      expect(TimeOffRequest.getByGroupIdAndUser).toHaveBeenCalledWith('group123', 'user123');
      expect(groupRequests[0].update).toHaveBeenCalled();
      expect(groupRequests[1].update).toHaveBeenCalled();
      
      expect(response.body.data.updatedCount).toBe(2);
      expect(response.body.data.isGroup).toBe(true);
      expect(response.body.data.groupId).toBe('group123');
      expect(response.body.data.updateGroup).toBe(true);
      expect(response.body.message).toBe('Requests marked as approved successfully');
    });

    it('should work with manual email mode when email confirmed', async () => {
      mockRequest.emailMode = 'manual';
      mockRequest.emailSent = false;
      mockRequest.manualEmailConfirmed = true;

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockRequest.update).toHaveBeenCalled();
    });

    it('should return 400 for invalid status', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'INVALID' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid status',
        message: 'Status must be APPROVED, DENIED, or PENDING',
      });

      expect(mockRequest.update).not.toHaveBeenCalled();
    });

    it('should return 404 for non-existent request', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .put('/requests/999/status')
        .send({ status: 'APPROVED' })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Request not found',
      });
    });

    it('should return 400 when email not sent in automatic mode', async () => {
      mockRequest.emailMode = 'automatic';
      mockRequest.emailSent = false;

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Cannot update status before email is sent',
        message: 'Please send the email first before updating the status',
      });

      expect(mockRequest.update).not.toHaveBeenCalled();
    });

    it('should return 400 when email not confirmed in manual mode', async () => {
      mockRequest.emailMode = 'manual';
      mockRequest.emailSent = false;
      mockRequest.manualEmailConfirmed = false;

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Cannot update status before email is sent',
        message: 'Please send the email first before updating the status',
      });
    });

    it('should handle request with no emailMode (defaults to automatic)', async () => {
      mockRequest.emailMode = null;
      mockRequest.emailSent = true;

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle database errors during findByPkAndUser', async () => {
      TimeOffRequest.findByPkAndUser.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to update request status',
        message: 'Database connection failed',
      });

      expect(routeLogger.logError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          operation: 'updateRequestStatus',
          userId: 'user123',
          endpoint: 'PUT /requests/:id/status',
        })
      );
    });

    it('should handle update errors', async () => {
      mockRequest.update.mockRejectedValue(new Error('Update failed'));

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to update request status');
      expect(response.body.message).toBe('Update failed');
    });

    it('should handle group request fetch errors', async () => {
      mockRequest.groupId = 'group123';
      TimeOffRequest.getByGroupIdAndUser.mockRejectedValue(new Error('Group fetch failed'));

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED', updateGroup: true })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to update request status');
    });

    it('should handle missing request body parameters', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Invalid status');
    });

    it('should handle null status value', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: null })
        .expect(400);

      expect(response.body.error).toBe('Invalid status');
    });

    it('should handle empty string status', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: '' })
        .expect(400);

      expect(response.body.error).toBe('Invalid status');
    });

    it('should handle partial group update failures', async () => {
      mockRequest.groupId = 'group123';
      const groupRequests = [
        { ...mockRequest, id: 1, update: jest.fn().mockResolvedValue() },
        { id: 2, update: jest.fn().mockRejectedValue(new Error('Update failed for request 2')) },
      ];

      TimeOffRequest.getByGroupIdAndUser.mockResolvedValue(groupRequests);

      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED', updateGroup: true })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to update request status');
    });

    it('should handle case-sensitive status validation', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send({ status: 'approved' }) // lowercase
        .expect(400);

      expect(response.body.error).toBe('Invalid status');
    });

    it('should log context when user is missing', async () => {
      app = express();
      app.use(express.json());
      app.use('/', statusRouter); // No user middleware

      mockRequest.update.mockRejectedValue(new Error('Test error'));

      await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED' })
        .expect(500);

      expect(routeLogger.logError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          userId: undefined,
          userEmail: undefined,
        })
      );
    });

    it('should handle concurrent status updates', async () => {
      const updatePromises = Array(3).fill().map((_, i) =>
        request(app)
          .put(`/requests/${i + 1}/status`)
          .send({ status: 'APPROVED' })
      );

      const responses = await Promise.all(updatePromises);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      expect(TimeOffRequest.findByPkAndUser).toHaveBeenCalledTimes(3);
      expect(mockRequest.update).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .put('/requests/1/status')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.status).toBe(400);
    });

    it('should handle very large request IDs', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .put('/requests/999999999999999999/status')
        .send({ status: 'APPROVED' })
        .expect(404);

      expect(response.body.error).toBe('Request not found');
    });

    it('should handle special characters in request ID', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      const response = await request(app)
        .put('/requests/abc-123/status')
        .send({ status: 'APPROVED' })
        .expect(404);

      expect(response.body.error).toBe('Request not found');
    });
  });

  describe('Logging', () => {
    const mockRequest = {
      id: 1,
      userId: 'user123',
      groupId: null,
      emailMode: 'automatic',
      emailSent: true,
      update: jest.fn(),
    };

    beforeEach(() => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);
    });

    it('should log successful status updates with full context', async () => {
      await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED', method: 'manual_admin_override', updateGroup: true })
        .expect(200);

      expect(routeLogger.info).toHaveBeenCalledWith(
        'Request status updated successfully',
        {
          userId: 'user123',
          userEmail: 'test@tuifly.com',
          requestId: '1',
          newStatus: 'APPROVED',
          method: 'manual_admin_override',
          updateGroup: true,
          updatedCount: 1,
          isGroup: false,
          groupId: null,
          operation: 'updateRequestStatus',
        }
      );
    });

    it('should log errors with request context', async () => {
      const error = new Error('Test error');
      mockRequest.update.mockRejectedValue(error);

      await request(app)
        .put('/requests/1/status')
        .send({ status: 'APPROVED', method: 'test_method', updateGroup: false })
        .expect(500);

      expect(routeLogger.logError).toHaveBeenCalledWith(
        error,
        {
          operation: 'updateRequestStatus',
          userId: 'user123',
          userEmail: 'test@tuifly.com',
          requestId: '1',
          requestedStatus: 'APPROVED',
          method: 'test_method',
          updateGroup: false,
          endpoint: 'PUT /requests/:id/status',
        }
      );
    });
  });
});