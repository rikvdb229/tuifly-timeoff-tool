// src/services/userService.js - User management service
class UserService {
  constructor() {}

  /**
   * Get user's email preference
   * @param {Object} user - User instance
   * @returns {Object} Email preference data
   */
  async getEmailPreference(user) {
    return {
      emailPreference: user.emailPreference,
      gmailScopeGranted: user.gmailScopeGranted,
      canSendEmails: user.canSendEmails(),
      usesManualEmail: user.usesManualEmail(),
      usesAutomaticEmail: user.usesAutomaticEmail(),
    };
  }

  /**
   * Update user's email preference
   * @param {Object} user - User instance
   * @param {string} preference - New email preference ('automatic' or 'manual')
   * @returns {Object} Update result
   */
  async updateEmailPreference(user, preference) {
    // Validate preference
    if (!preference || !['automatic', 'manual'].includes(preference)) {
      throw new Error(
        'Invalid email preference. Must be "automatic" or "manual"'
      );
    }

    await user.setEmailPreference(preference);

    // Check if Gmail authorization is required
    let requiresGmailAuth = false;
    if (preference === 'automatic' && !user.gmailScopeGranted) {
      requiresGmailAuth = true;
    }

    return {
      emailPreference: preference,
      requiresGmailAuth,
      gmailScopeGranted: user.gmailScopeGranted,
      message: `Email preference updated to ${preference}`,
    };
  }

  /**
   * Get user capabilities and status
   * @param {Object} user - User instance
   * @returns {Object} User capabilities
   */
  async getUserCapabilities(user) {
    return {
      canUseApp: user.canUseApp(),
      isOnboarded: user.isOnboarded(),
      canSendEmails: user.canSendEmails(),
      usesManualEmail: user.usesManualEmail(),
      usesAutomaticEmail: user.usesAutomaticEmail(),
      hasValidGmailToken: user.hasValidGmailToken(),
    };
  }

  /**
   * Check Gmail authorization status
   * @param {Object} user - User instance
   * @returns {Object} Gmail authorization status
   */
  async checkGmailAuthorization(user) {
    // Check if token is valid
    let tokenValid = false;
    let canRefresh = false;

    if (user.gmailAccessToken && user.gmailTokenExpiry) {
      tokenValid = new Date() < new Date(user.gmailTokenExpiry);
      canRefresh = !!user.gmailRefreshToken;
    }

    return {
      connected:
        user.gmailScopeGranted &&
        user.gmailAccessToken &&
        (tokenValid || canRefresh),
      scopeGranted: user.gmailScopeGranted,
      hasAccessToken: !!user.gmailAccessToken,
      hasRefreshToken: !!user.gmailRefreshToken,
      tokenValid,
      canRefresh,
      hasValidToken: user.hasValidGmailToken(),
      tokenExpiry: user.gmailTokenExpiry,
      canSendEmails: Boolean(user.canSendEmails()),
      needsReauth:
        user.gmailScopeGranted &&
        !user.gmailAccessToken &&
        !user.gmailRefreshToken,
      authUrl: '/auth/google/gmail',
    };
  }

  /**
   * Check if user requires Gmail authorization for a preference
   * @param {Object} user - User instance
   * @param {string} preference - Email preference
   * @returns {boolean} Whether Gmail auth is required
   */
  async requiresGmailAuth(user, preference) {
    return (
      preference === 'automatic' &&
      (!user.gmailScopeGranted || !user.gmailAccessToken)
    );
  }

  /**
   * Get safe user object for API responses
   * @param {Object} user - User instance
   * @returns {Object} Safe user object
   */
  getUserSafeObject(user) {
    return user.toSafeObject();
  }

  /**
   * Update user's last login timestamp
   * @param {Object} user - User instance
   * @returns {Promise} Update promise
   */
  async updateUserLastLogin(user) {
    return user.update({ lastLoginAt: new Date() });
  }
}

module.exports = UserService;
