// src/routes/api/admin.js - Admin API routes
const express = require('express');
const { RosterSchedule, AppSetting, User } = require('../../models');
const { logger } = require('../../utils/logger');

const router = express.Router();

// Middleware to check admin permissions
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  if (!req.user.canManageRosters && !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin permissions required',
    });
  }

  next();
}

// Middleware to check super admin permissions
function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  if (!req.user.canManageSettings && req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: 'Super admin permissions required',
    });
  }

  next();
}

// ROSTER SCHEDULE ENDPOINTS

// Get all roster schedules
router.get('/rosters', requireAdmin, async (req, res) => {
  try {
    const schedules = await RosterSchedule.findAll({
      order: [['publicationDate', 'ASC']],
    });

    const schedulesWithStatus = schedules.map(schedule => schedule.toSafeObject());

    res.json({
      success: true,
      data: schedulesWithStatus,
    });
  } catch (error) {
    logger.error('Error fetching roster schedules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roster schedules',
    });
  }
});

// Create new roster schedule
router.post('/rosters', requireAdmin, async (req, res) => {
  try {
    const {
      publicationDate,
      latestRequestDate,
      startPeriod,
      endPeriod,
      description,
      isActive = true,
    } = req.body;

    // Validate required fields
    if (!publicationDate || !latestRequestDate || !startPeriod || !endPeriod) {
      return res.status(400).json({
        success: false,
        error: 'All date fields are required',
      });
    }

    // Validate date logic
    const pubDate = new Date(publicationDate);
    const reqDate = new Date(latestRequestDate);
    const startDate = new Date(startPeriod);
    const endDate = new Date(endPeriod);

    if (pubDate <= reqDate) {
      return res.status(400).json({
        success: false,
        error: 'Publication date must be after the request deadline',
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        error: 'End date must be after start date',
      });
    }

    // Check for overlapping periods
    const { Op } = require('sequelize');
    const overlapping = await RosterSchedule.findOne({
      where: {
        isActive: true,
        [Op.or]: [
          {
            startPeriod: { [Op.lte]: endPeriod },
            endPeriod: { [Op.gte]: startPeriod },
          },
        ],
      },
    });

    if (overlapping && isActive) {
      return res.status(400).json({
        success: false,
        error: 'This roster period overlaps with an existing active schedule',
      });
    }

    const schedule = await RosterSchedule.create({
      publicationDate,
      latestRequestDate,
      startPeriod,
      endPeriod,
      description,
      isActive,
      createdBy: req.user.id,
    });

    logger.info(`Roster schedule created by ${req.user.email}:`, {
      scheduleId: schedule.id,
      description,
      period: `${startPeriod} to ${endPeriod}`,
    });

    res.status(201).json({
      success: true,
      data: schedule.toSafeObject(),
    });
  } catch (error) {
    logger.error('Error creating roster schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create roster schedule',
    });
  }
});

// Update roster schedule
router.put('/rosters/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      publicationDate,
      latestRequestDate,
      startPeriod,
      endPeriod,
      description,
      isActive,
    } = req.body;

    const schedule = await RosterSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Roster schedule not found',
      });
    }

    // Validate date logic
    if (publicationDate && latestRequestDate) {
      const pubDate = new Date(publicationDate);
      const reqDate = new Date(latestRequestDate);

      if (pubDate <= reqDate) {
        return res.status(400).json({
          success: false,
          error: 'Publication date must be after the request deadline',
        });
      }
    }

    if (startPeriod && endPeriod) {
      const startDate = new Date(startPeriod);
      const endDate = new Date(endPeriod);

      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          error: 'End date must be after start date',
        });
      }
    }

    await schedule.update({
      publicationDate: publicationDate || schedule.publicationDate,
      latestRequestDate: latestRequestDate || schedule.latestRequestDate,
      startPeriod: startPeriod || schedule.startPeriod,
      endPeriod: endPeriod || schedule.endPeriod,
      description: description !== undefined ? description : schedule.description,
      isActive: isActive !== undefined ? isActive : schedule.isActive,
      updatedBy: req.user.id,
    });

    logger.info(`Roster schedule updated by ${req.user.email}:`, {
      scheduleId: schedule.id,
    });

    res.json({
      success: true,
      data: schedule.toSafeObject(),
    });
  } catch (error) {
    logger.error('Error updating roster schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update roster schedule',
    });
  }
});

// Toggle roster active status
router.put('/rosters/:id/toggle-active', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const schedule = await RosterSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Roster schedule not found',
      });
    }

    await schedule.update({
      isActive: Boolean(isActive),
      updatedBy: req.user.id,
    });

    logger.info(`Roster schedule ${isActive ? 'activated' : 'deactivated'} by ${req.user.email}:`, {
      scheduleId: schedule.id,
    });

    res.json({
      success: true,
      data: schedule.toSafeObject(),
    });
  } catch (error) {
    logger.error('Error toggling roster status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update roster status',
    });
  }
});

// Delete roster schedule
router.delete('/rosters/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await RosterSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Roster schedule not found',
      });
    }

    await schedule.destroy();

    logger.info(`Roster schedule deleted by ${req.user.email}:`, {
      scheduleId: id,
    });

    res.json({
      success: true,
      message: 'Roster schedule deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting roster schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete roster schedule',
    });
  }
});

// USER MANAGEMENT ENDPOINTS

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'ApprovedBy',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    const safeUsers = users.map(user => user.toSafeObject());

    res.json({
      success: true,
      data: safeUsers,
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
    });
  }
});

// Update user role
router.put('/users/:id/role', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['user', 'admin', 'superadmin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role specified',
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Prevent users from demoting themselves from superadmin
    if (req.user.id === parseInt(id) && req.user.role === 'superadmin' && role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        error: 'Cannot demote yourself from super admin',
      });
    }

    await user.update({
      role,
      isAdmin: role === 'admin' || role === 'superadmin',
      adminApproved: true,
      adminApprovedAt: new Date(),
      adminApprovedBy: req.user.id,
    });

    logger.info(`User role updated by ${req.user.email}:`, {
      userId: user.id,
      userEmail: user.email,
      newRole: role,
    });

    res.json({
      success: true,
      data: user.toSafeObject(),
    });
  } catch (error) {
    logger.error('Error updating user role:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user role',
    });
  }
});

// APP SETTINGS ENDPOINTS

// Get all app settings
router.get('/settings', requireSuperAdmin, async (req, res) => {
  try {
    const settings = await AppSetting.getAllEditable();

    res.json({
      success: true,
      data: settings.map(setting => setting.toSafeObject()),
    });
  } catch (error) {
    logger.error('Error fetching app settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app settings',
    });
  }
});

// Update app setting
router.put('/settings/:key', requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    await AppSetting.set(key, value, req.user.id);

    logger.info(`App setting updated by ${req.user.email}:`, {
      key,
      value,
    });

    const updatedSetting = await AppSetting.findOne({ where: { key } });

    res.json({
      success: true,
      data: updatedSetting.toSafeObject(),
    });
  } catch (error) {
    logger.error('Error updating app setting:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update app setting',
    });
  }
});

// CALENDAR INTEGRATION ENDPOINT

// Get roster deadline for specific date
router.get('/roster-deadline/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }

    const deadline = await RosterSchedule.getRequestDeadlineForDate(date);

    if (!deadline) {
      return res.json({
        success: true,
        data: null,
        message: 'No roster schedule found for this date',
      });
    }

    res.json({
      success: true,
      data: deadline,
    });
  } catch (error) {
    logger.error('Error fetching roster deadline:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roster deadline',
    });
  }
});

module.exports = router;