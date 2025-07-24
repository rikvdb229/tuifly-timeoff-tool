// src/routes/admin.js
const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');
const { routeLogger } = require('../utils/logger');
const {
  getAllUsers,
  approveUser,
  makeUserAdmin,
  getPendingApprovals,
} = require('../models');

const router = express.Router();

// Admin-only middleware
const requireAdmin = async (req, res, next) => {
  if (!req.user || (!req.user.isAdmin && req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return res.status(403).render('pages/error', {
      title: 'Access Denied',
      message: 'Admin access required',
      statusCode: 403
    });
  }
  next();
};

// Super Admin-only middleware
const requireSuperAdmin = async (req, res, next) => {
  if (!req.user || !req.user.isSuperAdmin()) {
    return res.status(403).json({
      success: false,
      error: 'Super Admin access required',
    });
  }
  next();
};

// Apply middleware
router.use(requireAuth);
router.use(requireOnboarding);
router.use(requireAdmin);

// Main Admin Panel (unified entry point)
router.get('/panel', (req, res) => {
  res.render('pages/admin-panel', {
    title: 'Admin Panel',
    user: req.user
  });
});

// Redirect old routes to new panel
router.get('/roster', (req, res) => {
  res.redirect('/admin/panel');
});

router.get('/users', (req, res) => {
  res.redirect('/admin/panel');
});

// API Routes for Admin Panel

// Get all users
router.get('/api/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'fetchUsers', endpoint: '/admin/api/users' });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// Get pending approvals
router.get('/api/pending-approvals', async (req, res) => {
  try {
    console.log('DEBUG: Fetching pending approvals...');
    const pendingUsers = await getPendingApprovals();
    console.log('DEBUG: Found pending users:', pendingUsers.length);
    
    // Also check all users to see what's in the database
    const allUsers = await getAllUsers();
    const unapprovedUsers = allUsers.filter(user => !user.adminApproved);
    console.log('DEBUG: All users count:', allUsers.length);
    console.log('DEBUG: All users details:', allUsers.map(u => ({
      id: u.id,
      email: u.email,
      isAdmin: u.isAdmin,
      adminApproved: u.adminApproved,
      onboardedAt: u.onboardedAt ? u.onboardedAt.toISOString() : null
    })));
    console.log('DEBUG: Unapproved users count:', unapprovedUsers.length);
    console.log('DEBUG: Unapproved users details:', unapprovedUsers.map(u => ({
      id: u.id,
      email: u.email,
      isAdmin: u.isAdmin,
      adminApproved: u.adminApproved,
      onboardedAt: u.onboardedAt ? u.onboardedAt.toISOString() : null
    })));
    
    res.json({
      success: true,
      data: pendingUsers
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'fetchPendingApprovals', endpoint: '/admin/api/pending-approvals' });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending approvals'
    });
  }
});

// Approve user
router.post('/api/users/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    await approveUser(req.user.id, id);
    res.json({
      success: true,
      message: 'User approved successfully'
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'approveUser', endpoint: '/admin/api/users/:id/approve' });
    res.status(500).json({
      success: false,
      error: 'Failed to approve user'
    });
  }
});

// Update user role (Super Admin only for some roles)
router.put('/api/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    // Only super admins can create other super admins
    if (role === 'superadmin' && !req.user.isSuperAdmin()) {
      return res.status(403).json({
        success: false,
        error: 'Only Super Admins can create other Super Admins'
      });
    }
    
    // Update user role based on the role parameter
    const { User } = require('../models');
    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    switch (role) {
      case 'user':
        user.isAdmin = false;
        user.role = 'user';
        break;
      case 'admin':
        user.isAdmin = true;
        user.role = 'admin';
        break;
      case 'superadmin':
        user.isAdmin = true;
        user.role = 'superadmin';
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid role specified'
        });
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'User role updated successfully'
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'updateUserRole', endpoint: '/admin/api/users/:id/role' });
    res.status(500).json({
      success: false,
      error: 'Failed to update user role'
    });
  }
});

// Delete user
router.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { User } = require('../models');
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Prevent deleting yourself
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }
    
    await user.destroy();
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'deleteUser', endpoint: '/admin/api/users/:id' });
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

// Roster management endpoints (Super Admin only)
router.get('/api/rosters', requireSuperAdmin, async (req, res) => {
  try {
    const { RosterSchedule } = require('../models');
    const rosters = await RosterSchedule.findAll({
      order: [['startPeriod', 'DESC']] // Sort from new to old
    });
    
    // Add deadline status flags
    const today = new Date().toISOString().split('T')[0];
    const rostersWithFlags = rosters.map(roster => {
      const rosterData = roster.toJSON();
      rosterData.deadlineStatus = rosterData.latestRequestDate < today ? 'passed' : 'upcoming';
      return rosterData;
    });
    
    res.json({
      success: true,
      data: rostersWithFlags
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'fetchRosters', endpoint: '/admin/api/rosters' });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rosters'
    });
  }
});

router.post('/api/rosters', requireSuperAdmin, async (req, res) => {
  try {
    const { RosterSchedule } = require('../models');
    const roster = await RosterSchedule.create(req.body);
    
    res.json({
      success: true,
      data: roster,
      message: 'Roster schedule created successfully'
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'createRoster', endpoint: '/admin/api/rosters' });
    res.status(500).json({
      success: false,
      error: 'Failed to create roster schedule'
    });
  }
});

router.put('/api/rosters/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { RosterSchedule } = require('../models');
    const roster = await RosterSchedule.findByPk(req.params.id);
    
    if (!roster) {
      return res.status(404).json({
        success: false,
        error: 'Roster schedule not found'
      });
    }
    
    await roster.update(req.body);
    
    res.json({
      success: true,
      data: roster,
      message: 'Roster schedule updated successfully'
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'updateRoster', endpoint: '/admin/api/rosters/:id' });
    res.status(500).json({
      success: false,
      error: 'Failed to update roster schedule'
    });
  }
});

router.delete('/api/rosters/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { RosterSchedule } = require('../models');
    const roster = await RosterSchedule.findByPk(req.params.id);
    
    if (!roster) {
      return res.status(404).json({
        success: false,
        error: 'Roster schedule not found'
      });
    }
    
    await roster.destroy();
    
    res.json({
      success: true,
      message: 'Roster schedule deleted successfully'
    });
  } catch (error) {
    routeLogger.logError(error, { operation: 'deleteRoster', endpoint: '/admin/api/rosters/:id' });
    res.status(500).json({
      success: false,
      error: 'Failed to delete roster schedule'
    });
  }
});

// System settings endpoints (Super Admin only)
router.get('/api/settings', requireSuperAdmin, (req, res) => {
  // Return current system settings
  res.json({
    success: true,
    data: {
      maxAdvanceDays: process.env.MAX_ADVANCE_DAYS || 180,
      maxDaysPerRequest: process.env.MAX_DAYS_PER_REQUEST || 4,
      approverEmail: process.env.TUIFLY_APPROVER_EMAIL || process.env.APPROVER_EMAIL || 'scheduling@tuifly.com'
    }
  });
});

router.put('/api/settings', requireSuperAdmin, (req, res) => {
  // In a real implementation, you'd save these to a database or environment
  // For now, just return success
  res.json({
    success: true,
    message: 'Settings updated successfully'
  });
});

// Legacy HTML response for backward compatibility
router.get('/users-legacy', async (req, res) => {
  try {
    const [allUsers, pendingUsers] = await Promise.all([
      getAllUsers(),
      getPendingApprovals(),
    ]);

    // Simple HTML response for testing
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Panel - User Management</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
      <div class="container mt-4">
        <h1>Admin Panel - User Management</h1>
        <p>Welcome, ${req.user.name || req.user.email}</p>
        
        <div class="row">
          <div class="col-md-6">
            <div class="card">
              <div class="card-header bg-warning">
                <h5>Pending Approvals (${pendingUsers.length})</h5>
              </div>
              <div class="card-body">
                ${
                  pendingUsers.length === 0
                    ? '<p>No pending approvals</p>'
                    : pendingUsers
                        .map(
                          user => `
                    <div class="border p-3 mb-2">
                      <h6>${user.name || 'No name set'}</h6>
                      <p class="mb-1"><strong>Email:</strong> ${user.email}</p>
                      <p class="mb-1"><strong>Code:</strong> ${user.code || 'Not set'}</p>
                      <p class="mb-1"><strong>Registered:</strong> ${new Date(user.createdAt).toLocaleDateString()}</p>
                      <div class="mt-2">
                        <button class="btn btn-success btn-sm" onclick="approveUser(${user.id})">Approve</button>
                        <button class="btn btn-danger btn-sm ms-2" onclick="denyUser(${user.id})">Deny</button>
                      </div>
                    </div>
                  `
                        )
                        .join('')
                }
              </div>
            </div>
          </div>
          
          <div class="col-md-6">
            <div class="card">
              <div class="card-header bg-info">
                <h5>All Users (${allUsers.length})</h5>
              </div>
              <div class="card-body" style="max-height: 500px; overflow-y: auto;">
                ${allUsers
                  .map(
                    user => `
                  <div class="border p-2 mb-1">
                    <h6 class="mb-0">${user.name || user.email}</h6>
                    <small class="text-muted">
                      ${user.email} • 
                      ${user.isAdmin ? '👑 Admin' : '👤 User'} • 
                      ${user.adminApproved ? '✅ Approved' : '⏳ Pending'}
                    </small>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </div>
        
        <div class="mt-3">
          <a href="/" class="btn btn-primary">Back to Dashboard</a>
        </div>
      </div>

      <script>
        async function approveUser(userId) {
          try {
            const response = await fetch(\`/admin/users/\${userId}/approve\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              }
            });
            
            const result = await response.json();
            
            if (result.success) {
              alert('User approved successfully!');
              location.reload();
            } else {
              alert('Error: ' + result.error);
            }
          } catch (error) {
            alert('Error approving user: ' + error.message);
          }
        }
        
        async function denyUser(userId) {
          if (confirm('Are you sure you want to deny this user?')) {
            try {
              const response = await fetch(\`/admin/users/\${userId}/deny\`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                }
              });
              
              const result = await response.json();
              
              if (result.success) {
                alert('User denied successfully!');
                location.reload();
              } else {
                alert('Error: ' + result.error);
              }
            } catch (error) {
              alert('Error denying user: ' + error.message);
            }
          }
        }
      </script>
    </body>
    </html>
    `;

    res.send(html);
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'loadAdminPanel', 
      userId: req.user?.id, 
      endpoint: '/admin/users' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to load admin panel',
    });
  }
});

// Approve user
router.post('/users/:id/approve', async (req, res) => {
  try {
    const userIdToApprove = parseInt(req.params.id);
    const approvedUser = await approveUser(req.user.id, userIdToApprove);

    routeLogger.info('User approved successfully', { 
      adminId: req.user.id, 
      adminEmail: req.user.email, 
      approvedUserId: userIdToApprove, 
      operation: 'approveUser' 
    });

    res.json({
      success: true,
      message: 'User approved successfully',
      user: approvedUser.toSafeObject(),
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'approveUser', 
      adminId: req.user?.id, 
      targetUserId: parseInt(req.params.id), 
      endpoint: '/admin/users/:id/approve' 
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Deny user (delete account)
router.post('/users/:id/deny', async (req, res) => {
  try {
    const userIdToDeny = parseInt(req.params.id);

    // For now, we'll just mark them as denied (we could delete the account)
    // TODO: Add proper denial handling

    routeLogger.info('User denial attempted', { 
      adminId: req.user.id, 
      adminEmail: req.user.email, 
      deniedUserId: userIdToDeny, 
      operation: 'denyUser' 
    });

    res.json({
      success: true,
      message:
        'User denied (this is a placeholder - implement proper denial logic)',
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'denyUser', 
      adminId: req.user?.id, 
      targetUserId: parseInt(req.params.id), 
      endpoint: '/admin/users/:id/deny' 
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Promote user to admin
router.post('/users/:id/promote', async (req, res) => {
  try {
    const userIdToPromote = parseInt(req.params.id);
    const promotedUser = await makeUserAdmin(req.user.id, userIdToPromote);

    routeLogger.info('User promoted to admin successfully', { 
      adminId: req.user.id, 
      adminEmail: req.user.email, 
      promotedUserId: userIdToPromote, 
      operation: 'promoteUser' 
    });

    res.json({
      success: true,
      message: 'User promoted to admin successfully',
      user: promotedUser.toSafeObject(),
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'promoteUser', 
      adminId: req.user?.id, 
      targetUserId: parseInt(req.params.id), 
      endpoint: '/admin/users/:id/promote' 
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
