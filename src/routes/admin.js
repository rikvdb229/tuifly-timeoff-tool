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
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
  }
  next();
};

// Apply middleware
router.use(requireAuth);
router.use(requireOnboarding);
router.use(requireAdmin);

// Admin roster management page
router.get('/roster', (req, res) => {
  res.sendFile('admin-roster.html', { root: './public/html' });
});

// Admin dashboard - user management
router.get('/users', async (req, res) => {
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
