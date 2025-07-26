// tests/unit/services/ReplyCheckingService.test.js
const ReplyCheckingService = require('../../../src/services/ReplyCheckingService');
const { EmailReply, TimeOffRequest, User, RosterSchedule } = require('../../../src/models');
const { GmailService } = require('../../../src/services/gmailService');
const { sequelize } = require('../../../config/database');

// Mock GmailService
jest.mock('../../../src/services/gmailService');

describe('ReplyCheckingService', () => {
  let testUser;
  let testRequest;
  let mockGmailService;

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    
    // Create test user
    testUser = await User.create({
      googleId: 'test_google_id',
      email: 'test@tuifly.com',
      name: 'Test User',
      code: 'TST',
      signature: 'Test User - TST',
      onboardedAt: new Date(),
      adminApproved: true,
      adminApprovedAt: new Date(),
      isAdmin: false,
      emailPreference: 'automatic',
      gmailScopeGranted: true
    });

    // Create roster schedule
    await RosterSchedule.create({
      startPeriod: '2024-01-01',
      endPeriod: '2024-01-31',
      requestDeadline: '2024-01-15',
      isActive: true
    });

    // Create test request
    testRequest = await TimeOffRequest.create({
      userId: testUser.id,
      startDate: '2024-01-15',
      endDate: '2024-01-15',
      type: 'REQ_DO',
      status: 'PENDING',
      emailMode: 'automatic',
      gmailThreadId: 'thread123',
      emailSent: new Date()
    });

    // Mock GmailService
    mockGmailService = {
      checkForReplies: jest.fn()
    };
    GmailService.mockImplementation(() => mockGmailService);
  });

  afterEach(async () => {
    await sequelize.drop();
    jest.clearAllMocks();
  });

  describe('checkUserReplies', () => {
    it('should process new replies successfully', async () => {
      // Mock Gmail service response
      mockGmailService.checkForReplies.mockResolvedValue({
        success: true,
        newMessages: [{
          id: 'msg123',
          from: 'manager@tuifly.com',
          body: 'Your request is approved.',
          receivedAt: new Date()
        }]
      });

      const result = await ReplyCheckingService.checkUserReplies(testUser);

      expect(result.success).toBe(true);
      expect(result.newReplies).toHaveLength(1);
      expect(result.updatedRequests).toHaveLength(1);

      // Verify reply was created
      const replies = await EmailReply.findAll();
      expect(replies).toHaveLength(1);
      expect(replies[0].gmailMessageId).toBe('msg123');

      // Verify request was updated
      await testRequest.reload();
      expect(testRequest.needsReview).toBe(true);
      expect(testRequest.replyCount).toBe(1);
    });

    it('should handle no new replies', async () => {
      mockGmailService.checkForReplies.mockResolvedValue({
        success: true,
        newMessages: []
      });

      const result = await ReplyCheckingService.checkUserReplies(testUser);

      expect(result.success).toBe(true);
      expect(result.newReplies).toHaveLength(0);
      expect(result.updatedRequests).toHaveLength(0);
    });

    it('should handle no requests needing check', async () => {
      // Update request to not need checking
      await testRequest.update({ 
        gmailThreadId: null 
      });

      const result = await ReplyCheckingService.checkUserReplies(testUser);

      expect(result.success).toBe(true);
      expect(result.newReplies).toHaveLength(0);
      expect(result.updatedRequests).toHaveLength(0);
    });
  });

  describe('processReply', () => {
    let testReply;

    beforeEach(async () => {
      testReply = await EmailReply.create({
        timeOffRequestId: testRequest.id,
        gmailMessageId: 'msg123',
        gmailThreadId: 'thread123',
        fromEmail: 'manager@tuifly.com',
        fromName: 'Manager',
        replyContent: 'Your request is approved.',
        replySnippet: 'Your request is approved.',
        receivedAt: new Date(),
        isProcessed: false
      });

      await testRequest.update({ needsReview: true });
    });

    it('should process reply and update request status', async () => {
      const result = await ReplyCheckingService.processReply(
        testReply.id,
        'APPROVED',
        testUser.id
      );

      expect(result.success).toBe(true);

      // Verify reply was marked as processed
      await testReply.reload();
      expect(testReply.isProcessed).toBe(true);
      expect(testReply.processedBy).toBe(testUser.id);

      // Verify request status was updated
      await testRequest.reload();
      expect(testRequest.status).toBe('APPROVED');
      expect(testRequest.needsReview).toBe(false);
    });

    it('should handle non-existent reply', async () => {
      await expect(
        ReplyCheckingService.processReply(9999, 'APPROVED', testUser.id)
      ).rejects.toThrow('Reply not found');
    });
  });

  describe('getRequestsNeedingCheck', () => {
    it('should return requests within active roster periods', async () => {
      const requests = await ReplyCheckingService.getRequestsNeedingCheck(testUser.id);
      
      expect(requests).toHaveLength(1);
      expect(requests[0].id).toBe(testRequest.id);
    });

    it('should return empty array when no active roster periods', async () => {
      // Deactivate roster schedule
      await RosterSchedule.update({ isActive: false }, { where: {} });

      const requests = await ReplyCheckingService.getRequestsNeedingCheck(testUser.id);
      
      expect(requests).toHaveLength(0);
    });
  });

  describe('extractNameFromEmail', () => {
    it('should extract name from formatted email', () => {
      const name = ReplyCheckingService.extractNameFromEmail('John Doe <john@example.com>');
      expect(name).toBe('John Doe');
    });

    it('should handle email without name', () => {
      const name = ReplyCheckingService.extractNameFromEmail('john@example.com');
      expect(name).toBe('john@example.com');
    });

    it('should handle quoted names', () => {
      const name = ReplyCheckingService.extractNameFromEmail('"John Doe" <john@example.com>');
      expect(name).toBe('John Doe');
    });
  });
});