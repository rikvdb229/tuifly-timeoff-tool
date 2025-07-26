// tests/unit/models/EmailReply.test.js
const { EmailReply, TimeOffRequest, User } = require('../../../src/models');
const { sequelize } = require('../../../config/database');

describe('EmailReply Model', () => {
  let testUser;
  let testRequest;

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

    // Create test request
    testRequest = await TimeOffRequest.create({
      userId: testUser.id,
      startDate: '2024-02-01',
      endDate: '2024-02-01',
      type: 'REQ_DO',
      status: 'PENDING',
      emailMode: 'automatic',
      gmailThreadId: 'thread123',
      emailSent: new Date()
    });
  });

  afterEach(async () => {
    await sequelize.drop();
  });

  describe('Model Creation', () => {
    it('should create a new email reply with required fields', async () => {
      const replyData = {
        timeOffRequestId: testRequest.id,
        gmailMessageId: 'msg123',
        gmailThreadId: 'thread123',
        fromEmail: 'manager@tuifly.com',
        fromName: 'Manager',
        replyContent: 'Your request is approved.',
        replySnippet: 'Your request is approved.',
        receivedAt: new Date(),
        isProcessed: false
      };

      const reply = await EmailReply.create(replyData);

      expect(reply).toBeDefined();
      expect(reply.timeOffRequestId).toBe(testRequest.id);
      expect(reply.gmailMessageId).toBe('msg123');
      expect(reply.fromEmail).toBe('manager@tuifly.com');
      expect(reply.isProcessed).toBe(false);
    });

    it('should fail to create reply without required fields', async () => {
      await expect(EmailReply.create({})).rejects.toThrow();
    });
  });

  describe('Class Methods', () => {
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
    });

    it('should find unprocessed replies by user', async () => {
      const unprocessedReplies = await EmailReply.findUnprocessedByUser(testUser.id);
      
      expect(unprocessedReplies).toHaveLength(1);
      expect(unprocessedReplies[0].id).toBe(testReply.id);
      expect(unprocessedReplies[0].TimeOffRequest).toBeDefined();
    });

    it('should count replies for user', async () => {
      const count = await EmailReply.getCountForUser(testUser.id, false);
      expect(count).toBe(1);

      const processedCount = await EmailReply.getCountForUser(testUser.id, true);
      expect(processedCount).toBe(0);
    });
  });

  describe('Instance Methods', () => {
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
    });

    it('should mark reply as processed', async () => {
      await testReply.markAsProcessed(testUser.id);
      await testReply.reload();

      expect(testReply.isProcessed).toBe(true);
      expect(testReply.processedAt).toBeDefined();
      expect(testReply.processedBy).toBe(testUser.id);
    });
  });

  describe('Associations', () => {
    it('should have association with TimeOffRequest', async () => {
      const testReply = await EmailReply.create({
        timeOffRequestId: testRequest.id,
        gmailMessageId: 'msg123',
        gmailThreadId: 'thread123',
        fromEmail: 'manager@tuifly.com',
        replyContent: 'Test reply',
        receivedAt: new Date()
      });

      const replyWithRequest = await EmailReply.findByPk(testReply.id, {
        include: [TimeOffRequest]
      });

      expect(replyWithRequest.TimeOffRequest).toBeDefined();
      expect(replyWithRequest.TimeOffRequest.id).toBe(testRequest.id);
    });
  });
});