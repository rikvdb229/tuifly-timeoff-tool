// src/services/groupRequestService.js - Group request management service
const { TimeOffRequest } = require('../models');
const { v4: uuidv4 } = require('uuid');

class GroupRequestService {
  constructor(requestService, emailService) {
    this.requestService = requestService;
    this.emailService = emailService;
  }

  /**
   * Create a group time-off request with email integration
   * @param {number} userId - User ID
   * @param {Array} datesArray - Array of date objects
   * @param {string} customMessage - Custom message for the request
   * @param {Object} user - User instance
   * @returns {Promise<Object>} Group request creation result
   */
  async createGroupRequest(userId, datesArray, customMessage, user) {
    // Validate input
    if (!datesArray || !Array.isArray(datesArray) || datesArray.length === 0) {
      const error = new Error('Invalid dates array');
      error.statusCode = 400;
      error.details =
        'Provide array of date objects with date, type, and optional flightNumber';
      throw error;
    }

    // Validate dates array
    const validation = this.validateGroupDates(datesArray);
    if (!validation.isValid) {
      const error = new Error('Invalid group dates');
      error.statusCode = 400;
      error.details = validation.errors;
      throw error;
    }

    console.log('🔍 Creating group request with data:', {
      datesArray,
      customMessage,
      userPreference: user.emailPreference,
    });

    // Generate group ID for all requests
    const groupId = this.generateGroupId();

    // Create all requests in the group
    const requestPromises = datesArray.map(dateObj => {
      return TimeOffRequest.create({
        userId: userId,
        groupId,
        startDate: dateObj.date,
        endDate: dateObj.date,
        type: dateObj.type.toUpperCase(),
        flightNumber:
          dateObj.type.toUpperCase() === 'FLIGHT' ? dateObj.flightNumber : null,
        customMessage: customMessage || null,
        emailMode: user.emailPreference,
      });
    });

    const createdRequests = await Promise.all(requestPromises);
    console.log(
      '✅ Created requests:',
      createdRequests.map(r => ({
        id: r.id,
        startDate: r.startDate,
        type: r.type,
      }))
    );

    // Handle email workflow
    const emailResponse = await this.emailService.handleEmailWorkflow(
      user,
      createdRequests,
      user.emailPreference
    );

    return {
      requests: createdRequests.map(r => r.toJSON()),
      groupId,
      emailMode: user.emailPreference,
      totalDates: createdRequests.length,
      emailSent: emailResponse.sent,
      emailError: emailResponse.error || null,
      messageId: emailResponse.messageId || null,
      message: emailResponse.message,
    };
  }

  /**
   * Get all requests in a group for a user
   * @param {string} groupId - Group ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Group requests
   */
  async getGroupRequests(groupId, userId) {
    const requests = await TimeOffRequest.getByGroupIdAndUser(groupId, userId);

    if (requests.length === 0) {
      const error = new Error('Group not found');
      error.statusCode = 404;
      throw error;
    }

    return {
      requests,
      count: requests.length,
    };
  }

  /**
   * Delete an entire group request
   * @param {number} requestId - Any request ID from the group
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Group deletion result
   */
  async deleteGroupRequest(requestId, userId) {
    const request = await this.requestService.getRequestById(requestId, userId);

    if (!request.groupId) {
      const error = new Error('This is not a group request');
      error.statusCode = 400;
      throw error;
    }

    // Get all requests in the group
    const groupRequests = await TimeOffRequest.getByGroupIdAndUser(
      request.groupId,
      userId
    );

    if (groupRequests.length === 0) {
      const error = new Error('No requests found in this group');
      error.statusCode = 404;
      throw error;
    }

    // Check if group can be deleted
    const canDelete = this.canGroupBeDeleted(groupRequests);
    if (!canDelete.canDelete) {
      const error = new Error(
        'Cannot delete group: some requests have emails already sent'
      );
      error.statusCode = 400;
      error.details = `${canDelete.blockedCount} out of ${groupRequests.length} requests cannot be deleted`;
      throw error;
    }

    // Delete all requests in the group
    const deletePromises = groupRequests.map(req => req.destroy());
    await Promise.all(deletePromises);

    return {
      deletedCount: groupRequests.length,
      groupId: request.groupId,
      deletedRequestIds: groupRequests.map(req => req.id),
      message: `Group request deleted successfully`,
    };
  }

  /**
   * Get detailed information about a group
   * @param {number} requestId - Any request ID from the group
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Group details
   */
  async getGroupDetails(requestId, userId) {
    const request = await this.requestService.getRequestById(requestId, userId);

    if (!request.groupId) {
      // If it's not a group request, return just this request
      return {
        groupId: null,
        requests: [request.toJSON()],
        totalRequests: 1,
        statusSummary: this.calculateStatusSummary([request]),
      };
    }

    // Get all requests in the group
    const groupRequests = await TimeOffRequest.getByGroupIdAndUser(
      request.groupId,
      userId
    );

    // Sort by date
    groupRequests.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    return {
      groupId: request.groupId,
      requests: groupRequests.map(r => r.toJSON()),
      totalRequests: groupRequests.length,
      statusSummary: this.calculateStatusSummary(groupRequests),
    };
  }

  /**
   * Create a manual group request (with email already sent)
   * @param {number} userId - User ID
   * @param {Array} datesArray - Array of date objects
   * @param {string} customMessage - Custom message
   * @param {Object} user - User instance
   * @returns {Promise<Object>} Manual group creation result
   */
  async createManualGroupRequest(userId, datesArray, customMessage, user) {
    // Ensure user is in manual mode
    if (user.emailPreference !== 'manual') {
      const error = new Error(
        'Manual request creation only available for users in manual email mode'
      );
      error.statusCode = 400;
      throw error;
    }

    // Validate input
    if (!datesArray || !Array.isArray(datesArray) || datesArray.length === 0) {
      const error = new Error('Invalid dates array');
      error.statusCode = 400;
      error.details =
        'Provide array of date objects with date, type, and optional flightNumber';
      throw error;
    }

    console.log('🔍 Creating manual group request with data:', {
      datesArray,
      customMessage,
      userPreference: user.emailPreference,
    });

    // Generate group ID for all requests
    const groupId = this.generateGroupId();

    // Create all requests in the group with manual email confirmed
    const requestPromises = datesArray.map(dateObj => {
      return TimeOffRequest.create({
        userId: userId,
        groupId,
        startDate: dateObj.date,
        endDate: dateObj.date,
        type: dateObj.type.toUpperCase(),
        flightNumber:
          dateObj.type.toUpperCase() === 'FLIGHT' ? dateObj.flightNumber : null,
        customMessage: customMessage || null,
        emailMode: 'manual',
        manualEmailConfirmed: true,
        manualEmailConfirmedAt: new Date(),
      });
    });

    const createdRequests = await Promise.all(requestPromises);
    console.log(
      '✅ Created manual requests:',
      createdRequests.map(r => ({
        id: r.id,
        startDate: r.startDate,
        type: r.type,
        manualEmailConfirmed: r.manualEmailConfirmed,
      }))
    );

    return {
      groupId,
      requestCount: createdRequests.length,
      requests: createdRequests.map(r => r.toJSON()),
      message: `Group request created successfully with ${createdRequests.length} date(s). Email marked as sent.`,
    };
  }

  /**
   * Generate a unique group ID
   * @returns {string} Group ID
   */
  generateGroupId() {
    return uuidv4();
  }

  /**
   * Validate group dates array
   * @param {Array} datesArray - Array of date objects to validate
   * @returns {Object} Validation result
   */
  validateGroupDates(datesArray) {
    const errors = [];

    if (!Array.isArray(datesArray)) {
      errors.push('Dates must be an array');
      return { isValid: false, errors };
    }

    if (datesArray.length === 0) {
      errors.push('At least one date is required');
    }

    const maxDays = parseInt(process.env.MAX_DAYS_PER_REQUEST) || 4;
    if (datesArray.length > maxDays) {
      errors.push(`Maximum ${maxDays} dates allowed per request`);
    }

    // Validate each date object
    datesArray.forEach((dateObj, index) => {
      if (!dateObj.date) {
        errors.push(`Date is required for item ${index + 1}`);
      }

      if (!dateObj.type) {
        errors.push(`Type is required for item ${index + 1}`);
      }

      const validTypes = ['REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT'];
      if (dateObj.type && !validTypes.includes(dateObj.type.toUpperCase())) {
        errors.push(
          `Invalid type for item ${index + 1}. Must be one of: ${validTypes.join(', ')}`
        );
      }

      if (dateObj.type?.toUpperCase() === 'FLIGHT' && !dateObj.flightNumber) {
        errors.push(
          `Flight number is required for flight requests (item ${index + 1})`
        );
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if a group can be deleted
   * @param {Array} groupRequests - Array of group request instances
   * @returns {Object} Deletion check result
   */
  canGroupBeDeleted(groupRequests) {
    // Check if any request in the group cannot be deleted
    // Only check email status - if email sent, cannot delete
    const cannotDelete = groupRequests.filter(
      req => req.emailSent || req.manualEmailConfirmed
    );

    return {
      canDelete: cannotDelete.length === 0,
      blockedCount: cannotDelete.length,
      totalCount: groupRequests.length,
      blockedRequests: cannotDelete.map(req => ({
        id: req.id,
        reason: req.emailSent
          ? 'automatic_email_sent'
          : 'manual_email_confirmed',
      })),
    };
  }

  /**
   * Calculate status summary for a group of requests
   * @param {Array} requests - Array of request instances
   * @returns {Object} Status summary
   */
  calculateStatusSummary(requests) {
    return {
      pending: requests.filter(r => r.status === 'PENDING').length,
      approved: requests.filter(r => r.status === 'APPROVED').length,
      denied: requests.filter(r => r.status === 'DENIED').length,
    };
  }

  /**
   * Calculate group email status
   * @param {Array} requests - Array of request instances
   * @returns {Object} Group email status
   */
  calculateGroupEmailStatus(requests) {
    const emailStatuses = requests.map(req => req.getEmailStatus());
    const allSent = emailStatuses.every(
      status => status === 'sent' || status === 'confirmed'
    );
    const noneSent = emailStatuses.every(
      status => status === 'pending' || status === 'failed'
    );

    return {
      allSent,
      noneSent,
      partialSent: !allSent && !noneSent,
      sentCount: emailStatuses.filter(
        status => status === 'sent' || status === 'confirmed'
      ).length,
      totalCount: requests.length,
    };
  }

  /**
   * Get consecutive date validation
   * @param {Array} dates - Array of date strings
   * @returns {Object} Consecutive date validation result
   */
  validateConsecutiveDates(dates) {
    if (dates.length <= 1) {return { isConsecutive: true };}

    const sortedDates = dates.map(d => new Date(d)).sort((a, b) => a - b);

    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = sortedDates[i - 1];
      const currentDate = sortedDates[i];
      const dayDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);

      if (dayDiff !== 1) {
        return {
          isConsecutive: false,
          gap: `${dayDiff} days between ${prevDate.toISOString().split('T')[0]} and ${currentDate.toISOString().split('T')[0]}`,
        };
      }
    }

    return { isConsecutive: true };
  }
}

module.exports = GroupRequestService;
