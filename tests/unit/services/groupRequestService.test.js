// tests/unit/services/groupRequestService.test.js - Tests for GroupRequestService
const GroupRequestService = require('../../../src/services/groupRequestService');
const { TimeOffRequest } = require('../../../src/models');
const { v4: uuidv4 } = require('uuid');

// Mock dependencies
jest.mock('../../../src/models');
jest.mock('uuid');
jest.mock('../../../src/utils/logger', () => ({
  serviceLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    logError: jest.fn()
  }
}));

describe('GroupRequestService', () => {
  let groupRequestService;
  let mockRequestService;
  let mockEmailService;
  let mockUser;
  let mockDatesArray;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock services
    mockRequestService = {
      getRequestById: jest.fn()
    };

    mockEmailService = {
      handleEmailWorkflow: jest.fn()
    };

    // Mock user
    mockUser = {
      id: 1,
      email: 'test@tuifly.com',
      emailPreference: 'automatic'
    };

    // Mock dates array
    mockDatesArray = [
      { date: new Date('2024-02-01'), type: 'REQ_DO' },
      { date: new Date('2024-02-02'), type: 'PM_OFF' }
    ];

    // Mock UUID
    uuidv4.mockReturnValue('mock-group-id');

    groupRequestService = new GroupRequestService(mockRequestService, mockEmailService);
  });

  describe('Constructor', () => {
    it('should initialize with provided services', () => {
      expect(groupRequestService.requestService).toBe(mockRequestService);
      expect(groupRequestService.emailService).toBe(mockEmailService);
    });
  });

  describe('createGroupRequest', () => {
    let mockCreatedRequests;

    beforeEach(() => {
      mockCreatedRequests = [
        { id: 1, toJSON: jest.fn().mockReturnValue({ id: 1, type: 'REQ_DO' }) },
        { id: 2, toJSON: jest.fn().mockReturnValue({ id: 2, type: 'PM_OFF' }) }
      ];

      TimeOffRequest.create = jest.fn()
        .mockResolvedValueOnce(mockCreatedRequests[0])
        .mockResolvedValueOnce(mockCreatedRequests[1]);

      mockEmailService.handleEmailWorkflow.mockResolvedValue({
        sent: true,
        messageId: 'msg123',
        message: 'Email sent successfully'
      });

      jest.spyOn(groupRequestService, 'validateGroupDates').mockReturnValue({ 
        isValid: true, 
        errors: [] 
      });
    });

    it('should create group request successfully', async () => {
      const result = await groupRequestService.createGroupRequest(
        mockUser.id,
        mockDatesArray,
        'Test message',
        mockUser
      );

      expect(groupRequestService.validateGroupDates).toHaveBeenCalledWith(mockDatesArray);
      expect(uuidv4).toHaveBeenCalled();
      expect(TimeOffRequest.create).toHaveBeenCalledTimes(2);
      expect(mockEmailService.handleEmailWorkflow).toHaveBeenCalledWith(
        mockUser,
        mockCreatedRequests,
        'automatic'
      );

      expect(result).toEqual({
        requests: [
          { id: 1, type: 'REQ_DO' },
          { id: 2, type: 'PM_OFF' }
        ],
        groupId: 'mock-group-id',
        emailMode: 'automatic',
        totalDates: 2,
        emailSent: true,
        emailError: null,
        messageId: 'msg123',
        message: 'Email sent successfully'
      });
    });

    it('should handle flight requests with flight numbers', async () => {
      const flightDates = [
        { date: new Date('2024-02-01'), type: 'FLIGHT', flightNumber: 'TUI123' }
      ];

      await groupRequestService.createGroupRequest(
        mockUser.id,
        flightDates,
        'Flight request',
        mockUser
      );

      expect(TimeOffRequest.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        groupId: 'mock-group-id',
        startDate: flightDates[0].date,
        endDate: flightDates[0].date,
        type: 'FLIGHT',
        flightNumber: 'TUI123',
        customMessage: 'Flight request',
        emailMode: 'automatic'
      });
    });

    it('should throw error for invalid dates array', async () => {
      await expect(groupRequestService.createGroupRequest(
        mockUser.id,
        null,
        'Test message',
        mockUser
      )).rejects.toThrow('Invalid dates array');

      await expect(groupRequestService.createGroupRequest(
        mockUser.id,
        [],
        'Test message',
        mockUser
      )).rejects.toThrow('Invalid dates array');
    });

    it('should throw error for invalid group dates', async () => {
      jest.spyOn(groupRequestService, 'validateGroupDates').mockReturnValue({
        isValid: false,
        errors: ['Invalid date format']
      });

      await expect(groupRequestService.createGroupRequest(
        mockUser.id,
        mockDatesArray,
        'Test message',
        mockUser
      )).rejects.toThrow('Invalid group dates');
    });

    it('should handle email workflow errors', async () => {
      mockEmailService.handleEmailWorkflow.mockResolvedValue({
        sent: false,
        error: 'SMTP connection failed',
        message: 'Email failed to send'
      });

      const result = await groupRequestService.createGroupRequest(
        mockUser.id,
        mockDatesArray,
        'Test message',
        mockUser
      );

      expect(result.emailSent).toBe(false);
      expect(result.emailError).toBe('SMTP connection failed');
    });
  });

  describe('getGroupRequests', () => {
    it('should return group requests successfully', async () => {
      const mockRequests = [
        { id: 1, groupId: 'group123' },
        { id: 2, groupId: 'group123' }
      ];

      TimeOffRequest.getByGroupIdAndUser = jest.fn().mockResolvedValue(mockRequests);

      const result = await groupRequestService.getGroupRequests('group123', mockUser.id);

      expect(TimeOffRequest.getByGroupIdAndUser).toHaveBeenCalledWith('group123', mockUser.id);
      expect(result).toEqual({
        requests: mockRequests,
        count: 2
      });
    });

    it('should throw error if group not found', async () => {
      TimeOffRequest.getByGroupIdAndUser = jest.fn().mockResolvedValue([]);

      await expect(groupRequestService.getGroupRequests('group123', mockUser.id))
        .rejects.toThrow('Group not found');
    });
  });

  describe('deleteGroupRequest', () => {
    let mockRequest;
    let mockGroupRequests;

    beforeEach(() => {
      mockRequest = {
        id: 1,
        groupId: 'group123',
        emailSent: false,
        manualEmailConfirmed: false
      };

      mockGroupRequests = [
        { ...mockRequest, destroy: jest.fn() },
        { id: 2, groupId: 'group123', emailSent: false, manualEmailConfirmed: false, destroy: jest.fn() }
      ];

      mockRequestService.getRequestById.mockResolvedValue(mockRequest);
      TimeOffRequest.getByGroupIdAndUser = jest.fn().mockResolvedValue(mockGroupRequests);
    });

    it('should delete group request successfully', async () => {
      jest.spyOn(groupRequestService, 'canGroupBeDeleted').mockReturnValue({ 
        canDelete: true,
        blockedCount: 0
      });

      const result = await groupRequestService.deleteGroupRequest(1, mockUser.id);

      expect(mockGroupRequests[0].destroy).toHaveBeenCalled();
      expect(mockGroupRequests[1].destroy).toHaveBeenCalled();

      expect(result).toEqual({
        deletedCount: 2,
        groupId: 'group123',
        deletedRequestIds: [1, 2],
        message: 'Group request deleted successfully'
      });
    });

    it('should throw error if not a group request', async () => {
      mockRequest.groupId = null;

      await expect(groupRequestService.deleteGroupRequest(1, mockUser.id))
        .rejects.toThrow('This is not a group request');
    });

    it('should throw error if group cannot be deleted', async () => {
      jest.spyOn(groupRequestService, 'canGroupBeDeleted').mockReturnValue({
        canDelete: false,
        blockedCount: 1
      });

      await expect(groupRequestService.deleteGroupRequest(1, mockUser.id))
        .rejects.toThrow('Cannot delete group: some requests have emails already sent');
    });
  });

  describe('getGroupDetails', () => {
    it('should return group details for group request', async () => {
      const mockRequest = {
        id: 1,
        groupId: 'group123',
        toJSON: jest.fn().mockReturnValue({ id: 1 })
      };

      const mockGroupRequests = [
        { id: 1, startDate: new Date('2024-02-02'), toJSON: jest.fn().mockReturnValue({ id: 1 }) },
        { id: 2, startDate: new Date('2024-02-01'), toJSON: jest.fn().mockReturnValue({ id: 2 }) }
      ];

      mockRequestService.getRequestById.mockResolvedValue(mockRequest);
      TimeOffRequest.getByGroupIdAndUser = jest.fn().mockResolvedValue(mockGroupRequests);
      jest.spyOn(groupRequestService, 'calculateStatusSummary').mockReturnValue({
        pending: 2,
        approved: 0,
        denied: 0
      });

      const result = await groupRequestService.getGroupDetails(1, mockUser.id);

      expect(result).toEqual({
        groupId: 'group123',
        requests: [{ id: 2 }, { id: 1 }], // Sorted by date
        totalRequests: 2,
        statusSummary: { pending: 2, approved: 0, denied: 0 }
      });
    });

    it('should return single request details for non-group request', async () => {
      const mockRequest = {
        id: 1,
        groupId: null,
        toJSON: jest.fn().mockReturnValue({ id: 1 })
      };

      mockRequestService.getRequestById.mockResolvedValue(mockRequest);
      jest.spyOn(groupRequestService, 'calculateStatusSummary').mockReturnValue({
        pending: 1,
        approved: 0,
        denied: 0
      });

      const result = await groupRequestService.getGroupDetails(1, mockUser.id);

      expect(result).toEqual({
        groupId: null,
        requests: [{ id: 1 }],
        totalRequests: 1,
        statusSummary: { pending: 1, approved: 0, denied: 0 }
      });
    });
  });

  describe('createManualGroupRequest', () => {
    beforeEach(() => {
      mockUser.emailPreference = 'manual';
      jest.spyOn(groupRequestService, 'validateGroupDates').mockReturnValue({ 
        isValid: true, 
        errors: [] 
      });
    });

    it('should create manual group request successfully', async () => {
      const mockCreatedRequests = [
        { id: 1, toJSON: jest.fn().mockReturnValue({ id: 1 }) },
        { id: 2, toJSON: jest.fn().mockReturnValue({ id: 2 }) }
      ];

      TimeOffRequest.create = jest.fn()
        .mockResolvedValueOnce(mockCreatedRequests[0])
        .mockResolvedValueOnce(mockCreatedRequests[1]);

      const result = await groupRequestService.createManualGroupRequest(
        mockUser.id,
        mockDatesArray,
        'Manual test',
        mockUser
      );

      expect(TimeOffRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          emailMode: 'manual',
          manualEmailConfirmed: true,
          manualEmailConfirmedAt: expect.any(Date)
        })
      );

      expect(result).toEqual({
        groupId: 'mock-group-id',
        requestCount: 2,
        requests: [{ id: 1 }, { id: 2 }],
        message: 'Group request created successfully with 2 date(s). Email marked as sent.'
      });
    });

    it('should throw error if user not in manual mode', async () => {
      mockUser.emailPreference = 'automatic';

      await expect(groupRequestService.createManualGroupRequest(
        mockUser.id,
        mockDatesArray,
        'Test',
        mockUser
      )).rejects.toThrow('Manual request creation only available for users in manual email mode');
    });
  });

  describe('generateGroupId', () => {
    it('should generate unique group ID', () => {
      const result = groupRequestService.generateGroupId();
      expect(uuidv4).toHaveBeenCalled();
      expect(result).toBe('mock-group-id');
    });
  });

  describe('validateGroupDates', () => {
    it('should validate correct dates array', () => {
      const result = groupRequestService.validateGroupDates(mockDatesArray);

      expect(result).toEqual({
        isValid: true,
        errors: []
      });
    });

    it('should reject non-array input', () => {
      const result = groupRequestService.validateGroupDates('not-array');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Dates must be an array');
    });

    it('should reject empty array', () => {
      const result = groupRequestService.validateGroupDates([]);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one date is required');
    });

    it('should enforce maximum days limit', () => {
      process.env.MAX_DAYS_PER_REQUEST = '2';
      const largeDatesArray = [
        { date: new Date(), type: 'REQ_DO' },
        { date: new Date(), type: 'REQ_DO' },
        { date: new Date(), type: 'REQ_DO' }
      ];

      const result = groupRequestService.validateGroupDates(largeDatesArray);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Maximum 2 dates allowed per request');
    });

    it('should validate individual date objects', () => {
      const invalidDates = [
        { type: 'REQ_DO' }, // Missing date
        { date: new Date() }, // Missing type
        { date: new Date(), type: 'INVALID_TYPE' }, // Invalid type
        { date: new Date(), type: 'FLIGHT' } // Missing flight number
      ];

      const result = groupRequestService.validateGroupDates(invalidDates);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Date is required for item 1');
      expect(result.errors).toContain('Type is required for item 2');
      expect(result.errors).toContain('Invalid type for item 3. Must be one of: REQ_DO, PM_OFF, AM_OFF, FLIGHT');
      expect(result.errors).toContain('Flight number is required for flight requests (item 4)');
    });

    it('should accept valid flight request', () => {
      const flightDates = [
        { date: new Date(), type: 'FLIGHT', flightNumber: 'TUI123' }
      ];

      const result = groupRequestService.validateGroupDates(flightDates);

      expect(result.isValid).toBe(true);
    });
  });

  describe('canGroupBeDeleted', () => {
    it('should allow deletion when no emails sent', () => {
      const requests = [
        { id: 1, emailSent: false, manualEmailConfirmed: false },
        { id: 2, emailSent: false, manualEmailConfirmed: false }
      ];

      const result = groupRequestService.canGroupBeDeleted(requests);

      expect(result).toEqual({
        canDelete: true,
        blockedCount: 0,
        totalCount: 2,
        blockedRequests: []
      });
    });

    it('should block deletion when automatic emails sent', () => {
      const requests = [
        { id: 1, emailSent: true, manualEmailConfirmed: false },
        { id: 2, emailSent: false, manualEmailConfirmed: false }
      ];

      const result = groupRequestService.canGroupBeDeleted(requests);

      expect(result).toEqual({
        canDelete: false,
        blockedCount: 1,
        totalCount: 2,
        blockedRequests: [
          { id: 1, reason: 'automatic_email_sent' }
        ]
      });
    });

    it('should block deletion when manual emails confirmed', () => {
      const requests = [
        { id: 1, emailSent: false, manualEmailConfirmed: true },
        { id: 2, emailSent: false, manualEmailConfirmed: false }
      ];

      const result = groupRequestService.canGroupBeDeleted(requests);

      expect(result).toEqual({
        canDelete: false,
        blockedCount: 1,
        totalCount: 2,
        blockedRequests: [
          { id: 1, reason: 'manual_email_confirmed' }
        ]
      });
    });
  });

  describe('calculateStatusSummary', () => {
    it('should calculate status summary correctly', () => {
      const requests = [
        { status: 'PENDING' },
        { status: 'PENDING' },
        { status: 'APPROVED' },
        { status: 'DENIED' }
      ];

      const result = groupRequestService.calculateStatusSummary(requests);

      expect(result).toEqual({
        pending: 2,
        approved: 1,
        denied: 1
      });
    });
  });

  describe('calculateGroupEmailStatus', () => {
    it('should detect all emails sent', () => {
      const requests = [
        { getEmailStatus: jest.fn().mockReturnValue('sent') },
        { getEmailStatus: jest.fn().mockReturnValue('confirmed') }
      ];

      const result = groupRequestService.calculateGroupEmailStatus(requests);

      expect(result).toEqual({
        allSent: true,
        noneSent: false,
        partialSent: false,
        sentCount: 2,
        totalCount: 2
      });
    });

    it('should detect no emails sent', () => {
      const requests = [
        { getEmailStatus: jest.fn().mockReturnValue('pending') },
        { getEmailStatus: jest.fn().mockReturnValue('failed') }
      ];

      const result = groupRequestService.calculateGroupEmailStatus(requests);

      expect(result).toEqual({
        allSent: false,
        noneSent: true,
        partialSent: false,
        sentCount: 0,
        totalCount: 2
      });
    });

    it('should detect partial emails sent', () => {
      const requests = [
        { getEmailStatus: jest.fn().mockReturnValue('sent') },
        { getEmailStatus: jest.fn().mockReturnValue('pending') }
      ];

      const result = groupRequestService.calculateGroupEmailStatus(requests);

      expect(result).toEqual({
        allSent: false,
        noneSent: false,
        partialSent: true,
        sentCount: 1,
        totalCount: 2
      });
    });
  });

  describe('validateConsecutiveDates', () => {
    it('should return true for single date', () => {
      const result = groupRequestService.validateConsecutiveDates(['2024-02-01']);

      expect(result).toEqual({ isConsecutive: true });
    });

    it('should return true for consecutive dates', () => {
      const dates = ['2024-02-01', '2024-02-02', '2024-02-03'];

      const result = groupRequestService.validateConsecutiveDates(dates);

      expect(result).toEqual({ isConsecutive: true });
    });

    it('should detect non-consecutive dates', () => {
      const dates = ['2024-02-01', '2024-02-03']; // Missing 02-02

      const result = groupRequestService.validateConsecutiveDates(dates);

      expect(result.isConsecutive).toBe(false);
      expect(result.gap).toContain('2 days between');
    });

    it('should handle unsorted dates', () => {
      const dates = ['2024-02-03', '2024-02-01', '2024-02-02'];

      const result = groupRequestService.validateConsecutiveDates(dates);

      expect(result).toEqual({ isConsecutive: true });
    });
  });
});