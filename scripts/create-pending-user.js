/**
 * Create a test user that needs admin approval
 */

require('dotenv').config();
const { initializeDatabase } = require('../config/database');
const { User } = require('../src/models');
const { logger } = require('../src/utils/logger');

async function createPendingUser() {
  try {
    logger.info('Creating test pending user...');
    
    // Initialize database
    await initializeDatabase();
    
    // Delete existing test user if exists
    await User.destroy({
      where: { email: 'test.pending@tuifly.com' }
    });
    
    // Create new pending user
    const testUser = await User.create({
      googleId: 'test_pending_' + Date.now(),
      email: 'test.pending@tuifly.com',
      name: 'Test Pending User',
      code: 'TPU',
      signature: 'Test Pending User - TPU',
      onboardedAt: new Date(),
      adminApproved: false, // This is the key - not approved yet
      isAdmin: false,
      emailPreference: 'manual',
      gmailScopeGranted: false,
      isActive: true
    });
    
    logger.info('✅ Created test pending user:', { 
      id: testUser.id,
      email: testUser.email,
      name: testUser.name,
      adminApproved: testUser.adminApproved,
      onboardedAt: testUser.onboardedAt 
    });
    
    // Verify the user shows up in pending approvals
    const pendingUsers = await User.getPendingApprovals();
    logger.info(`📊 Total pending approvals: ${pendingUsers.length}`);
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Error creating pending user:', error);
    process.exit(1);
  }
}

createPendingUser();