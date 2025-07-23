// tests/unit/services/userService.test.js - Tests for UserService
const UserService = require('../../../src/services/userService');

describe('UserService', () => {
  let userService;
  let mockUser;

  beforeEach(() => {
    userService = new UserService();

    // Create mock user object
    mockUser = {
      id: 1,
      email: 'test@tuifly.com',
      name: 'Test User',
      code: 'TST',
      emailPreference: 'manual',
      gmailScopeGranted: false,
      gmailAccessToken: null,
      gmailRefreshToken: null,
      gmailTokenExpiry: null,

      // Mock methods
      setEmailPreference: jest.fn().mockResolvedValue(),
      canSendEmails: jest.fn().mockReturnValue(false),
      usesManualEmail: jest.fn().mockReturnValue(true),
      usesAutomaticEmail: jest.fn().mockReturnValue(false),
      canUseApp: jest.fn().mockReturnValue(true),
      isOnboarded: jest.fn().mockReturnValue(true),
      hasValidGmailToken: jest.fn().mockReturnValue(false),
      toSafeObject: jest.fn().mockReturnValue({
        id: 1,
        email: 'test@tuifly.com',
        name: 'Test User',
        code: 'TST',
      }),
    };
  });

  describe('getEmailPreference', () => {
    it('should return user email preference data', async () => {
      const result = await userService.getEmailPreference(mockUser);

      expect(result).toEqual({
        emailPreference: 'manual',
        gmailScopeGranted: false,
        canSendEmails: false,
        usesManualEmail: true,
        usesAutomaticEmail: false,
      });

      expect(mockUser.canSendEmails).toHaveBeenCalled();
      expect(mockUser.usesManualEmail).toHaveBeenCalled();
      expect(mockUser.usesAutomaticEmail).toHaveBeenCalled();
    });

    it('should handle users with automatic preference', async () => {
      mockUser.emailPreference = 'automatic';
      mockUser.canSendEmails.mockReturnValue(true);
      mockUser.usesManualEmail.mockReturnValue(false);
      mockUser.usesAutomaticEmail.mockReturnValue(true);

      const result = await userService.getEmailPreference(mockUser);

      expect(result.emailPreference).toBe('automatic');
      expect(result.canSendEmails).toBe(true);
      expect(result.usesManualEmail).toBe(false);
      expect(result.usesAutomaticEmail).toBe(true);
    });
  });

  describe('updateEmailPreference', () => {
    it('should update preference to valid value', async () => {
      const result = await userService.updateEmailPreference(
        mockUser,
        'automatic'
      );

      expect(mockUser.setEmailPreference).toHaveBeenCalledWith('automatic');
      expect(result).toEqual({
        emailPreference: 'automatic',
        requiresGmailAuth: true,
        gmailScopeGranted: false,
        message: 'Email preference updated to automatic',
      });
    });

    it('should not require Gmail auth if already granted', async () => {
      mockUser.gmailScopeGranted = true;

      const result = await userService.updateEmailPreference(
        mockUser,
        'automatic'
      );

      expect(result.requiresGmailAuth).toBe(false);
    });

    it('should update to manual without requiring auth', async () => {
      const result = await userService.updateEmailPreference(
        mockUser,
        'manual'
      );

      expect(result).toEqual({
        emailPreference: 'manual',
        requiresGmailAuth: false,
        gmailScopeGranted: false,
        message: 'Email preference updated to manual',
      });
    });

    it('should throw error for invalid preference', async () => {
      await expect(
        userService.updateEmailPreference(mockUser, 'invalid')
      ).rejects.toThrow(
        'Invalid email preference. Must be "automatic" or "manual"'
      );

      expect(mockUser.setEmailPreference).not.toHaveBeenCalled();
    });

    it('should throw error for null preference', async () => {
      await expect(
        userService.updateEmailPreference(mockUser, null)
      ).rejects.toThrow('Invalid email preference');
    });
  });

  describe('getUserCapabilities', () => {
    it('should return user capabilities', async () => {
      const result = await userService.getUserCapabilities(mockUser);

      expect(result).toEqual({
        canUseApp: true,
        isOnboarded: true,
        canSendEmails: false,
        usesManualEmail: true,
        usesAutomaticEmail: false,
        hasValidGmailToken: false,
      });

      expect(mockUser.canUseApp).toHaveBeenCalled();
      expect(mockUser.isOnboarded).toHaveBeenCalled();
    });

    it('should handle admin users', async () => {
      mockUser.canUseApp.mockReturnValue(true);
      mockUser.isOnboarded.mockReturnValue(true);

      const result = await userService.getUserCapabilities(mockUser);
      expect(result.canUseApp).toBe(true);
    });
  });

  describe('checkGmailAuthorization', () => {
    beforeEach(() => {
      mockUser.gmailTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
    });

    it('should return connected status for valid token', async () => {
      mockUser.gmailScopeGranted = true;
      mockUser.gmailAccessToken = 'valid_token';
      mockUser.hasValidGmailToken.mockReturnValue(true);

      const result = await userService.checkGmailAuthorization(mockUser);

      expect(result.connected).toBe(true);
      expect(result.scopeGranted).toBe(true);
      expect(result.hasAccessToken).toBe(true);
      expect(result.tokenValid).toBe(true);
    });

    it('should return disconnected status for expired token without refresh', async () => {
      mockUser.gmailScopeGranted = true;
      mockUser.gmailAccessToken = 'expired_token';
      mockUser.gmailTokenExpiry = new Date(Date.now() - 3600000); // 1 hour ago
      mockUser.gmailRefreshToken = null;

      const result = await userService.checkGmailAuthorization(mockUser);

      expect(result.connected).toBe(false);
      expect(result.tokenValid).toBe(false);
      expect(result.canRefresh).toBe(false);
    });

    it('should return connected status for expired token with refresh token', async () => {
      mockUser.gmailScopeGranted = true;
      mockUser.gmailAccessToken = 'expired_token';
      mockUser.gmailTokenExpiry = new Date(Date.now() - 3600000); // 1 hour ago
      mockUser.gmailRefreshToken = 'refresh_token';

      const result = await userService.checkGmailAuthorization(mockUser);

      expect(result.connected).toBe(true);
      expect(result.tokenValid).toBe(false);
      expect(result.canRefresh).toBe(true);
    });

    it('should handle user without any Gmail setup', async () => {
      mockUser.gmailScopeGranted = false;
      mockUser.gmailAccessToken = null;
      mockUser.gmailRefreshToken = null;

      const result = await userService.checkGmailAuthorization(mockUser);

      expect(result.connected).toBe(false);
      expect(result.scopeGranted).toBe(false);
      expect(result.needsReauth).toBe(false);
    });
  });

  describe('requiresGmailAuth', () => {
    it('should return true for automatic preference without Gmail auth', async () => {
      const result = await userService.requiresGmailAuth(mockUser, 'automatic');
      expect(result).toBe(true);
    });

    it('should return false for automatic preference with Gmail auth', async () => {
      mockUser.gmailScopeGranted = true;
      mockUser.gmailAccessToken = 'token';

      const result = await userService.requiresGmailAuth(mockUser, 'automatic');
      expect(result).toBe(false);
    });

    it('should return false for manual preference', async () => {
      const result = await userService.requiresGmailAuth(mockUser, 'manual');
      expect(result).toBe(false);
    });
  });

  describe('getUserSafeObject', () => {
    it('should return safe user object', () => {
      const result = userService.getUserSafeObject(mockUser);

      expect(result).toEqual({
        id: 1,
        email: 'test@tuifly.com',
        name: 'Test User',
        code: 'TST',
      });

      expect(mockUser.toSafeObject).toHaveBeenCalled();
    });
  });

  describe('updateUserLastLogin', () => {
    it('should update last login timestamp', async () => {
      mockUser.update = jest.fn().mockResolvedValue();

      await userService.updateUserLastLogin(mockUser);

      expect(mockUser.update).toHaveBeenCalledWith({
        lastLoginAt: expect.any(Date),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors in updateEmailPreference', async () => {
      mockUser.setEmailPreference.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        userService.updateEmailPreference(mockUser, 'automatic')
      ).rejects.toThrow('Database error');
    });

    it('should handle missing user methods gracefully', async () => {
      const incompleteUser = {
        emailPreference: 'manual',
        gmailScopeGranted: false,
        toSafeObject: jest
          .fn()
          .mockReturnValue({ id: 1, email: 'test@example.com' }),
      };

      // Should not throw for users with toSafeObject method
      expect(() => userService.getUserSafeObject(incompleteUser)).not.toThrow();
    });
  });
});
