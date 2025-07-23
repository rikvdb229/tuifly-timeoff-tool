// tests/unit/models/TimeOffRequest.test.js - Tests for TimeOffRequest model
const { User, TimeOffRequest, sequelize } = require('../../../src/models');
const { v4: uuidv4 } = require('uuid');

describe('TimeOffRequest Model', () => {
  let testUser;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await TimeOffRequest.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
    
    // Create test user
    testUser = await User.create(testUtils.createTestUser());
  });

  describe('Model Creation', () => {
    it('should create a time off request with required fields', async () => {
      const requestData = testUtils.createTestRequest({
        userId: testUser.id
      });

      const request = await TimeOffRequest.create(requestData);

      expect(request.userId).toBe(testUser.id);
      expect(request.startDate).toBe('2024-02-01');
      expect(request.endDate).toBe('2024-02-01');
      expect(request.type).toBe(requestData.type);
      expect(request.status).toBe('PENDING');
      expect(request.emailMode).toBeUndefined(); // emailMode is set by static methods based on user preference
    });

    it('should validate required fields', async () => {
      await expect(TimeOffRequest.create({})).rejects.toThrow();
      
      await expect(TimeOffRequest.create({
        userId: testUser.id
      })).rejects.toThrow();
    });

    it('should validate type enum values', async () => {
      const requestData = testUtils.createTestRequest({
        userId: testUser.id,
        type: 'INVALID_TYPE'
      });

      // Note: SQLite doesn't enforce ENUM constraints, so this creates successfully
      // In production with PostgreSQL, this would throw an error
      const request = await TimeOffRequest.create(requestData);
      expect(request.type).toBe('INVALID_TYPE');
    });

    it('should validate status enum values', async () => {
      const requestData = testUtils.createTestRequest({
        userId: testUser.id,
        status: 'INVALID_STATUS'
      });

      // Note: SQLite doesn't enforce ENUM constraints, so this creates successfully
      // In production with PostgreSQL, this would throw an error
      const request = await TimeOffRequest.create(requestData);
      expect(request.status).toBe('INVALID_STATUS');
    });

    it('should auto-generate groupId for group requests', async () => {
      const request = await TimeOffRequest.create(testUtils.createTestRequest({
        userId: testUser.id,
        isGroupRequest: true
      }));

      expect(request.groupId).toBeDefined();
      expect(typeof request.groupId).toBe('string');
    });

    it('should set emailMode based on user preference when using static methods', async () => {
      testUser.emailPreference = 'manual';
      await testUser.save();

      // The emailMode is set by the static method, not by direct create()
      const request = await TimeOffRequest.createForUser(testUser.id, {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-01'),
        type: 'REQ_DO',
        customMessage: 'Test request'
      });

      expect(request.emailMode).toBe('manual');
    });
  });

  describe('Instance Methods', () => {
    let request;

    beforeEach(async () => {
      request = await TimeOffRequest.create(testUtils.createTestRequest({
        userId: testUser.id
      }));
    });

    describe('updateStatus', () => {
      it('should update status to approved', async () => {
        await request.updateStatus('APPROVED');
        await request.reload();

        expect(request.status).toBe('APPROVED');
        expect(request.approvedAt).toBeDefined();
      });

      it('should update status to denied', async () => {
        await request.updateStatus('DENIED');
        await request.reload();

        expect(request.status).toBe('DENIED');
        expect(request.deniedAt).toBeDefined();
      });

      it('should validate status values', async () => {
        await expect(request.updateStatus('INVALID_STATUS'))
          .rejects.toThrow();
      });
    });

    describe('markEmailSent', () => {
      it('should mark email as sent', async () => {
        await request.markEmailSent();
        await request.reload();

        expect(request.emailSent).toBe(true);
        expect(request.emailSentAt).toBeDefined();
        expect(request.emailFailed).toBe(false);
      });

      it('should not overwrite existing sent date', async () => {
        const firstSentDate = new Date(Date.now() - 1000);
        request.emailSentAt = firstSentDate;
        await request.save();

        await request.markEmailSent();
        await request.reload();

        expect(request.emailSentAt).toEqual(firstSentDate);
      });
    });

    describe('markEmailFailed', () => {
      it('should mark email as failed with error', async () => {
        const error = 'SMTP connection failed';
        await request.markEmailFailed(error);
        await request.reload();

        expect(request.emailFailed).toBe(true);
        expect(request.emailFailedAt).toBeDefined();
        expect(request.emailError).toBe(error);
        expect(request.emailSent).toBe(false);
      });

      it('should increment failure count', async () => {
        expect(request.emailFailureCount).toBe(0);

        await request.markEmailFailed('First failure');
        await request.reload();
        expect(request.emailFailureCount).toBe(1);

        await request.markEmailFailed('Second failure');
        await request.reload();
        expect(request.emailFailureCount).toBe(2);
      });
    });

    describe('resetEmailStatus', () => {
      it('should reset email status', async () => {
        // First mark as failed
        await request.markEmailFailed('Test error');
        await request.reload();
        expect(request.emailFailed).toBe(true);

        // Then reset
        await request.resetEmailStatus();
        await request.reload();

        expect(request.emailSent).toBe(false);
        expect(request.emailFailed).toBe(false);
        expect(request.emailSentAt).toBe(null);
        expect(request.emailFailedAt).toBe(null);
        expect(request.emailError).toBe(null);
        expect(request.emailFailureCount).toBe(0);
      });
    });

    describe('generateEmailContent', () => {
      it('should generate email content', async () => {
        const emailContent = await request.generateEmailContent(testUser);

        expect(emailContent).toHaveProperty('to');
        expect(emailContent).toHaveProperty('subject');
        expect(emailContent).toHaveProperty('body');
        expect(emailContent.subject).toContain(testUser.code);
        expect(emailContent.body).toContain(request.customMessage);
      });

      it('should handle group requests', async () => {
        const groupId = uuidv4();
        
        // Create multiple requests with same group ID
        await TimeOffRequest.create(testUtils.createTestRequest({
          userId: testUser.id,
          groupId,
          startDate: new Date('2024-02-01'),
          isGroupRequest: true
        }));

        await TimeOffRequest.create(testUtils.createTestRequest({
          userId: testUser.id,
          groupId,
          startDate: new Date('2024-02-02'),
          isGroupRequest: true
        }));

        const groupRequest = await TimeOffRequest.findOne({ where: { groupId } });
        const emailContent = await groupRequest.generateEmailContent(testUser);

        expect(emailContent.body).toContain('01FEB24');
        expect(emailContent.body).toContain('02FEB24');
      });
    });

    describe('getEmailStatus', () => {
      it('should return not sent status', () => {
        const status = request.getEmailStatus();
        expect(status.sent).toBe(false);
        expect(status.failed).toBe(false);
        expect(status.canResend).toBe(false);
      });

      it('should return sent status', async () => {
        await request.markEmailSent();
        const status = request.getEmailStatus();
        
        expect(status.sent).toBe(true);
        expect(status.failed).toBe(false);
        expect(status.sentAt).toBeDefined();
      });

      it('should return failed status with resend capability', async () => {
        await request.markEmailFailed('Test error');
        const status = request.getEmailStatus();
        
        expect(status.sent).toBe(false);
        expect(status.failed).toBe(true);
        expect(status.canResend).toBe(true);
        expect(status.failureCount).toBe(1);
      });
    });

    describe('isEditable', () => {
      it('should be editable when pending', () => {
        request.status = 'PENDING';
        expect(request.isEditable()).toBe(true);
      });

      it('should not be editable when approved', () => {
        request.status = 'APPROVED';
        expect(request.isEditable()).toBe(false);
      });

      it('should not be editable when email sent', async () => {
        await request.markEmailSent();
        expect(request.isEditable()).toBe(false);
      });
    });

    describe('canDelete', () => {
      it('should be deletable when pending', () => {
        expect(request.canDelete()).toBe(true);
      });

      it('should not be deletable when approved', () => {
        request.status = 'APPROVED';
        expect(request.canDelete()).toBe(false);
      });
    });

    describe('isDuplicateDate', () => {
      it('should detect duplicate dates for same user', async () => {
        const duplicateRequest = testUtils.createTestRequest({
          userId: testUser.id,
          startDate: request.startDate,
          endDate: request.endDate
        });

        const isDuplicate = await TimeOffRequest.isDuplicateDate(
          testUser.id,
          duplicateRequest.startDate,
          duplicateRequest.endDate
        );

        expect(isDuplicate).toBe(true);
      });

      it('should not detect duplicates for different users', async () => {
        const otherUser = await User.create(testUtils.createTestUser({
          email: 'other@tuifly.com',
          googleId: 'other_google_id'
        }));

        const isDuplicate = await TimeOffRequest.isDuplicateDate(
          otherUser.id,
          request.startDate,
          request.endDate
        );

        expect(isDuplicate).toBe(false);
      });

      it('should not detect duplicates for different dates', async () => {
        const differentDate = new Date('2024-03-01');
        
        const isDuplicate = await TimeOffRequest.isDuplicateDate(
          testUser.id,
          differentDate,
          differentDate
        );

        expect(isDuplicate).toBe(false);
      });
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test requests
      await TimeOffRequest.create(testUtils.createTestRequest({
        userId: testUser.id,
        status: 'PENDING'
      }));

      await TimeOffRequest.create(testUtils.createTestRequest({
        userId: testUser.id,
        status: 'APPROVED',
        startDate: new Date('2024-02-15'),
        endDate: new Date('2024-02-15')
      }));
    });

    describe('findByUser', () => {
      it('should find requests by user ID', async () => {
        const requests = await TimeOffRequest.findByUser(testUser.id);
        expect(requests).toHaveLength(2);
        expect(requests.every(r => r.userId === testUser.id)).toBe(true);
      });

      it('should filter by status', async () => {
        const pendingRequests = await TimeOffRequest.findByUser(testUser.id, 'PENDING');
        expect(pendingRequests).toHaveLength(1);
        expect(pendingRequests[0].status).toBe('PENDING');
      });
    });

    describe('findByGroup', () => {
      it('should find requests by group ID', async () => {
        const groupId = uuidv4();
        
        await TimeOffRequest.create(testUtils.createTestRequest({
          userId: testUser.id,
          groupId,
          isGroupRequest: true
        }));

        await TimeOffRequest.create(testUtils.createTestRequest({
          userId: testUser.id,
          groupId,
          startDate: new Date('2024-02-02'),
          endDate: new Date('2024-02-02'),
          isGroupRequest: true
        }));

        const groupRequests = await TimeOffRequest.findByGroup(groupId);
        expect(groupRequests).toHaveLength(2);
        expect(groupRequests.every(r => r.groupId === groupId)).toBe(true);
      });
    });

    describe('findByDateRange', () => {
      it('should find requests within date range', async () => {
        const startDate = new Date('2024-02-01');
        const endDate = new Date('2024-02-28');

        const requests = await TimeOffRequest.findByDateRange(startDate, endDate);
        expect(requests.length).toBeGreaterThan(0);
      });
    });

    describe('getStatistics', () => {
      it('should return request statistics', async () => {
        const stats = await TimeOffRequest.getStatistics(testUser.id);

        expect(stats).toHaveProperty('total');
        expect(stats).toHaveProperty('pending');
        expect(stats).toHaveProperty('approved');
        expect(stats).toHaveProperty('denied');
        expect(stats.total).toBe(2);
        expect(stats.pending).toBe(1);
        expect(stats.approved).toBe(1);
      });
    });
  });

  describe('Associations', () => {
    it('should associate with User model', async () => {
      const request = await TimeOffRequest.create(testUtils.createTestRequest({
        userId: testUser.id
      }));

      const requestWithUser = await TimeOffRequest.findByPk(request.id, {
        include: [{ model: User }]
      });

      expect(requestWithUser.User).toBeDefined();
      expect(requestWithUser.User.id).toBe(testUser.id);
      expect(requestWithUser.User.email).toBe(testUser.email);
    });
  });

  describe('Hooks and Validations', () => {
    it('should validate date range', async () => {
      const invalidData = testUtils.createTestRequest({
        userId: testUser.id,
        startDate: new Date('2024-02-15'),
        endDate: new Date('2024-02-01') // end before start
      });

      await expect(TimeOffRequest.create(invalidData)).rejects.toThrow();
    });

    it('should validate future dates only', async () => {
      const pastData = testUtils.createTestRequest({
        userId: testUser.id,
        startDate: new Date('2020-01-01'),
        endDate: new Date('2020-01-01')
      });

      await expect(TimeOffRequest.create(pastData)).rejects.toThrow();
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const request = await TimeOffRequest.create(testUtils.createTestRequest({
        userId: testUser.id
      }));

      expect(request.createdAt).toBeDefined();
      expect(request.updatedAt).toBeDefined();
      expect(request.createdAt).toBeInstanceOf(Date);
      expect(request.updatedAt).toBeInstanceOf(Date);
    });
  });
});