// tests/setup.js - Jest setup configuration
require('dotenv').config({ path: '.env.test' });

// Increase timeout for database operations
jest.setTimeout(30000);

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  // Uncomment to silence console.log during tests
  // log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Helper to create test user data
  createTestUser: (overrides = {}) => ({
    googleId: 'test_google_id',
    email: 'test@tuifly.com',
    name: 'Test User',
    code: 'TST',
    isAdmin: false,
    emailPreference: 'manual',
    gmailScopeGranted: false,
    gmailAccessToken: null,
    gmailRefreshToken: null,
    ...overrides,
  }),

  // Helper to create test request data
  createTestRequest: (overrides = {}) => ({
    startDate: new Date('2024-02-01'),
    endDate: new Date('2024-02-01'),
    type: 'REQ_DO',
    customMessage: 'Test request',
    status: 'PENDING',
    ...overrides,
  }),

  // Helper to create test group request data
  createTestGroupRequest: (overrides = {}) => ({
    dates: [
      {
        date: '2024-02-01',
        type: 'REQ_DO',
      },
      {
        date: '2024-02-02',
        type: 'REQ_DO',
      },
    ],
    customMessage: 'Test group request',
    ...overrides,
  }),

  // Helper to wait for async operations
  delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.TOKEN_ENCRYPTION_KEY = 'test-key-32-chars-for-aes-256-enc';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.TUIFLY_APPROVER_EMAIL = 'test-approver@tuifly.com';
