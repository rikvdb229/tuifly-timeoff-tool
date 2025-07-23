// src/services/requestService.js - Request management service
const { TimeOffRequest, User } = require('../models');

class RequestService {
  constructor(userService) {
    this.userService = userService;
  }

  /**
   * Create a new time-off request
   * @param {number} userId - User ID
   * @param {Object} requestData - Request data
   * @returns {Promise<Object>} Created request with email response
   */
  async createRequest(userId, requestData) {
    const { startDate, endDate, type, flightNumber, customMessage } =
      requestData;

    // Basic validation
    if (!startDate || !endDate || !type) {
      const error = new Error('Missing required fields');
      error.statusCode = 400;
      error.details = [
        { field: 'startDate', message: 'Start date is required' },
        { field: 'endDate', message: 'End date is required' },
        { field: 'type', message: 'Request type is required' },
      ];
      throw error;
    }

    // Create the request
    const request = await TimeOffRequest.createForUser(userId, {
      startDate,
      endDate,
      type,
      flightNumber: flightNumber || null,
      customMessage: customMessage || null,
    });

    return {
      request,
      message: 'Request created successfully',
    };
  }

  /**
   * Get a specific request by ID for a user
   * @param {number} requestId - Request ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Request data
   */
  async getRequestById(requestId, userId) {
    const request = await TimeOffRequest.findByPkAndUser(requestId, userId);

    if (!request) {
      const error = new Error('Request not found');
      error.statusCode = 404;
      throw error;
    }

    return request;
  }

  /**
   * Get all requests for a user with optional filtering
   * @param {number} userId - User ID
   * @param {Object} options - Query options (status, limit, offset)
   * @returns {Promise<Object>} Requests data
   */
  async getUserRequests(userId, options = {}) {
    const { status, limit, offset } = options;

    const queryOptions = {
      include: [
        {
          model: User,
          attributes: ['name', 'code', 'emailPreference'],
        },
      ],
      order: [['createdAt', 'DESC']],
    };

    // Add status filter if provided
    if (status) {
      queryOptions.where = { status: status.toUpperCase() };
    }

    // Add pagination if provided
    if (limit) {
      queryOptions.limit = parseInt(limit);
    }
    if (offset) {
      queryOptions.offset = parseInt(offset);
    }

    const requests = await TimeOffRequest.findAllByUser(userId, queryOptions);

    // Enhance each request with email status information
    const enhancedRequests = requests.map(request => {
      return this.enhanceRequestWithEmailStatus(request);
    });

    return {
      requests: enhancedRequests,
      count: enhancedRequests.length,
    };
  }

  /**
   * Update a request
   * @param {number} requestId - Request ID
   * @param {number} userId - User ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated request
   */
  async updateRequest(requestId, userId, updates) {
    const request = await this.getRequestById(requestId, userId);

    if (!this.canRequestBeEdited(request)) {
      const error = new Error('Request cannot be edited');
      error.statusCode = 403;
      throw error;
    }

    const { startDate, endDate, type, status, flightNumber, customMessage } =
      updates;

    // Build updates object
    const updateData = {};
    if (startDate) {updateData.startDate = startDate;}
    if (endDate) {updateData.endDate = endDate;}
    if (type) {updateData.type = type;}
    if (status && ['PENDING', 'APPROVED', 'DENIED'].includes(status)) {
      updateData.status = status;
      if (status !== 'PENDING') {
        updateData.approvalDate = new Date();
      }
    }
    if (flightNumber !== undefined) {updateData.flightNumber = flightNumber;}
    if (customMessage !== undefined) {updateData.customMessage = customMessage;}

    await request.update(updateData);

    return {
      request,
      message: 'Time-off request updated successfully',
    };
  }

  /**
   * Delete a request
   * @param {number} requestId - Request ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteRequest(requestId, userId) {
    if (isNaN(requestId)) {
      const error = new Error('Invalid request ID');
      error.statusCode = 400;
      throw error;
    }

    const request = await this.getRequestById(requestId, userId);

    if (!this.canRequestBeDeleted(request)) {
      const error = new Error(
        'Cannot delete request: email has already been sent'
      );
      error.statusCode = 403;
      throw error;
    }

    await request.destroy();

    return {
      id: requestId,
      message: 'Request deleted successfully',
    };
  }

  /**
   * Check for date conflicts
   * @param {number} userId - User ID
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {string} excludeGroupId - Group ID to exclude from conflict check
   * @returns {Promise<Object>} Conflict data
   */
  async checkDateConflicts(userId, startDate, endDate, excludeGroupId) {
    if (!startDate || !endDate) {
      const error = new Error('startDate and endDate are required');
      error.statusCode = 400;
      throw error;
    }

    const conflicts = await TimeOffRequest.getConflictsForUser(
      userId,
      startDate,
      endDate,
      excludeGroupId
    );

    return {
      conflicts,
      hasConflicts: conflicts.length > 0,
    };
  }

  /**
   * Get request statistics for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Statistics data
   */
  async getRequestStatistics(userId) {
    const stats = await TimeOffRequest.getStatusCountsForUser(userId);
    return stats;
  }

  /**
   * Enhance request with email status information
   * @param {Object} request - Request instance
   * @returns {Object} Enhanced request data
   */
  enhanceRequestWithEmailStatus(request) {
    const requestData = request.toJSON();
    return {
      ...requestData,
      emailStatus: request.getEmailStatus(),
      emailStatusIcon: request.getEmailStatusIcon(),
      emailStatusLabel: request.getEmailStatusLabel(),
      canManualEmailBeSent: request.canManualEmailBeSent(),
      isEmailSent: request.isEmailSent(),
      hasReply: request.hasReply(),
    };
  }

  /**
   * Check if a request can be deleted
   * @param {Object} request - Request instance
   * @returns {boolean} Whether request can be deleted
   */
  canRequestBeDeleted(request) {
    return request.canBeDeleted();
  }

  /**
   * Check if a request can be edited
   * @param {Object} request - Request instance
   * @returns {boolean} Whether request can be edited
   */
  canRequestBeEdited(request) {
    return request.isEditable();
  }

  /**
   * Check if request email has been sent
   * @param {Object} request - Request instance
   * @returns {boolean} Whether email has been sent
   */
  isRequestEmailSent(request) {
    return request.isEmailSent();
  }

  /**
   * Validate request data
   * @param {Object} requestData - Request data to validate
   * @returns {Object} Validation result
   */
  validateRequestData(requestData) {
    const errors = [];

    if (!requestData.startDate) {
      errors.push({ field: 'startDate', message: 'Start date is required' });
    }

    if (!requestData.endDate) {
      errors.push({ field: 'endDate', message: 'End date is required' });
    }

    if (!requestData.type) {
      errors.push({ field: 'type', message: 'Request type is required' });
    }

    if (requestData.type === 'FLIGHT' && !requestData.flightNumber) {
      errors.push({
        field: 'flightNumber',
        message: 'Flight number is required for flight requests',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

module.exports = RequestService;
