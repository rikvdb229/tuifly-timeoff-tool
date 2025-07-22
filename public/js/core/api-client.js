/**
 * TUIfly Time-Off Tool - API Client
 * Centralized HTTP client with standardized error handling and request/response processing
 */

class APIClient {
  constructor() {
    this.baseURL = '';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
    this.timeout = 30000; // 30 seconds default timeout
  }

  /**
   * Create a fetch request with standard configuration
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  async createRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: { ...this.defaultHeaders, ...options.headers },
      ...options,
    };

    // Add timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    config.signal = controller.signal;

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new APIError('Request timeout', 408, 'TIMEOUT');
      }
      throw error;
    }
  }

  /**
   * Process API response and handle errors
   * @param {Response} response - Fetch response
   * @returns {Promise<any>}
   */
  async processResponse(response) {
    const contentType = response.headers.get('content-type');
    const isJSON = contentType && contentType.includes('application/json');

    let data;
    try {
      data = isJSON ? await response.json() : await response.text();
    } catch (error) {
      throw new APIError('Invalid response format', response.status, 'PARSE_ERROR');
    }

    if (!response.ok) {
      const message = isJSON && data.error ? data.error : `HTTP ${response.status}: ${response.statusText}`;
      const code = isJSON && data.code ? data.code : 'HTTP_ERROR';
      throw new APIError(message, response.status, code, data);
    }

    return data;
  }

  /**
   * GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  async get(endpoint, options = {}) {
    try {
      const response = await this.createRequest(endpoint, {
        method: 'GET',
        ...options,
      });
      return await this.processResponse(response);
    } catch (error) {
      throw this.handleError(error, 'GET', endpoint);
    }
  }

  /**
   * POST request
   * @param {string} endpoint - API endpoint
   * @param {any} data - Request body data
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  async post(endpoint, data = null, options = {}) {
    try {
      const response = await this.createRequest(endpoint, {
        method: 'POST',
        body: data ? JSON.stringify(data) : null,
        ...options,
      });
      return await this.processResponse(response);
    } catch (error) {
      throw this.handleError(error, 'POST', endpoint);
    }
  }

  /**
   * PUT request
   * @param {string} endpoint - API endpoint
   * @param {any} data - Request body data
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  async put(endpoint, data = null, options = {}) {
    try {
      const response = await this.createRequest(endpoint, {
        method: 'PUT',
        body: data ? JSON.stringify(data) : null,
        ...options,
      });
      return await this.processResponse(response);
    } catch (error) {
      throw this.handleError(error, 'PUT', endpoint);
    }
  }

  /**
   * DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Additional fetch options
   * @returns {Promise<any>}
   */
  async delete(endpoint, options = {}) {
    try {
      const response = await this.createRequest(endpoint, {
        method: 'DELETE',
        ...options,
      });
      return await this.processResponse(response);
    } catch (error) {
      throw this.handleError(error, 'DELETE', endpoint);
    }
  }

  /**
   * Handle and normalize errors
   * @param {Error} error - Original error
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @returns {APIError}
   */
  handleError(error, method, endpoint) {
    if (error instanceof APIError) {
      return error;
    }

    // Network or other fetch errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new APIError('Network connection failed', 0, 'NETWORK_ERROR');
    }

    if (error.name === 'AbortError') {
      return new APIError('Request timeout', 408, 'TIMEOUT');
    }

    // Generic error
    console.error(`API ${method} ${endpoint} failed:`, error);
    return new APIError('Request failed', 500, 'UNKNOWN_ERROR', { originalError: error.message });
  }

  /**
   * Set default authorization header
   * @param {string} token - Authorization token
   */
  setAuthToken(token) {
    if (token) {
      this.defaultHeaders.Authorization = `Bearer ${token}`;
    } else {
      delete this.defaultHeaders.Authorization;
    }
  }

  /**
   * Set custom timeout
   * @param {number} ms - Timeout in milliseconds
   */
  setTimeout(ms) {
    this.timeout = ms;
  }

  /**
   * Add custom header
   * @param {string} name - Header name
   * @param {string} value - Header value
   */
  setHeader(name, value) {
    this.defaultHeaders[name] = value;
  }

  /**
   * Remove custom header
   * @param {string} name - Header name
   */
  removeHeader(name) {
    delete this.defaultHeaders[name];
  }
}

/**
 * Custom API Error class
 */
class APIError extends Error {
  constructor(message, status = 500, code = 'API_ERROR', data = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.data = data;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Check if error is a specific type
   * @param {string} code - Error code to check
   * @returns {boolean}
   */
  is(code) {
    return this.code === code;
  }

  /**
   * Check if error is a client error (4xx)
   * @returns {boolean}
   */
  isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * Check if error is a server error (5xx)
   * @returns {boolean}
   */
  isServerError() {
    return this.status >= 500;
  }

  /**
   * Get user-friendly error message
   * @returns {string}
   */
  getUserMessage() {
    switch (this.code) {
      case 'NETWORK_ERROR':
        return 'Unable to connect to the server. Please check your internet connection.';
      case 'TIMEOUT':
        return 'The request took too long to complete. Please try again.';
      case 'UNAUTHORIZED':
        return 'You need to log in to perform this action.';
      case 'FORBIDDEN':
        return 'You don\'t have permission to perform this action.';
      case 'NOT_FOUND':
        return 'The requested resource was not found.';
      case 'VALIDATION_ERROR':
        return 'Please check your input and try again.';
      default:
        return this.message || 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Convert to plain object for logging
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      data: this.data,
      timestamp: this.timestamp,
    };
  }
}

// Create and export singleton instance
const apiClient = new APIClient();

// Make classes available globally for backwards compatibility
window.APIClient = APIClient;
window.APIError = APIError;
window.apiClient = apiClient;

export { APIClient, APIError, apiClient as default };