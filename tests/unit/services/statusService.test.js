// tests/unit/services/statusService.test.js - Tests for StatusService
const StatusService = require('../../../src/services/statusService');
const { TimeOffRequest } = require('../../../src/models');

// Mock dependencies
jest.mock('../../../src/models');

describe('StatusService', () => {
  let statusService;
  let mockRequestService;
  let mockEmailService;
  let mockRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock services
    mockRequestService = {
      getRequestById: jest.fn()
    };

    mockEmailService = {
      checkEmailPrerequisites: jest.fn()
    };

    // Mock request
    mockRequest = {
      id: 1,
      userId: 123,
      groupId: null,
      status: 'PENDING',
      emailSent: true,
      manualEmailConfirmed: false,
      emailMode: 'automatic',
      update: jest.fn(),
      createdAt: new Date('2024-01-01'),
      statusUpdatedAt: null,
      statusUpdateMethod: null,
      approvalDate: null
    };

    statusService = new StatusService(mockRequestService, mockEmailService);
  });

  describe('Constructor', () => {
    it('should initialize with provided services', () => {
      expect(statusService.requestService).toBe(mockRequestService);
      expect(statusService.emailService).toBe(mockEmailService);
    });
  });

  describe('updateRequestStatus', () => {
    beforeEach(() => {
      mockRequestService.getRequestById.mockResolvedValue(mockRequest);
      jest.spyOn(statusService, 'canStatusBeUpdated').mockReturnValue(true);
      jest.spyOn(statusService, 'getRequestsToUpdate').mockResolvedValue([mockRequest]);
    });

    it('should update status successfully', async () => {
      const result = await statusService.updateRequestStatus(1, 123, 'APPROVED');

      expect(mockRequestService.getRequestById).toHaveBeenCalledWith(1, 123);
      expect(mockRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'APPROVED',
          statusUpdateMethod: 'manual_user_update',
          statusUpdatedAt: expect.any(Date),
          approvalDate: expect.any(Date)
        })
      );

      expect(result).toEqual({
        updatedCount: 1,
        status: 'APPROVED',
        statusUpdatedAt: expect.any(Date),
        isGroup: false,
        groupId: null,
        method: 'manual_user_update',
        updateGroup: false,
        message: 'Request marked as approved successfully'
      });
    });

    it('should update multiple requests for group', async () => {
      const groupRequests = [mockRequest, { ...mockRequest, id: 2, update: jest.fn() }];
      jest.spyOn(statusService, 'getRequestsToUpdate').mockResolvedValue(groupRequests);

      const result = await statusService.updateRequestStatus(1, 123, 'DENIED', { updateGroup: true });

      expect(groupRequests[0].update).toHaveBeenCalled();
      expect(groupRequests[1].update).toHaveBeenCalled();
      expect(result.updatedCount).toBe(2);
      expect(result.message).toBe('Requests marked as denied successfully');
    });

    it('should throw error for invalid status', async () => {
      await expect(statusService.updateRequestStatus(1, 123, 'INVALID'))
        .rejects.toThrow('Invalid status');
    });

    it('should throw error when status cannot be updated', async () => {
      jest.spyOn(statusService, 'canStatusBeUpdated').mockReturnValue(false);

      await expect(statusService.updateRequestStatus(1, 123, 'APPROVED'))
        .rejects.toThrow('Cannot update status before email is sent');
    });

    it('should set denial date for DENIED status', async () => {
      await statusService.updateRequestStatus(1, 123, 'DENIED');

      expect(mockRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DENIED',
          approvalDate: null
        })
      );
    });

    it('should reset dates for PENDING status', async () => {
      await statusService.updateRequestStatus(1, 123, 'PENDING');

      expect(mockRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING',
          approvalDate: null,
          denialReason: null
        })
      );
    });
  });

  describe('updateGroupStatus', () => {
    beforeEach(() => {
      const groupRequests = [
        { ...mockRequest, update: jest.fn() },
        { ...mockRequest, id: 2, update: jest.fn() }
      ];
      TimeOffRequest.getByGroupIdAndUser = jest.fn().mockResolvedValue(groupRequests);
      jest.spyOn(statusService, 'canStatusBeUpdated').mockReturnValue(true);
    });

    it('should update all requests in group', async () => {
      const result = await statusService.updateGroupStatus('group123', 123, 'APPROVED');

      expect(TimeOffRequest.getByGroupIdAndUser).toHaveBeenCalledWith('group123', 123);
      expect(result).toEqual({
        updatedCount: 2,
        status: 'APPROVED',
        statusUpdatedAt: expect.any(Date),
        groupId: 'group123',
        method: 'manual_user_update',
        message: 'All 2 requests in group marked as approved successfully'
      });
    });

    it('should throw error if no requests found', async () => {
      TimeOffRequest.getByGroupIdAndUser.mockResolvedValue([]);

      await expect(statusService.updateGroupStatus('group123', 123, 'APPROVED'))
        .rejects.toThrow('No requests found in this group');
    });

    it('should throw error if any request cannot be updated', async () => {
      const groupRequests = [
        { ...mockRequest, emailSent: true },
        { ...mockRequest, id: 2, emailSent: false }
      ];
      TimeOffRequest.getByGroupIdAndUser.mockResolvedValue(groupRequests);
      jest.spyOn(statusService, 'canStatusBeUpdated')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      await expect(statusService.updateGroupStatus('group123', 123, 'APPROVED'))
        .rejects.toThrow('Cannot update group status: some requests have not sent emails yet');
    });
  });

  describe('validateStatusUpdate', () => {
    it('should return valid for proper status update', () => {
      jest.spyOn(statusService, 'canStatusBeUpdated').mockReturnValue(true);

      const result = statusService.validateStatusUpdate(mockRequest, 'APPROVED');

      expect(result).toEqual({
        isValid: true,
        issues: []
      });
    });

    it('should detect invalid status', () => {
      const result = statusService.validateStatusUpdate(mockRequest, 'INVALID');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Invalid status value');
    });

    it('should detect when request cannot be updated', () => {
      jest.spyOn(statusService, 'canStatusBeUpdated').mockReturnValue(false);

      const result = statusService.validateStatusUpdate(mockRequest, 'APPROVED');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Email must be sent before status can be updated');
    });

    it('should detect same status', () => {
      mockRequest.status = 'APPROVED';

      const result = statusService.validateStatusUpdate(mockRequest, 'APPROVED');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Request is already approved');
    });
  });

  describe('canStatusBeUpdated', () => {
    it('should return true when email prerequisites are met', () => {
      jest.spyOn(statusService, 'checkEmailPrerequisites').mockReturnValue(true);

      const result = statusService.canStatusBeUpdated(mockRequest);

      expect(result).toBe(true);
      expect(statusService.checkEmailPrerequisites).toHaveBeenCalledWith(mockRequest);
    });

    it('should return false when email prerequisites are not met', () => {
      jest.spyOn(statusService, 'checkEmailPrerequisites').mockReturnValue(false);

      const result = statusService.canStatusBeUpdated(mockRequest);

      expect(result).toBe(false);
    });
  });

  describe('checkEmailPrerequisites', () => {
    it('should return true for automatic mode with email sent', () => {
      mockRequest.emailMode = 'automatic';
      mockRequest.emailSent = true;

      const result = statusService.checkEmailPrerequisites(mockRequest);

      expect(result).toBe(true);
    });

    it('should return true for manual mode with email confirmed', () => {
      mockRequest.emailMode = 'manual';
      mockRequest.emailSent = false;
      mockRequest.manualEmailConfirmed = true;

      const result = statusService.checkEmailPrerequisites(mockRequest);

      expect(result).toBe(true);
    });

    it('should return false for automatic mode without email sent', () => {
      mockRequest.emailMode = 'automatic';
      mockRequest.emailSent = false;

      const result = statusService.checkEmailPrerequisites(mockRequest);

      expect(result).toBe(false);
    });

    it('should return false for manual mode without email confirmed', () => {
      mockRequest.emailMode = 'manual';
      mockRequest.manualEmailConfirmed = false;

      const result = statusService.checkEmailPrerequisites(mockRequest);

      expect(result).toBe(false);
    });

    it('should default to automatic mode when emailMode is null', () => {
      mockRequest.emailMode = null;
      mockRequest.emailSent = true;

      const result = statusService.checkEmailPrerequisites(mockRequest);

      expect(result).toBe(true);
    });
  });

  describe('getStatusUpdateData', () => {
    it('should return update data for APPROVED status', () => {
      const result = statusService.getStatusUpdateData('APPROVED', 'admin_update');

      expect(result).toEqual({
        status: 'APPROVED',
        statusUpdateMethod: 'admin_update',
        statusUpdatedAt: expect.any(Date),
        approvalDate: expect.any(Date),
        denialReason: null
      });
    });

    it('should return update data for DENIED status', () => {
      const result = statusService.getStatusUpdateData('DENIED');

      expect(result).toEqual({
        status: 'DENIED',
        statusUpdateMethod: 'manual_user_update',
        statusUpdatedAt: expect.any(Date),
        approvalDate: null
      });
    });

    it('should return update data for PENDING status', () => {
      const result = statusService.getStatusUpdateData('PENDING');

      expect(result).toEqual({
        status: 'PENDING',
        statusUpdateMethod: 'manual_user_update',
        statusUpdatedAt: expect.any(Date),
        approvalDate: null,
        denialReason: null
      });
    });
  });

  describe('getRequestsToUpdate', () => {
    it('should return single request when updateGroup is false', async () => {
      const result = await statusService.getRequestsToUpdate(mockRequest, false);

      expect(result).toEqual([mockRequest]);
    });

    it('should return single request when no groupId', async () => {
      mockRequest.groupId = null;

      const result = await statusService.getRequestsToUpdate(mockRequest, true);

      expect(result).toEqual([mockRequest]);
    });

    it('should return group requests when updateGroup is true and has groupId', async () => {
      mockRequest.groupId = 'group123';
      const groupRequests = [mockRequest, { id: 2 }];
      TimeOffRequest.getByGroupIdAndUser = jest.fn().mockResolvedValue(groupRequests);

      const result = await statusService.getRequestsToUpdate(mockRequest, true);

      expect(TimeOffRequest.getByGroupIdAndUser).toHaveBeenCalledWith('group123', mockRequest.userId);
      expect(result).toBe(groupRequests);
    });
  });

  describe('isValidStatus', () => {
    it('should return true for valid statuses', () => {
      expect(statusService.isValidStatus('APPROVED')).toBe(true);
      expect(statusService.isValidStatus('DENIED')).toBe(true);
      expect(statusService.isValidStatus('PENDING')).toBe(true);
    });

    it('should return false for invalid status', () => {
      expect(statusService.isValidStatus('INVALID')).toBe(false);
      expect(statusService.isValidStatus('approved')).toBe(false);
      expect(statusService.isValidStatus('')).toBe(false);
      expect(statusService.isValidStatus(null)).toBe(false);
    });
  });

  describe('getAvailableStatusTransitions', () => {
    it('should return available transitions excluding current status', () => {
      mockRequest.status = 'PENDING';

      const result = statusService.getAvailableStatusTransitions(mockRequest);

      expect(result).toEqual(['APPROVED', 'DENIED']);
      expect(result).not.toContain('PENDING');
    });

    it('should work for approved status', () => {
      mockRequest.status = 'APPROVED';

      const result = statusService.getAvailableStatusTransitions(mockRequest);

      expect(result).toEqual(['PENDING', 'DENIED']);
      expect(result).not.toContain('APPROVED');
    });
  });

  describe('getStatusHistory', () => {
    it('should return basic history for new request', () => {
      const result = statusService.getStatusHistory(mockRequest);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        status: 'PENDING',
        date: mockRequest.createdAt,
        method: 'system',
        description: 'Request created'
      });
    });

    it('should include status update in history', () => {
      mockRequest.status = 'APPROVED';
      mockRequest.statusUpdatedAt = new Date('2024-01-02');
      mockRequest.statusUpdateMethod = 'manual_user_update';

      const result = statusService.getStatusHistory(mockRequest);

      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({
        status: 'APPROVED',
        date: mockRequest.statusUpdatedAt,
        method: 'manual_user_update',
        description: 'Status changed to approved'
      });
    });

    it('should include approval date in history', () => {
      mockRequest.approvalDate = new Date('2024-01-03');
      mockRequest.statusUpdateMethod = 'admin_update';

      const result = statusService.getStatusHistory(mockRequest);

      expect(result).toContainEqual({
        status: 'APPROVED',
        date: mockRequest.approvalDate,
        method: 'admin_update',
        description: 'Request approved'
      });
    });

    it('should sort history by date', () => {
      mockRequest.statusUpdatedAt = new Date('2024-01-02');
      mockRequest.statusUpdateMethod = 'manual';
      mockRequest.approvalDate = new Date('2024-01-01T12:00:00'); // Earlier than createdAt

      const result = statusService.getStatusHistory(mockRequest);

      expect(result[0].date).toEqual(mockRequest.approvalDate);
      expect(result[1].date).toEqual(mockRequest.createdAt);
      expect(result[2].date).toEqual(mockRequest.statusUpdatedAt);
    });

    it('should handle missing statusUpdateMethod with default', () => {
      mockRequest.approvalDate = new Date('2024-01-02');
      mockRequest.statusUpdateMethod = null;

      const result = statusService.getStatusHistory(mockRequest);

      const approvalEntry = result.find(entry => entry.description === 'Request approved');
      expect(approvalEntry.method).toBe('manual');
    });
  });
});