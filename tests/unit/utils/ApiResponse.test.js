// tests/unit/utils/ApiResponse.test.js - Unit tests for ApiResponse utility

const ApiResponse = require('../../../src/utils/ApiResponse');

describe('ApiResponse', () => {
  // Mock Date.now to have consistent timestamps in tests
  const mockDate = new Date('2024-02-01T10:00:00.000Z');
  let originalDate;

  beforeAll(() => {
    originalDate = global.Date;
    global.Date = jest.fn(() => mockDate);
    global.Date.toISOString = originalDate.prototype.toISOString.bind(mockDate);
    // Keep other Date methods intact
    Object.setPrototypeOf(global.Date, originalDate);
    Object.getOwnPropertyNames(originalDate).forEach(name => {
      if (name !== 'constructor') {
        global.Date[name] = originalDate[name];
      }
    });
  });

  afterAll(() => {
    global.Date = originalDate;
  });

  describe('success', () => {
    it('should create a success response with default message', () => {
      const data = { id: 1, name: 'Test User' };
      const response = ApiResponse.success(data);

      expect(response).toEqual({
        success: true,
        message: 'Success',
        data: data,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should create a success response with custom message', () => {
      const data = { requests: [] };
      const message = 'Requests retrieved successfully';
      const response = ApiResponse.success(data, message);

      expect(response).toEqual({
        success: true,
        message: message,
        data: data,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle null data', () => {
      const response = ApiResponse.success(null, 'Operation completed');

      expect(response).toEqual({
        success: true,
        message: 'Operation completed',
        data: null,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle undefined data', () => {
      const response = ApiResponse.success(undefined, 'No data response');

      expect(response).toEqual({
        success: true,
        message: 'No data response',
        data: undefined,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle empty string data', () => {
      const response = ApiResponse.success('', 'Empty string response');

      expect(response).toEqual({
        success: true,
        message: 'Empty string response',
        data: '',
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle numeric data', () => {
      const response = ApiResponse.success(42, 'Numeric response');

      expect(response).toEqual({
        success: true,
        message: 'Numeric response',
        data: 42,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle boolean data', () => {
      const response = ApiResponse.success(true, 'Boolean response');

      expect(response).toEqual({
        success: true,
        message: 'Boolean response',
        data: true,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle array data', () => {
      const data = [1, 2, 3, 'test'];
      const response = ApiResponse.success(data, 'Array response');

      expect(response).toEqual({
        success: true,
        message: 'Array response',
        data: data,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle complex object data', () => {
      const data = {
        user: {
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
        settings: ['privacy', 'security'],
        metadata: {
          created: '2024-01-01',
          updated: '2024-02-01',
        },
      };

      const response = ApiResponse.success(data, 'Complex data response');

      expect(response).toEqual({
        success: true,
        message: 'Complex data response',
        data: data,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle empty object data', () => {
      const response = ApiResponse.success({}, 'Empty object response');

      expect(response).toEqual({
        success: true,
        message: 'Empty object response',
        data: {},
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle special characters in message', () => {
      const data = { test: true };
      const message = 'Success with special chars: !@#$%^&*()_+-=[]{}|;:\'\",./<>?';
      const response = ApiResponse.success(data, message);

      expect(response.message).toBe(message);
      expect(response.success).toBe(true);
    });

    it('should handle unicode characters in message', () => {
      const data = { test: true };
      const message = 'Успех! 成功! 🎉✅';
      const response = ApiResponse.success(data, message);

      expect(response.message).toBe(message);
      expect(response.success).toBe(true);
    });
  });

  describe('error', () => {
    it('should create an error response with default parameters', () => {
      const message = 'Something went wrong';
      const response = ApiResponse.error(message);

      expect(response).toEqual({
        success: false,
        error: message,
        details: null,
        statusCode: 400,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should create an error response with custom details', () => {
      const message = 'Validation failed';
      const details = {
        field: 'email',
        code: 'INVALID_EMAIL',
        suggestion: 'Please provide a valid email address',
      };
      const response = ApiResponse.error(message, details);

      expect(response).toEqual({
        success: false,
        error: message,
        details: details,
        statusCode: 400,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should create an error response with custom status code', () => {
      const message = 'User not found';
      const statusCode = 404;
      const response = ApiResponse.error(message, null, statusCode);

      expect(response).toEqual({
        success: false,
        error: message,
        details: null,
        statusCode: statusCode,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should create an error response with all custom parameters', () => {
      const message = 'Access denied';
      const details = {
        reason: 'Insufficient permissions',
        requiredRole: 'admin',
        userRole: 'user',
      };
      const statusCode = 403;
      const response = ApiResponse.error(message, details, statusCode);

      expect(response).toEqual({
        success: false,
        error: message,
        details: details,
        statusCode: statusCode,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle array details', () => {
      const message = 'Multiple validation errors';
      const details = [
        { field: 'email', message: 'Email is required' },
        { field: 'password', message: 'Password is too short' },
        { field: 'name', message: 'Name cannot be empty' },
      ];
      const response = ApiResponse.error(message, details, 422);

      expect(response).toEqual({
        success: false,
        error: message,
        details: details,
        statusCode: 422,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle string details', () => {
      const message = 'Database connection failed';
      const details = 'Connection timeout after 30 seconds';
      const response = ApiResponse.error(message, details, 500);

      expect(response).toEqual({
        success: false,
        error: message,
        details: details,
        statusCode: 500,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle numeric details', () => {
      const message = 'Rate limit exceeded';
      const details = 100; // requests per hour
      const response = ApiResponse.error(message, details, 429);

      expect(response).toEqual({
        success: false,
        error: message,
        details: details,
        statusCode: 429,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle boolean details', () => {
      const message = 'Feature unavailable';
      const details = false; // feature enabled status
      const response = ApiResponse.error(message, details, 503);

      expect(response).toEqual({
        success: false,
        error: message,
        details: details,
        statusCode: 503,
        timestamp: '2024-02-01T10:00:00.000Z',
      });
    });

    it('should handle various HTTP status codes', () => {
      const testCases = [
        { code: 400, name: 'Bad Request' },
        { code: 401, name: 'Unauthorized' },
        { code: 403, name: 'Forbidden' },
        { code: 404, name: 'Not Found' },
        { code: 422, name: 'Unprocessable Entity' },
        { code: 429, name: 'Too Many Requests' },
        { code: 500, name: 'Internal Server Error' },
        { code: 503, name: 'Service Unavailable' },
      ];

      testCases.forEach(({ code, name }) => {
        const response = ApiResponse.error(`Error: ${name}`, null, code);
        expect(response.statusCode).toBe(code);
        expect(response.success).toBe(false);
        expect(response.error).toBe(`Error: ${name}`);
      });
    });

    it('should handle special characters in error message', () => {
      const message = 'Error with special chars: !@#$%^&*()_+-=[]{}|;:\'\",./<>?';
      const response = ApiResponse.error(message);

      expect(response.error).toBe(message);
      expect(response.success).toBe(false);
    });

    it('should handle unicode characters in error message', () => {
      const message = 'Ошибка! エラー! 🚫❌';
      const response = ApiResponse.error(message);

      expect(response.error).toBe(message);
      expect(response.success).toBe(false);
    });

    it('should handle empty string message', () => {
      const response = ApiResponse.error('');

      expect(response.error).toBe('');
      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(400);
    });
  });

  describe('Static class behavior', () => {
    it('should be a class with static methods only', () => {
      expect(typeof ApiResponse).toBe('function');
      expect(typeof ApiResponse.success).toBe('function');
      expect(typeof ApiResponse.error).toBe('function');
    });

    it('should not be instantiable (no meaningful instance methods)', () => {
      // Creating an instance should work but have no useful methods
      const instance = new ApiResponse();
      expect(instance).toBeInstanceOf(ApiResponse);
      expect(typeof instance.success).toBe('undefined');
      expect(typeof instance.error).toBe('undefined');
    });

    it('should have consistent method signatures', () => {
      // success method has 1 required parameter (data), message has default
      expect(ApiResponse.success.length).toBe(1);
      
      // error method has 1 required parameter (message), details and statusCode have defaults
      expect(ApiResponse.error.length).toBe(1);
    });
  });

  describe('Response structure consistency', () => {
    it('should always include required fields in success responses', () => {
      const response = ApiResponse.success('test data', 'test message');
      
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('timestamp');
      
      expect(Object.keys(response)).toHaveLength(4);
    });

    it('should always include required fields in error responses', () => {
      const response = ApiResponse.error('test error', 'test details', 500);
      
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('error');
      expect(response).toHaveProperty('details');
      expect(response).toHaveProperty('statusCode');
      expect(response).toHaveProperty('timestamp');
      
      expect(Object.keys(response)).toHaveLength(5);
    });

    it('should have different structures for success and error', () => {
      const successResponse = ApiResponse.success('data');
      const errorResponse = ApiResponse.error('error');

      // Success should have message and data, not error, details, statusCode
      expect(successResponse).toHaveProperty('message');
      expect(successResponse).toHaveProperty('data');
      expect(successResponse).not.toHaveProperty('error');
      expect(successResponse).not.toHaveProperty('details');
      expect(successResponse).not.toHaveProperty('statusCode');

      // Error should have error, details, statusCode, not message and data
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('details');
      expect(errorResponse).toHaveProperty('statusCode');
      expect(errorResponse).not.toHaveProperty('message');
      expect(errorResponse).not.toHaveProperty('data');
    });

    it('should have correct success flag values', () => {
      const successResponse = ApiResponse.success('data');
      const errorResponse = ApiResponse.error('error');

      expect(successResponse.success).toBe(true);
      expect(errorResponse.success).toBe(false);
    });
  });

  describe('Real-world usage scenarios', () => {
    it('should handle user authentication success', () => {
      const userData = {
        id: 'user123',
        email: 'user@tuifly.com',
        name: 'John Pilot',
        role: 'pilot',
        lastLogin: '2024-02-01T09:30:00.000Z',
      };

      const response = ApiResponse.success(userData, 'Authentication successful');

      expect(response.success).toBe(true);
      expect(response.data).toEqual(userData);
      expect(response.message).toBe('Authentication successful');
    });

    it('should handle validation errors', () => {
      const validationErrors = [
        { field: 'startDate', message: 'Start date is required' },
        { field: 'endDate', message: 'End date must be after start date' },
        { field: 'type', message: 'Request type is invalid' },
      ];

      const response = ApiResponse.error(
        'Validation failed',
        validationErrors,
        422
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Validation failed');
      expect(response.details).toEqual(validationErrors);
      expect(response.statusCode).toBe(422);
    });

    it('should handle time-off request creation', () => {
      const requestData = {
        id: 'req_456',
        userId: 'user123',
        startDate: '2024-03-15',
        endDate: '2024-03-17',
        type: 'REQ_DO',
        status: 'PENDING',
        emailSent: true,
        createdAt: '2024-02-01T10:00:00.000Z',
      };

      const response = ApiResponse.success(
        requestData,
        'Time-off request created successfully'
      );

      expect(response.success).toBe(true);
      expect(response.data.id).toBe('req_456');
      expect(response.message).toBe('Time-off request created successfully');
    });

    it('should handle server errors', () => {
      const errorDetails = {
        code: 'DATABASE_CONNECTION_FAILED',
        timestamp: '2024-02-01T10:00:00.000Z',
        service: 'postgresql',
        retryAfter: 300,
      };

      const response = ApiResponse.error(
        'Internal server error',
        errorDetails,
        500
      );

      expect(response.success).toBe(false);
      expect(response.error).toBe('Internal server error');
      expect(response.details.code).toBe('DATABASE_CONNECTION_FAILED');
      expect(response.statusCode).toBe(500);
    });

    it('should handle empty list responses', () => {
      const response = ApiResponse.success([], 'No requests found');

      expect(response.success).toBe(true);
      expect(response.data).toEqual([]);
      expect(response.message).toBe('No requests found');
    });

    it('should handle pagination responses', () => {
      const paginatedData = {
        items: [
          { id: 1, name: 'Request 1' },
          { id: 2, name: 'Request 2' },
        ],
        pagination: {
          page: 1,
          perPage: 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      const response = ApiResponse.success(
        paginatedData,
        'Requests retrieved successfully'
      );

      expect(response.success).toBe(true);
      expect(response.data.items).toHaveLength(2);
      expect(response.data.pagination.total).toBe(2);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle extremely long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const response = ApiResponse.success('data', longMessage);

      expect(response.message).toBe(longMessage);
      expect(response.message).toHaveLength(10000);
    });

    it('should handle circular reference in data (JSON serialization)', () => {
      const circularData = { name: 'test' };
      circularData.self = circularData;

      // This should not throw an error when creating the response
      const response = ApiResponse.success(circularData, 'Circular data');

      expect(response.success).toBe(true);
      expect(response.data).toBe(circularData);
      // Note: JSON.stringify would fail, but that's a serialization concern, not ApiResponse
    });

    it('should preserve data types', () => {
      const testData = {
        string: 'test',
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        array: [1, 2, 3],
        object: { nested: true },
        date: new Date('2024-01-01'),
      };

      const response = ApiResponse.success(testData);

      expect(typeof response.data.string).toBe('string');
      expect(typeof response.data.number).toBe('number');
      expect(typeof response.data.boolean).toBe('boolean');
      expect(response.data.null).toBeNull();
      expect(response.data.undefined).toBeUndefined();
      expect(Array.isArray(response.data.array)).toBe(true);
      expect(typeof response.data.object).toBe('object');
      expect(response.data.date).toBeInstanceOf(Date);
    });
  });
});