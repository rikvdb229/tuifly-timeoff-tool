// tests/integration/api/replies.test.js
const request = require('supertest');
const { app } = require('../../../src/app');
const { EmailReply, TimeOffRequest, User, RosterSchedule } = require('../../../src/models');
const { sequelize } = require('../../../config/database');
const { createAuthenticatedSession } = require('../../helpers/auth');

describe('Replies API Routes', () => {
  let testUser;
  let testRequest;
  let testReply;
  let authenticatedAgent;

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    
    // Create test user with proper fields
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

    // Create authenticated session
    authenticatedAgent = await createAuthenticatedSession(app, testUser);

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

    // Create test reply
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

  afterEach(async () => {
    await sequelize.drop();
  });

  describe('GET /api/replies', () => {
    it('should return replies for authenticated user', async () => {
      const response = await authenticatedAgent
        .get('/api/replies')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.replies).toHaveLength(1);
      expect(response.body.data.replies[0].id).toBe(testReply.id);
      expect(response.body.data.replies[0].TimeOffRequest).toBeDefined();
    });

    it('should filter replies by status', async () => {
      // Mark reply as processed
      await testReply.update({ isProcessed: true });

      const needReviewResponse = await authenticatedAgent
        .get('/api/replies?filter=needreview')
        .expect(200);

      expect(needReviewResponse.body.data.replies).toHaveLength(0);

      const reviewedResponse = await authenticatedAgent
        .get('/api/replies?filter=reviewed')
        .expect(200);

      expect(reviewedResponse.body.data.replies).toHaveLength(1);
    });
  });

  describe('GET /api/replies/count', () => {
    it('should return unprocessed reply count', async () => {
      const response = await authenticatedAgent
        .get('/api/replies/count')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(1);
    });
  });

  describe('PUT /api/replies/:id/process', () => {
    it('should process reply and update request status', async () => {
      const response = await authenticatedAgent
        .put(`/api/replies/${testReply.id}/process`)
        .send({ status: 'APPROVED' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify reply was processed
      await testReply.reload();
      expect(testReply.isProcessed).toBe(true);

      // Verify request status was updated
      await testRequest.reload();
      expect(testRequest.status).toBe('APPROVED');
    });

    it('should reject invalid status', async () => {
      const response = await authenticatedAgent
        .put(`/api/replies/${testReply.id}/process`)
        .send({ status: 'INVALID' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid status');
    });

    it('should handle non-existent reply', async () => {
      const response = await authenticatedAgent
        .put('/api/replies/9999/process')
        .send({ status: 'APPROVED' })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/replies/:id/respond', () => {
    it('should reject non-automatic email users', async () => {
      // Update user to manual email preference
      await testUser.update({ emailPreference: 'manual' });

      const response = await authenticatedAgent
        .post(`/api/replies/${testReply.id}/respond`)
        .send({ message: 'Thank you for the approval' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('automatic email users');
    });

    it('should reject empty message', async () => {
      const response = await authenticatedAgent
        .post(`/api/replies/${testReply.id}/respond`)
        .send({ message: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Message content is required');
    });

    it('should handle non-existent reply', async () => {
      const response = await authenticatedAgent
        .post('/api/replies/9999/respond')
        .send({ message: 'Test message' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Reply not found');
    });
  });

  describe('POST /api/check-replies', () => {
    it('should check for replies successfully', async () => {
      // Mock the ReplyCheckingService to avoid actual Gmail API calls
      const ReplyCheckingService = require('../../../src/services/ReplyCheckingService');
      jest.spyOn(ReplyCheckingService, 'checkUserReplies').mockResolvedValue({
        success: true,
        newReplies: [],
        updatedRequests: [],
        totalChecked: 1
      });

      const response = await authenticatedAgent
        .post('/api/check-replies')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalChecked).toBe(1);
      expect(response.body.data.newRepliesCount).toBe(0);

      // Restore mock
      ReplyCheckingService.checkUserReplies.mockRestore();
    });
  });
});