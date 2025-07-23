// src/services/statusService.js - Request status management service
const { TimeOffRequest } = require('../models');

class StatusService {
  constructor(requestService, emailService) {
    this.requestService = requestService;
    this.emailService = emailService;
  }

  /**
   * Update request status with business logic validation
   * @param {number} requestId - Request ID
   * @param {number} userId - User ID
   * @param {string} status - New status (APPROVED, DENIED, PENDING)
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Status update result
   */
  async updateRequestStatus(requestId, userId, status, options = {}) {
    const { method = 'manual_user_update', updateGroup = false } = options;

    // Validate status
    if (!this.isValidStatus(status)) {
      const error = new Error('Invalid status');
      error.statusCode = 400;
      error.details = 'Status must be APPROVED, DENIED, or PENDING';
      throw error;
    }

    // Get the request
    const request = await this.requestService.getRequestById(requestId, userId);

    // Check if request can be updated
    if (!this.canStatusBeUpdated(request)) {
      const error = new Error('Cannot update status before email is sent');
      error.statusCode = 400;
      error.details = 'Please send the email first before updating the status';
      throw error;
    }

    // Determine which requests to update
    const requestsToUpdate = await this.getRequestsToUpdate(
      request,
      updateGroup
    );

    // Prepare update data
    const updateData = this.getStatusUpdateData(status, method);

    // Update all requests
    const updatePromises = requestsToUpdate.map(req => req.update(updateData));
    await Promise.all(updatePromises);

    return {
      updatedCount: requestsToUpdate.length,
      status: status,
      statusUpdatedAt: updateData.statusUpdatedAt,
      isGroup: request.groupId ? true : false,
      groupId: request.groupId,
      method: method,
      updateGroup: updateGroup,
      message: `Request${requestsToUpdate.length > 1 ? 's' : ''} marked as ${status.toLowerCase()} successfully`,
    };
  }

  /**
   * Update status for all requests in a group
   * @param {string} groupId - Group ID
   * @param {number} userId - User ID
   * @param {string} status - New status
   * @param {string} method - Update method
   * @returns {Promise<Object>} Group status update result
   */
  async updateGroupStatus(
    groupId,
    userId,
    status,
    method = 'manual_user_update'
  ) {
    // Validate status
    if (!this.isValidStatus(status)) {
      const error = new Error('Invalid status');
      error.statusCode = 400;
      throw error;
    }

    // Get all requests in the group
    const groupRequests = await TimeOffRequest.getByGroupIdAndUser(
      groupId,
      userId
    );

    if (groupRequests.length === 0) {
      const error = new Error('No requests found in this group');
      error.statusCode = 404;
      throw error;
    }

    // Check if all requests can be updated
    for (const request of groupRequests) {
      if (!this.canStatusBeUpdated(request)) {
        const error = new Error(
          'Cannot update group status: some requests have not sent emails yet'
        );
        error.statusCode = 400;
        throw error;
      }
    }

    // Prepare update data
    const updateData = this.getStatusUpdateData(status, method);

    // Update all requests in the group
    const updatePromises = groupRequests.map(req => req.update(updateData));
    await Promise.all(updatePromises);

    return {
      updatedCount: groupRequests.length,
      status: status,
      statusUpdatedAt: updateData.statusUpdatedAt,
      groupId: groupId,
      method: method,
      message: `All ${groupRequests.length} requests in group marked as ${status.toLowerCase()} successfully`,
    };
  }

  /**
   * Validate if a status update is allowed
   * @param {Object} request - Request instance
   * @param {string} newStatus - New status to validate
   * @returns {Object} Validation result
   */
  validateStatusUpdate(request, newStatus) {
    const issues = [];

    // Check if status is valid
    if (!this.isValidStatus(newStatus)) {
      issues.push('Invalid status value');
    }

    // Check if request can be updated
    if (!this.canStatusBeUpdated(request)) {
      issues.push('Email must be sent before status can be updated');
    }

    // Check if status change makes sense
    if (request.status === newStatus) {
      issues.push(`Request is already ${newStatus.toLowerCase()}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Check if a request's status can be updated
   * @param {Object} request - Request instance
   * @returns {boolean} Whether status can be updated
   */
  canStatusBeUpdated(request) {
    return this.checkEmailPrerequisites(request);
  }

  /**
   * Check if email prerequisites are met for status update
   * @param {Object} request - Request instance
   * @returns {boolean} Whether email prerequisites are met
   */
  checkEmailPrerequisites(request) {
    const requestEmailMode = request.emailMode || 'automatic';
    const emailSent =
      (requestEmailMode === 'automatic' && request.emailSent) ||
      (requestEmailMode === 'manual' && request.manualEmailConfirmed);

    return emailSent;
  }

  /**
   * Get status update data object
   * @param {string} status - New status
   * @param {string} method - Update method
   * @returns {Object} Update data object
   */
  getStatusUpdateData(status, method = 'manual_user_update') {
    const updateData = {
      status: status,
      statusUpdateMethod: method,
      statusUpdatedAt: new Date(),
    };

    // Set approval/denial dates based on status
    if (status === 'APPROVED') {
      updateData.approvalDate = new Date();
      updateData.denialReason = null;
    } else if (status === 'DENIED') {
      updateData.approvalDate = null;
      // Could add denialReason field here if needed
    } else if (status === 'PENDING') {
      // Reset both dates for pending
      updateData.approvalDate = null;
      updateData.denialReason = null;
    }

    return updateData;
  }

  /**
   * Get list of requests to update based on options
   * @param {Object} request - Base request
   * @param {boolean} updateGroup - Whether to update entire group
   * @returns {Promise<Array>} Array of requests to update
   */
  async getRequestsToUpdate(request, updateGroup = false) {
    let requestsToUpdate = [request];

    // If updateGroup is true and it's a group request, update all requests in the group
    if (updateGroup && request.groupId) {
      requestsToUpdate = await TimeOffRequest.getByGroupIdAndUser(
        request.groupId,
        request.userId
      );
    }

    return requestsToUpdate;
  }

  /**
   * Check if a status value is valid
   * @param {string} status - Status to validate
   * @returns {boolean} Whether status is valid
   */
  isValidStatus(status) {
    const validStatuses = ['APPROVED', 'DENIED', 'PENDING'];
    return validStatuses.includes(status);
  }

  /**
   * Get available status transitions for a request
   * @param {Object} request - Request instance
   * @returns {Array} Available status transitions
   */
  getAvailableStatusTransitions(request) {
    const currentStatus = request.status;
    const allStatuses = ['PENDING', 'APPROVED', 'DENIED'];

    // Return all statuses except current one
    return allStatuses.filter(status => status !== currentStatus);
  }

  /**
   * Get status history for a request
   * @param {Object} request - Request instance
   * @returns {Array} Status history
   */
  getStatusHistory(request) {
    const history = [];

    // Initial creation
    history.push({
      status: 'PENDING',
      date: request.createdAt,
      method: 'system',
      description: 'Request created',
    });

    // Status updates
    if (request.statusUpdatedAt && request.statusUpdateMethod) {
      history.push({
        status: request.status,
        date: request.statusUpdatedAt,
        method: request.statusUpdateMethod,
        description: `Status changed to ${request.status.toLowerCase()}`,
      });
    }

    // Approval date
    if (request.approvalDate) {
      history.push({
        status: 'APPROVED',
        date: request.approvalDate,
        method: request.statusUpdateMethod || 'manual',
        description: 'Request approved',
      });
    }

    return history.sort((a, b) => new Date(a.date) - new Date(b.date));
  }
}

module.exports = StatusService;
