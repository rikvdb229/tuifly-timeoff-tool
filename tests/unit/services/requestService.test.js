// tests/unit/services/requestService.test.js - Unit tests for RequestService

// Mock dependencies first
jest.mock('../../../src/models', () => ({
  TimeOffRequest: {
    createForUser: jest.fn(),
    findByPkAndUser: jest.fn(),
    findAllByUser: jest.fn(),
    getConflictsForUser: jest.fn(),
    getStatusCountsForUser: jest.fn(),
  },
  User: {
    findByPk: jest.fn(),
  },
}));

const RequestService = require('../../../src/services/requestService');
const { TimeOffRequest, User } = require('../../../src/models');

describe('RequestService', () => {
  let requestService;
  let mockUserService;

  beforeEach(() => {
    mockUserService = {
      getUserById: jest.fn(),
      validateUser: jest.fn(),
    };

    requestService = new RequestService(mockUserService);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with user service', () => {
      expect(requestService.userService).toBe(mockUserService);
    });
  });

  describe('createRequest', () => {
    const validRequestData = {
      startDate: '2024-02-01',
      endDate: '2024-02-01',
      type: 'REQ_DO',
      customMessage: 'Please approve',
    };

    it('should create a request successfully', async () => {
      const mockRequest = {
        id: 1,
        ...validRequestData,
        userId: 'user123',
        status: 'PENDING',
      };

      TimeOffRequest.createForUser.mockResolvedValue(mockRequest);

      const result = await requestService.createRequest('user123', validRequestData);

      expect(result).toEqual({
        request: mockRequest,
        message: 'Request created successfully',
      });
      expect(TimeOffRequest.createForUser).toHaveBeenCalledWith('user123', {
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'REQ_DO',
        flightNumber: null,
        customMessage: 'Please approve',
      });
    });

    it('should handle flight requests with flight number', async () => {
      const flightRequestData = {
        ...validRequestData,
        type: 'FLIGHT',
        flightNumber: 'TU123',
      };

      const mockRequest = {
        id: 1,
        ...flightRequestData,
        userId: 'user123',
      };

      TimeOffRequest.createForUser.mockResolvedValue(mockRequest);

      await requestService.createRequest('user123', flightRequestData);

      expect(TimeOffRequest.createForUser).toHaveBeenCalledWith('user123', {
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'FLIGHT',
        flightNumber: 'TU123',
        customMessage: 'Please approve',
      });
    });

    it('should validate required fields', async () => {
      const invalidData = {
        customMessage: 'Missing required fields',
      };

      await expect(
        requestService.createRequest('user123', invalidData)
      ).rejects.toThrow('Missing required fields');

      expect(TimeOffRequest.createForUser).not.toHaveBeenCalled();
    });

    it('should throw validation error with details', async () => {
      const invalidData = {};

      try {
        await requestService.createRequest('user123', invalidData);
      } catch (error) {
        expect(error.message).toBe('Missing required fields');
        expect(error.statusCode).toBe(400);
        expect(error.details).toEqual([
          { field: 'startDate', message: 'Start date is required' },
          { field: 'endDate', message: 'End date is required' },
          { field: 'type', message: 'Request type is required' },
        ]);
      }
    });

    it('should handle database errors', async () => {
      TimeOffRequest.createForUser.mockRejectedValue(new Error('Database error'));

      await expect(
        requestService.createRequest('user123', validRequestData)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getRequestById', () => {
    it('should return request when found', async () => {
      const mockRequest = {
        id: 1,
        userId: 'user123',
        type: 'REQ_DO',
        status: 'PENDING',
      };

      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);

      const result = await requestService.getRequestById(1, 'user123');

      expect(result).toBe(mockRequest);
      expect(TimeOffRequest.findByPkAndUser).toHaveBeenCalledWith(1, 'user123');
    });

    it('should throw error when request not found', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      await expect(
        requestService.getRequestById(999, 'user123')
      ).rejects.toThrow('Request not found');

      const error = await requestService.getRequestById(999, 'user123').catch(e => e);
      expect(error.statusCode).toBe(404);
    });

    it('should handle database errors', async () => {
      TimeOffRequest.findByPkAndUser.mockRejectedValue(new Error('Database error'));

      await expect(
        requestService.getRequestById(1, 'user123')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getUserRequests', () => {
    const mockRequests = [
      {
        id: 1,
        type: 'REQ_DO',
        status: 'PENDING',
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          type: 'REQ_DO',
          status: 'PENDING',
        }),
        getEmailStatus: jest.fn().mockReturnValue({ status: 'sent' }),
        getEmailStatusIcon: jest.fn().mockReturnValue('✅'),
        getEmailStatusLabel: jest.fn().mockReturnValue('Email sent'),
        canManualEmailBeSent: jest.fn().mockReturnValue(true),
        isEmailSent: jest.fn().mockReturnValue(true),
        hasReply: jest.fn().mockReturnValue(false),
      },
    ];

    it('should return enhanced requests', async () => {
      TimeOffRequest.findAllByUser.mockResolvedValue(mockRequests);

      const result = await requestService.getUserRequests('user123');

      expect(result.requests).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.requests[0]).toHaveProperty('emailStatus');
      expect(result.requests[0]).toHaveProperty('emailStatusIcon');
      expect(result.requests[0]).toHaveProperty('canManualEmailBeSent');
    });

    it('should handle pagination options', async () => {
      TimeOffRequest.findAllByUser.mockResolvedValue([]);

      await requestService.getUserRequests('user123', {
        limit: 10,
        offset: 5,
      });

      expect(TimeOffRequest.findAllByUser).toHaveBeenCalledWith('user123', {
        include: [
          {
            model: User,
            attributes: ['name', 'code', 'emailPreference'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit: 10,
        offset: 5,
      });
    });

    it('should handle status filter', async () => {
      TimeOffRequest.findAllByUser.mockResolvedValue([]);

      await requestService.getUserRequests('user123', {
        status: 'approved',
      });

      expect(TimeOffRequest.findAllByUser).toHaveBeenCalledWith('user123', {
        include: [
          {
            model: User,
            attributes: ['name', 'code', 'emailPreference'],
          },
        ],
        order: [['createdAt', 'DESC']],
        where: { status: 'APPROVED' },
      });
    });

    it('should handle combined filters', async () => {
      TimeOffRequest.findAllByUser.mockResolvedValue([]);

      await requestService.getUserRequests('user123', {
        status: 'pending',
        limit: 5,
        offset: 10,
      });

      expect(TimeOffRequest.findAllByUser).toHaveBeenCalledWith('user123', {
        include: [
          {
            model: User,
            attributes: ['name', 'code', 'emailPreference'],
          },
        ],
        order: [['createdAt', 'DESC']],
        where: { status: 'PENDING' },
        limit: 5,
        offset: 10,
      });
    });

    it('should handle database errors', async () => {
      TimeOffRequest.findAllByUser.mockRejectedValue(new Error('Database error'));

      await expect(
        requestService.getUserRequests('user123')
      ).rejects.toThrow('Database error');
    });
  });

  describe('updateRequest', () => {
    const mockRequest = {
      id: 1,
      userId: 'user123',
      type: 'REQ_DO',
      status: 'PENDING',
      isEditable: jest.fn().mockReturnValue(true),
      update: jest.fn().mockResolvedValue(),
    };

    beforeEach(() => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);
      jest.spyOn(requestService, 'canRequestBeEdited').mockReturnValue(true);
    });

    it('should update request successfully', async () => {
      const updates = {
        customMessage: 'Updated message',
        type: 'PM_OFF',
      };

      const result = await requestService.updateRequest(1, 'user123', updates);

      expect(result).toEqual({
        request: mockRequest,
        message: 'Time-off request updated successfully',
      });
      expect(mockRequest.update).toHaveBeenCalledWith(updates);
    });

    it('should handle status updates', async () => {
      const updates = {
        status: 'APPROVED',
      };

      await requestService.updateRequest(1, 'user123', updates);

      expect(mockRequest.update).toHaveBeenCalledWith({
        status: 'APPROVED',
        approvalDate: expect.any(Date),
      });
    });

    it('should handle undefined fields', async () => {
      const updates = {
        flightNumber: undefined,
        customMessage: undefined,
      };

      await requestService.updateRequest(1, 'user123', updates);

      expect(mockRequest.update).toHaveBeenCalledWith({
        flightNumber: undefined,
        customMessage: undefined,
      });
    });

    it('should reject updates to non-editable requests', async () => {
      jest.spyOn(requestService, 'canRequestBeEdited').mockReturnValue(false);

      await expect(
        requestService.updateRequest(1, 'user123', { customMessage: 'test' })
      ).rejects.toThrow('Request cannot be edited');

      const error = await requestService.updateRequest(1, 'user123', {}).catch(e => e);
      expect(error.statusCode).toBe(403);
    });

    it('should handle request not found', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      await expect(
        requestService.updateRequest(999, 'user123', {})
      ).rejects.toThrow('Request not found');
    });

    it('should handle database errors', async () => {
      mockRequest.update.mockRejectedValue(new Error('Database error'));

      await expect(
        requestService.updateRequest(1, 'user123', { customMessage: 'test' })
      ).rejects.toThrow('Database error');
    });
  });

  describe('deleteRequest', () => {
    const mockRequest = {
      id: 1,
      userId: 'user123',
      canBeDeleted: jest.fn().mockReturnValue(true),
      destroy: jest.fn().mockResolvedValue(),
    };

    beforeEach(() => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(mockRequest);
      jest.spyOn(requestService, 'canRequestBeDeleted').mockReturnValue(true);
    });

    it('should delete request successfully', async () => {
      const result = await requestService.deleteRequest(1, 'user123');

      expect(result).toEqual({
        id: 1,
        message: 'Request deleted successfully',
      });
      expect(mockRequest.destroy).toHaveBeenCalled();
    });

    it('should validate request ID', async () => {
      await expect(
        requestService.deleteRequest('invalid', 'user123')
      ).rejects.toThrow('Invalid request ID');

      const error = await requestService.deleteRequest('invalid', 'user123').catch(e => e);
      expect(error.statusCode).toBe(400);
    });

    it('should reject deletion of non-deletable requests', async () => {
      jest.spyOn(requestService, 'canRequestBeDeleted').mockReturnValue(false);

      await expect(
        requestService.deleteRequest(1, 'user123')
      ).rejects.toThrow('Cannot delete request: email has already been sent');

      const error = await requestService.deleteRequest(1, 'user123').catch(e => e);
      expect(error.statusCode).toBe(403);
    });

    it('should handle request not found', async () => {
      TimeOffRequest.findByPkAndUser.mockResolvedValue(null);

      await expect(
        requestService.deleteRequest(1, 'user123')
      ).rejects.toThrow('Request not found');
    });

    it('should handle database errors', async () => {
      mockRequest.destroy.mockRejectedValue(new Error('Database error'));

      await expect(
        requestService.deleteRequest(1, 'user123')
      ).rejects.toThrow('Database error');
    });
  });

  describe('checkDateConflicts', () => {
    const mockConflicts = [
      {
        id: 1,
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'REQ_DO',
      },
    ];

    it('should return conflicts when found', async () => {
      TimeOffRequest.getConflictsForUser.mockResolvedValue(mockConflicts);

      const result = await requestService.checkDateConflicts(
        'user123',
        '2024-02-01',
        '2024-02-01'
      );

      expect(result).toEqual({
        conflicts: mockConflicts,
        hasConflicts: true,
      });
      expect(TimeOffRequest.getConflictsForUser).toHaveBeenCalledWith(
        'user123',
        '2024-02-01',
        '2024-02-01',
        undefined
      );
    });

    it('should return no conflicts when none found', async () => {
      TimeOffRequest.getConflictsForUser.mockResolvedValue([]);

      const result = await requestService.checkDateConflicts(
        'user123',
        '2024-02-01',
        '2024-02-01'
      );

      expect(result).toEqual({
        conflicts: [],
        hasConflicts: false,
      });
    });

    it('should handle exclude group ID', async () => {
      TimeOffRequest.getConflictsForUser.mockResolvedValue([]);

      await requestService.checkDateConflicts(
        'user123',
        '2024-02-01',
        '2024-02-01',
        'group123'
      );

      expect(TimeOffRequest.getConflictsForUser).toHaveBeenCalledWith(
        'user123',
        '2024-02-01',
        '2024-02-01',
        'group123'
      );
    });

    it('should validate required dates', async () => {
      await expect(
        requestService.checkDateConflicts('user123', null, '2024-02-01')
      ).rejects.toThrow('startDate and endDate are required');

      await expect(
        requestService.checkDateConflicts('user123', '2024-02-01', null)
      ).rejects.toThrow('startDate and endDate are required');

      const error = await requestService.checkDateConflicts('user123', null, null).catch(e => e);
      expect(error.statusCode).toBe(400);
    });

    it('should handle database errors', async () => {
      TimeOffRequest.getConflictsForUser.mockRejectedValue(new Error('Database error'));

      await expect(
        requestService.checkDateConflicts('user123', '2024-02-01', '2024-02-01')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getRequestStatistics', () => {
    const mockStats = {
      total: 10,
      pending: 3,
      approved: 5,
      denied: 2,
    };

    it('should return statistics', async () => {
      TimeOffRequest.getStatusCountsForUser.mockResolvedValue(mockStats);

      const result = await requestService.getRequestStatistics('user123');

      expect(result).toBe(mockStats);
      expect(TimeOffRequest.getStatusCountsForUser).toHaveBeenCalledWith('user123');
    });

    it('should handle database errors', async () => {
      TimeOffRequest.getStatusCountsForUser.mockRejectedValue(new Error('Database error'));

      await expect(
        requestService.getRequestStatistics('user123')
      ).rejects.toThrow('Database error');
    });
  });

  describe('enhanceRequestWithEmailStatus', () => {
    it('should enhance request with email status info', () => {
      const mockRequest = {
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          type: 'REQ_DO',
          status: 'PENDING',
        }),
        getEmailStatus: jest.fn().mockReturnValue({ status: 'sent' }),
        getEmailStatusIcon: jest.fn().mockReturnValue('✅'),
        getEmailStatusLabel: jest.fn().mockReturnValue('Email sent'),
        canManualEmailBeSent: jest.fn().mockReturnValue(true),
        isEmailSent: jest.fn().mockReturnValue(true),
        hasReply: jest.fn().mockReturnValue(false),
      };

      const result = requestService.enhanceRequestWithEmailStatus(mockRequest);

      expect(result).toEqual({
        id: 1,
        type: 'REQ_DO',
        status: 'PENDING',
        emailStatus: { status: 'sent' },
        emailStatusIcon: '✅',
        emailStatusLabel: 'Email sent',
        canManualEmailBeSent: true,
        isEmailSent: true,
        hasReply: false,
      });

      expect(mockRequest.toJSON).toHaveBeenCalled();
      expect(mockRequest.getEmailStatus).toHaveBeenCalled();
      expect(mockRequest.getEmailStatusIcon).toHaveBeenCalled();
      expect(mockRequest.getEmailStatusLabel).toHaveBeenCalled();
      expect(mockRequest.canManualEmailBeSent).toHaveBeenCalled();
      expect(mockRequest.isEmailSent).toHaveBeenCalled();
      expect(mockRequest.hasReply).toHaveBeenCalled();
    });
  });

  describe('canRequestBeDeleted', () => {
    it('should delegate to request canBeDeleted method', () => {
      const mockRequest = {
        canBeDeleted: jest.fn().mockReturnValue(true),
      };

      const result = requestService.canRequestBeDeleted(mockRequest);

      expect(result).toBe(true);
      expect(mockRequest.canBeDeleted).toHaveBeenCalled();
    });
  });

  describe('canRequestBeEdited', () => {
    it('should delegate to request isEditable method', () => {
      const mockRequest = {
        isEditable: jest.fn().mockReturnValue(false),
      };

      const result = requestService.canRequestBeEdited(mockRequest);

      expect(result).toBe(false);
      expect(mockRequest.isEditable).toHaveBeenCalled();
    });
  });

  describe('isRequestEmailSent', () => {
    it('should delegate to request isEmailSent method', () => {
      const mockRequest = {
        isEmailSent: jest.fn().mockReturnValue(true),
      };

      const result = requestService.isRequestEmailSent(mockRequest);

      expect(result).toBe(true);
      expect(mockRequest.isEmailSent).toHaveBeenCalled();
    });
  });

  describe('validateRequestData', () => {
    it('should validate complete valid data', () => {
      const validData = {
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'REQ_DO',
        customMessage: 'Please approve',
      };

      const result = requestService.validateRequestData(validData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const invalidData = {
        customMessage: 'Missing fields',
      };

      const result = requestService.validateRequestData(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual([
        { field: 'startDate', message: 'Start date is required' },
        { field: 'endDate', message: 'End date is required' },
        { field: 'type', message: 'Request type is required' },
      ]);
    });

    it('should validate flight requests require flight number', () => {
      const flightData = {
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'FLIGHT',
        // Missing flight number
      };

      const result = requestService.validateRequestData(flightData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'flightNumber',
        message: 'Flight number is required for flight requests',
      });
    });

    it('should validate flight requests with flight number', () => {
      const validFlightData = {
        startDate: '2024-02-01',
        endDate: '2024-02-01',
        type: 'FLIGHT',
        flightNumber: 'TU123',
      };

      const result = requestService.validateRequestData(validFlightData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty data', () => {
      const result = requestService.validateRequestData({});

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3); // startDate, endDate, type
    });
  });
});