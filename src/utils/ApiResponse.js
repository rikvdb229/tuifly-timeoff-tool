/**
 * TUIfly Time-Off Tool - API Response Utilities
 * Standardized response format for all API endpoints
 */

class ApiResponse {
  /**
   * Create a successful API response
   * @param {*} data - The response data
   * @param {string} message - Success message
   * @returns {Object} Standardized success response
   */
  static success(data, message = 'Success') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Create an error API response
   * @param {string} message - Error message
   * @param {*} details - Additional error details
   * @param {number} statusCode - HTTP status code
   * @returns {Object} Standardized error response
   */
  static error(message, details = null, statusCode = 400) {
    return {
      success: false,
      error: message,
      details,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ApiResponse;