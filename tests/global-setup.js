// tests/global-setup.js - Global test setup
module.exports = async () => {
  console.log('🧪 Global test setup started');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce logging during tests

  console.log('✅ Global test setup completed');
};
