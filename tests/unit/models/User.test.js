// tests/unit/models/User.test.js - Tests for User model
const { User, sequelize } = require('../../../src/models');
const { tokenCrypto } = require('../../../src/utils/crypto');

describe('User Model', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await User.destroy({ where: {}, force: true });
  });

  describe('Model Creation', () => {
    it('should create a user with required fields', async () => {
      const userData = testUtils.createTestUser();
      const user = await User.create(userData);

      expect(user.googleId).toBe(userData.googleId);
      expect(user.email).toBe(userData.email);
      expect(user.name).toBe(userData.name);
      expect(user.code).toBe(userData.code);
      expect(user.isAdmin).toBe(false);
      expect(user.emailPreference).toBe('manual');
    });

    it('should create admin user with setupAdminUser method', async () => {
      const adminData = testUtils.createTestUser({
        email: 'admin@tuifly.com',
        name: 'Admin User',
        code: 'ADM',
      });

      const user = await User.setupAdminUser(adminData);

      expect(user.isAdmin).toBe(true);
      expect(user.adminApproved).toBe(true);
      expect(user.adminApprovedAt).toBeDefined();
      expect(user.canUseApp()).toBe(true);
    });

    it('should validate required fields', async () => {
      await expect(User.create({})).rejects.toThrow();
      
      await expect(User.create({
        email: 'test@example.com'
      })).rejects.toThrow();
    });

    it('should enforce unique email constraint', async () => {
      const userData = testUtils.createTestUser();
      await User.create(userData);

      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should enforce unique googleId constraint', async () => {
      const userData1 = testUtils.createTestUser();
      const userData2 = testUtils.createTestUser({
        email: 'different@tuifly.com',
        googleId: userData1.googleId
      });

      await User.create(userData1);
      await expect(User.create(userData2)).rejects.toThrow();
    });
  });

  describe('User Instance Methods', () => {
    let user;

    beforeEach(async () => {
      const userData = testUtils.createTestUser();
      user = await User.create(userData);
    });

    describe('canUseApp', () => {
      it('should return true for admin users', async () => {
        user.isAdmin = true;
        expect(user.canUseApp()).toBe(true);
      });

      it('should return true for approved non-admin users', async () => {
        user.adminApproved = true;
        expect(user.canUseApp()).toBe(true);
      });

      it('should return false for unapproved non-admin users', async () => {
        user.adminApproved = false;
        user.isAdmin = false;
        expect(user.canUseApp()).toBe(false);
      });
    });

    describe('isOnboarded', () => {
      it('should return true when onboardedAt is set', async () => {
        user.onboardedAt = new Date();
        expect(user.isOnboarded()).toBe(true);
      });

      it('should return false when onboardedAt is null', async () => {
        user.onboardedAt = null;
        expect(user.isOnboarded()).toBe(false);
      });
    });

    describe('Email Preference Methods', () => {
      it('should update email preference', async () => {
        await user.setEmailPreference('automatic');
        await user.reload();
        expect(user.emailPreference).toBe('automatic');
      });

      it('should return correct email preference status', async () => {
        user.emailPreference = 'manual';
        expect(user.usesManualEmail()).toBe(true);
        expect(user.usesAutomaticEmail()).toBe(false);

        user.emailPreference = 'automatic';
        expect(user.usesManualEmail()).toBe(false);
        expect(user.usesAutomaticEmail()).toBe(true);
      });

      it('should determine if user can send emails', () => {
        // Manual mode - always can send
        user.emailPreference = 'manual';
        expect(user.canSendEmails()).toBe(true);

        // Automatic mode - depends on Gmail setup
        user.emailPreference = 'automatic';
        user.gmailScopeGranted = false;
        expect(user.canSendEmails()).toBe(false);

        user.gmailScopeGranted = true;
        user.gmailAccessToken = 'token';
        expect(user.canSendEmails()).toBe(true);
      });
    });

    describe('Gmail Token Methods', () => {
      it('should check if user has valid Gmail token', () => {
        // No token
        user.gmailAccessToken = null;
        expect(user.hasValidGmailToken()).toBe(false);

        // Expired token
        user.gmailAccessToken = 'token';
        user.gmailTokenExpiry = new Date(Date.now() - 3600000); // 1 hour ago
        expect(user.hasValidGmailToken()).toBe(false);

        // Valid token
        user.gmailTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
        expect(user.hasValidGmailToken()).toBe(true);
      });

      it('should store encrypted Gmail tokens', async () => {
        const accessToken = 'test_access_token';
        const refreshToken = 'test_refresh_token';

        await user.setGmailTokens(accessToken, refreshToken, new Date(Date.now() + 3600000));
        await user.reload();

        // Tokens should be encrypted in database
        expect(user.gmailAccessToken).not.toBe(accessToken);
        expect(user.gmailRefreshToken).not.toBe(refreshToken);
        expect(user.gmailAccessToken).toContain(':'); // encrypted format

        // But decryption should work
        expect(user.getDecryptedGmailAccessToken()).toBe(accessToken);
        expect(user.getDecryptedGmailRefreshToken()).toBe(refreshToken);
      });

      it('should handle token decryption errors gracefully', () => {
        // Set invalid encrypted token
        user.gmailAccessToken = 'invalid:encrypted:token';
        user.gmailRefreshToken = 'invalid:encrypted:token';

        expect(user.getDecryptedGmailAccessToken()).toBe(null);
        expect(user.getDecryptedGmailRefreshToken()).toBe(null);
      });

      it('should clear Gmail tokens', async () => {
        await user.setGmailTokens('token', 'refresh', new Date());
        await user.clearGmailTokens();
        await user.reload();

        expect(user.gmailAccessToken).toBe(null);
        expect(user.gmailRefreshToken).toBe(null);
        expect(user.gmailTokenExpiry).toBe(null);
        expect(user.gmailScopeGranted).toBe(false);
      });
    });

    describe('Admin Methods', () => {
      it('should approve user', async () => {
        const admin = await User.create(testUtils.createTestUser({
          email: 'admin@tuifly.com',
          googleId: 'admin_google_id',
          isAdmin: true
        }));

        await user.approveUser(admin.id);
        await user.reload();

        expect(user.adminApproved).toBe(true);
        expect(user.adminApprovedBy).toBe(admin.id);
        expect(user.adminApprovedAt).toBeDefined();
      });

      it('should make user admin', async () => {
        const existingAdmin = await User.create(testUtils.createTestUser({
          email: 'admin@tuifly.com',
          googleId: 'admin_google_id',
          isAdmin: true
        }));

        await user.makeAdmin(existingAdmin.id);
        await user.reload();

        expect(user.isAdmin).toBe(true);
        expect(user.adminApproved).toBe(true);
        expect(user.adminPromotedBy).toBe(existingAdmin.id);
        expect(user.adminPromotedAt).toBeDefined();
      });
    });

    describe('toSafeObject', () => {
      it('should return safe user object without sensitive data', () => {
        user.gmailAccessToken = 'sensitive_token';
        user.gmailRefreshToken = 'sensitive_refresh';

        const safeUser = user.toSafeObject();

        expect(safeUser).toHaveProperty('id');
        expect(safeUser).toHaveProperty('email');
        expect(safeUser).toHaveProperty('name');
        expect(safeUser).toHaveProperty('code');
        expect(safeUser).toHaveProperty('emailPreference');
        expect(safeUser).toHaveProperty('isAdmin');
        expect(safeUser).toHaveProperty('canUseApp');
        expect(safeUser).toHaveProperty('isOnboarded');

        // Should not include sensitive data
        expect(safeUser).not.toHaveProperty('gmailAccessToken');
        expect(safeUser).not.toHaveProperty('gmailRefreshToken');
        expect(safeUser).not.toHaveProperty('googleId');
      });
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test users
      await User.create(testUtils.createTestUser({
        email: 'admin@tuifly.com',
        googleId: 'admin_google_id',
        isAdmin: true,
        adminApproved: true
      }));

      await User.create(testUtils.createTestUser({
        email: 'approved@tuifly.com',
        googleId: 'approved_google_id',
        adminApproved: true
      }));

      await User.create(testUtils.createTestUser({
        email: 'pending@tuifly.com',
        googleId: 'pending_google_id',
        adminApproved: false
      }));
    });

    describe('findByGoogleId', () => {
      it('should find user by Google ID', async () => {
        const user = await User.findByGoogleId('admin_google_id');
        expect(user).toBeDefined();
        expect(user.email).toBe('admin@tuifly.com');
      });

      it('should return null for non-existent Google ID', async () => {
        const user = await User.findByGoogleId('non_existent');
        expect(user).toBe(null);
      });
    });

    describe('getAdmins', () => {
      it('should return all admin users', async () => {
        const admins = await User.getAdmins();
        expect(admins).toHaveLength(1);
        expect(admins[0].email).toBe('admin@tuifly.com');
        expect(admins[0].isAdmin).toBe(true);
      });
    });

    describe('getPendingApprovals', () => {
      it('should return users pending approval', async () => {
        const pending = await User.getPendingApprovals();
        expect(pending).toHaveLength(1);
        expect(pending[0].email).toBe('pending@tuifly.com');
        expect(pending[0].adminApproved).toBe(false);
      });
    });

    describe('getApprovedUsers', () => {
      it('should return approved users', async () => {
        const approved = await User.getApprovedUsers();
        expect(approved.length).toBeGreaterThanOrEqual(2); // admin + approved user
        expect(approved.every(user => user.adminApproved === true)).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database constraint violations', async () => {
      const userData = testUtils.createTestUser();
      await User.create(userData);

      // Try to create duplicate
      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should handle invalid email preference', async () => {
      const user = await User.create(testUtils.createTestUser());
      
      await expect(user.setEmailPreference('invalid')).rejects.toThrow();
    });

    it('should handle token encryption errors gracefully', async () => {
      const user = await User.create(testUtils.createTestUser());
      
      // Mock crypto error
      const originalEncrypt = tokenCrypto.encrypt;
      tokenCrypto.encrypt = jest.fn().mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      await expect(user.setGmailTokens('token', 'refresh', new Date()))
        .rejects.toThrow('Encryption failed');

      // Restore original
      tokenCrypto.encrypt = originalEncrypt;
    });
  });
});