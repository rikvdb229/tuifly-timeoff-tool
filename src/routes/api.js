// src/routes/api.js
const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');
const { TimeOffRequest, User } = require('../models');
const { Op } = require('sequelize');
const Joi = require('joi');

const router = express.Router();

// Apply authentication middleware to all API routes
router.use(requireAuth);
router.use(requireOnboarding);

// Helper function to validate consecutive dates
function validateConsecutiveDates(dates) {
  if (dates.length <= 1) return true;

  const sortedDates = dates.map((d) => new Date(d.date)).sort((a, b) => a - b);

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = sortedDates[i - 1];
    const currentDate = sortedDates[i];
    const dayDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);

    if (dayDiff !== 1) {
      return false;
    }
  }

  return true;
}

// Validation schemas
const createRequestSchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  type: Joi.string().valid('REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT').required(),
  flightNumber: Joi.string().when('type', {
    is: 'FLIGHT',
    then: Joi.string().pattern(/^TB/).required(),
    otherwise: Joi.string().allow(null, ''),
  }),
  customMessage: Joi.string().allow(null, '').max(500),
});

const groupRequestSchema = Joi.object({
  dates: Joi.array()
    .items(
      Joi.object({
        date: Joi.date().iso().required(),
        type: Joi.string()
          .valid('REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT')
          .required(),
        flightNumber: Joi.string().when('type', {
          is: 'FLIGHT',
          then: Joi.string().pattern(/^TB/).required(),
          otherwise: Joi.string().allow(null, ''),
        }),
      })
    )
    .min(1)
    .max(parseInt(process.env.MAX_DAYS_PER_REQUEST) || 4)
    .required(),
  customMessage: Joi.string().allow(null, '').max(500),
});

// API Info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TUIfly Time-Off API',
    version: '2.0.0',
    user: req.user.toSafeObject(),
    endpoints: {
      'GET /api/requests': 'Get all time-off requests for current user',
      'POST /api/requests': 'Create new time-off request',
      'POST /api/requests/group':
        'Create group time-off request (consecutive dates)',
      'PUT /api/requests/:id': 'Update time-off request',
      'DELETE /api/requests/:id': 'Delete time-off request',
      'GET /api/requests/:id': 'Get specific time-off request',
      'GET /api/requests/group/:groupId': 'Get requests by group ID',
      'GET /api/requests/conflicts': 'Check for date conflicts',
      'GET /api/requests/stats': 'Get request statistics',
    },
  });
});

// GET all time-off requests for current user
router.get('/requests', async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const options = {
      include: [
        {
          model: User,
          attributes: ['name', 'code'],
        },
      ],
      order: [['createdAt', 'DESC']],
    };

    // Add status filter if provided
    if (status) {
      options.where = { status: status.toUpperCase() };
    }

    // Add pagination if provided
    if (limit) {
      options.limit = parseInt(limit);
    }
    if (offset) {
      options.offset = parseInt(offset);
    }

    const requests = await TimeOffRequest.findAllByUser(req.user.id, options);

    res.json({
      success: true,
      data: requests,
      count: requests.length,
      user: req.user.toSafeObject(),
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch requests',
      message: error.message,
    });
  }
});

// GET request statistics for current user
router.get('/requests/stats', async (req, res) => {
  try {
    const stats = await TimeOffRequest.getStatusCountsForUser(req.user.id);

    res.json({
      success: true,
      data: stats,
      user: req.user.toSafeObject(),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message,
    });
  }
});

// POST create group time-off request
router.post('/requests/group', async (req, res) => {
  try {
    const { error, value } = groupRequestSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details,
      });
    }

    const { dates, customMessage } = value;

    // Validate consecutive dates
    if (!validateConsecutiveDates(dates)) {
      return res.status(400).json({
        success: false,
        error: 'Dates must be consecutive',
        details:
          'Group requests can only contain consecutive dates (max 4 days)',
      });
    }

    // Sort dates to ensure proper order
    dates.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Check for conflicts
    const startDate = dates[0].date;
    const endDate = dates[dates.length - 1].date;

    const conflicts = await TimeOffRequest.getConflictsForUser(
      req.user.id,
      startDate,
      endDate
    );

    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Date conflicts with existing requests',
        conflicts: conflicts.map((c) => ({
          date: c.startDate,
          type: c.type,
          status: c.status,
        })),
      });
    }

    // Create group request
    const requests = await TimeOffRequest.createGroupRequest(req.user.id, {
      dates,
      customMessage,
    });

    res.status(201).json({
      success: true,
      data: requests,
      groupId: requests[0].groupId,
      message: `Group request created successfully (${requests.length} consecutive days)`,
    });
  } catch (error) {
    console.error('Error creating group request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create group request',
      message: error.message,
    });
  }
});

// GET requests by group ID for current user
router.get('/requests/group/:groupId', async (req, res) => {
  try {
    const requests = await TimeOffRequest.getByGroupIdAndUser(
      req.params.groupId,
      req.user.id
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    res.json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    console.error('Error fetching group requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group requests',
      message: error.message,
    });
  }
});

// Check for date conflicts for current user
router.get('/requests/conflicts', async (req, res) => {
  try {
    const { startDate, endDate, excludeGroupId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }

    const conflicts = await TimeOffRequest.getConflictsForUser(
      req.user.id,
      startDate,
      endDate,
      excludeGroupId
    );

    res.json({
      success: true,
      data: conflicts,
      hasConflicts: conflicts.length > 0,
    });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check conflicts',
      message: error.message,
    });
  }
});

// POST create single time-off request
router.post('/requests', async (req, res) => {
  try {
    const { error, value } = createRequestSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details,
      });
    }

    const { startDate, endDate, type, flightNumber, customMessage } = value;

    // Check for conflicts
    const conflicts = await TimeOffRequest.getConflictsForUser(
      req.user.id,
      startDate,
      endDate
    );

    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Date conflicts with existing requests',
        conflicts: conflicts.map((c) => ({
          date: c.startDate,
          type: c.type,
          status: c.status,
        })),
      });
    }

    // Create new request
    const newRequest = await TimeOffRequest.createForUser(req.user.id, {
      startDate,
      endDate,
      type,
      status: 'PENDING',
      flightNumber: type === 'FLIGHT' ? flightNumber : null,
      customMessage: customMessage || null,
    });

    res.status(201).json({
      success: true,
      data: newRequest,
      message: 'Time-off request created successfully',
    });
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create request',
      message: error.message,
    });
  }
});

// GET specific time-off request for current user
router.get('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = await TimeOffRequest.findByPkAndUser(
      requestId,
      req.user.id
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    res.json({
      success: true,
      data: request,
    });
  } catch (error) {
    console.error('Error fetching request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch request',
      message: error.message,
    });
  }
});

// PUT update time-off request for current user
router.put('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = await TimeOffRequest.findByPkAndUser(
      requestId,
      req.user.id
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    if (!request.isEditable()) {
      return res.status(403).json({
        success: false,
        error: 'Request cannot be edited',
      });
    }

    const { startDate, endDate, type, status, flightNumber, customMessage } =
      req.body;

    // Build updates object
    const updates = {};
    if (startDate) updates.startDate = startDate;
    if (endDate) updates.endDate = endDate;
    if (type) updates.type = type;
    if (status && ['PENDING', 'APPROVED', 'DENIED'].includes(status)) {
      updates.status = status;
      if (status !== 'PENDING') {
        updates.approvalDate = new Date();
      }
    }
    if (flightNumber !== undefined) updates.flightNumber = flightNumber;
    if (customMessage !== undefined) updates.customMessage = customMessage;

    await request.update(updates);

    res.json({
      success: true,
      data: request,
      message: 'Time-off request updated successfully',
    });
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update request',
      message: error.message,
    });
  }
});

// DELETE time-off request for current user
router.delete('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = await TimeOffRequest.deleteByIdAndUser(
      requestId,
      req.user.id
    );

    res.json({
      success: true,
      data: request,
      message: 'Time-off request deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting request:', error);

    if (error.message === 'Request not found') {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    if (error.message === 'Request cannot be deleted') {
      return res.status(403).json({
        success: false,
        error: 'Request cannot be deleted',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete request',
      message: error.message,
    });
  }
});

module.exports = router;
