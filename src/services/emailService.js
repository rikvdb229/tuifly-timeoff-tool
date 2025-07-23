// src/services/emailService.js - Email workflow management service
const { TimeOffRequest } = require('../models');
const GmailService = require('./gmailService');
const { serviceLogger } = require('../utils/logger');

class EmailService {
  constructor(gmailService, userService) {
    this.gmailService = gmailService || new GmailService();
    this.userService = userService;
  }

  /**
   * Handle email workflow for requests (automatic or manual)
   * @param {Object} user - User instance
   * @param {Array} requests - Request instances
   * @param {string} mode - Email mode ('automatic' or 'manual')
   * @returns {Promise<Object>} Email workflow result
   */
  async handleEmailWorkflow(user, requests, mode = null) {
    const emailMode = mode || user.emailPreference;

    if (emailMode === 'automatic' && user.canSendEmails()) {
      return await this.sendAutomaticEmail(user, requests);
    } else {
      return await this.prepareManualEmail(user, requests);
    }
  }

  /**
   * Send automatic email via Gmail
   * @param {Object} user - User instance
   * @param {Array} requests - Request instances
   * @returns {Promise<Object>} Email send result
   */
  async sendAutomaticEmail(user, requests) {
    try {
      // Check Gmail authorization
      if (GmailService.needsReauthorization(user)) {
        const error = new Error('Gmail authorization required');
        error.statusCode = 400;
        error.authRequired = true;
        error.authUrl = '/auth/google';
        throw error;
      }

      // Send email using Gmail service
      const emailResult = await this.gmailService.sendEmail(user, requests);

      // Mark requests as email sent
      for (const request of requests) {
        await request.markEmailSent(
          emailResult.messageId,
          emailResult.threadId
        );
      }

      return {
        sent: true,
        messageId: emailResult.messageId,
        threadId: emailResult.threadId,
        to: emailResult.to,
        subject: emailResult.subject,
        mode: 'automatic',
        message:
          requests.length > 1
            ? `Group email sent automatically for ${requests.length} requests`
            : 'Email sent automatically',
      };
    } catch (emailError) {
      serviceLogger.logError(emailError, {
        operation: 'sendAutomaticEmail',
        service: 'emailService',
        userId: user.id,
        userEmail: user.email,
        requestCount: requests.length,
        requestIds: requests.map(r => r.id)
      });

      // Mark requests as email failed
      for (const request of requests) {
        await request.markEmailFailed(emailError.message);
      }

      // Re-throw with additional context
      const error = new Error(`Email send failed: ${emailError.message}`);
      error.statusCode = emailError.statusCode || 500;
      error.originalError = emailError;
      throw error;
    }
  }

  /**
   * Prepare manual email content
   * @param {Object} user - User instance
   * @param {Array} requests - Request instances
   * @returns {Promise<Object>} Manual email preparation result
   */
  async prepareManualEmail(user, requests) {
    try {
      // Generate email content
      const emailContent = this.gmailService.generateEmailContent(
        user,
        requests
      );

      // Store email content in requests
      for (const request of requests) {
        await request.storeManualEmailContent(emailContent);
      }

      return {
        sent: false,
        emailContent,
        mode: 'manual',
        message:
          requests.length > 1
            ? `Group email content prepared for ${requests.length} requests. Ready to copy.`
            : 'Email content ready to copy.',
      };
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'prepareManualEmail',
        service: 'emailService',
        userId: user.id,
        userEmail: user.email,
        requestCount: requests.length,
        requestIds: requests.map(r => r.id)
      });
      throw new Error(`Email content generation failed: ${error.message}`);
    }
  }

  /**
   * Resend email for a request (automatic mode only)
   * @param {number} requestId - Request ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Resend result
   */
  async resendEmail(requestId, userId) {
    const request = await TimeOffRequest.findByPkAndUser(requestId, userId);

    if (!request) {
      const error = new Error('Request not found');
      error.statusCode = 404;
      throw error;
    }

    // Get user from request
    const user = await request.getUser();

    // Check if user is in automatic mode
    if (user.emailPreference !== 'automatic') {
      const error = new Error(
        'Resend is only available in automatic email mode'
      );
      error.statusCode = 400;
      throw error;
    }

    let requestsToResend = [request];

    // If it's a group request, get all requests in the group
    if (request.groupId) {
      requestsToResend = await TimeOffRequest.getByGroupIdAndUser(
        request.groupId,
        userId
      );
    }

    // Send email using automatic workflow
    const result = await this.sendAutomaticEmail(user, requestsToResend);

    return {
      ...result,
      updatedCount: requestsToResend.length,
      isGroup: request.groupId ? true : false,
      groupId: request.groupId,
      message: `Email ${request.groupId ? 'group ' : ''}resent successfully`,
    };
  }

  /**
   * Get email content for a request (manual mode)
   * @param {number} requestId - Request ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Email content
   */
  async getEmailContent(requestId, userId) {
    const request = await TimeOffRequest.findByPkAndUser(requestId, userId);

    if (!request) {
      const error = new Error('Request not found');
      error.statusCode = 404;
      throw error;
    }

    if (request.emailMode !== 'manual') {
      const error = new Error('This request is not in manual email mode');
      error.statusCode = 400;
      throw error;
    }

    return {
      emailContent: request.manualEmailContent,
      canBeSent: request.canManualEmailBeSent(),
      emailStatus: request.getEmailStatus(),
      emailStatusIcon: request.getEmailStatusIcon(),
      emailStatusLabel: request.getEmailStatusLabel(),
    };
  }

  /**
   * Mark manual email as sent
   * @param {number} requestId - Request ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Mark as sent result
   */
  async markEmailAsSent(requestId, userId) {
    const request = await TimeOffRequest.findByPkAndUser(requestId, userId);

    if (!request) {
      const error = new Error('Request not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if this request can be marked as manually sent
    if (request.emailSent) {
      const error = new Error(
        'This request already has an automatic email sent. Cannot mark as manually sent.'
      );
      error.statusCode = 400;
      throw error;
    }

    if (request.manualEmailConfirmed) {
      const error = new Error('Email already marked as sent');
      error.statusCode = 400;
      throw error;
    }

    const updatedRequests = [];

    if (request.groupId) {
      // Handle group requests - mark ALL requests in the group as sent
      const groupRequests = await TimeOffRequest.getByGroupIdAndUser(
        request.groupId,
        userId
      );

      // Mark all requests in the group as manually sent
      for (const groupRequest of groupRequests) {
        if (!groupRequest.manualEmailConfirmed) {
          await groupRequest.markManualEmailSent();
          updatedRequests.push(groupRequest);
        }
      }

      return {
        updatedRequests: updatedRequests.length,
        groupId: request.groupId,
        emailStatus: 'confirmed',
        emailStatusIcon: '✅',
        emailStatusLabel: 'Email Confirmed Sent',
        message: `Email marked as sent for group of ${updatedRequests.length} request(s)`,
      };
    } else {
      // Single request
      await request.markManualEmailSent();

      return {
        updatedRequests: 1,
        emailStatus: request.getEmailStatus(),
        emailStatusIcon: request.getEmailStatusIcon(),
        emailStatusLabel: request.getEmailStatusLabel(),
        message: 'Email marked as sent successfully',
      };
    }
  }

  /**
   * Generate email content for a request or group
   * @param {number} requestId - Request ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Generated email content
   */
  async generateEmailContent(requestId, userId) {
    const request = await TimeOffRequest.findByPkAndUser(requestId, userId);

    if (!request) {
      const error = new Error('Request not found');
      error.statusCode = 404;
      throw error;
    }

    const user = await request.getUser();

    // Generate email content (unified function handles both single and group requests)
    const emailContent = await request.generateEmailContent(user);

    return {
      emailContent,
      isGroup: !!request.groupId,
      groupId: request.groupId,
    };
  }

  /**
   * Store manual email content in request
   * @param {Object} request - Request instance
   * @param {Object} emailContent - Email content to store
   * @returns {Promise} Storage promise
   */
  async storeManualEmailContent(request, emailContent) {
    return request.storeManualEmailContent(emailContent);
  }

  /**
   * Get email status for a request
   * @param {Object} request - Request instance
   * @returns {Object} Email status information
   */
  getEmailStatus(request) {
    return {
      status: request.getEmailStatus(),
      icon: request.getEmailStatusIcon(),
      label: request.getEmailStatusLabel(),
      canBeSent: request.canManualEmailBeSent(),
      isEmailSent: request.isEmailSent(),
      hasReply: request.hasReply(),
    };
  }

  /**
   * Check email prerequisites for requests
   * @param {Object} user - User instance
   * @param {Array} requests - Request instances
   * @returns {Object} Prerequisites check result
   */
  checkEmailPrerequisites(user, requests) {
    const issues = [];

    // Check user email preference
    if (user.emailPreference === 'automatic') {
      if (!user.gmailScopeGranted || !user.gmailAccessToken) {
        issues.push('Gmail authorization required for automatic email mode');
      }
    }

    // Check if any requests already have emails sent
    const alreadySent = requests.filter(req => req.isEmailSent());
    if (alreadySent.length > 0) {
      issues.push(`${alreadySent.length} request(s) already have emails sent`);
    }

    return {
      canSendEmail: issues.length === 0,
      issues,
    };
  }
}

module.exports = EmailService;
