const express = require('express');
const router = express.Router();
const { TimeOffRequest, Employee } = require('../models');
const { Op } = require('sequelize');

// API Info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TUIfly Time-Off API',
    version: '1.0.0',
    endpoints: {
      'GET /api/requests': 'Get all time-off requests',
      'POST /api/requests': 'Create new time-off request',
      'POST /api/requests/group': 'Create group time-off request',
      'PUT /api/requests/:id': 'Update time-off request',
      'DELETE /api/requests/:id': 'Delete time-off request',
      'GET /api/requests/:id': 'Get specific time-off request',
      'GET /api/requests/group/:groupId': 'Get requests by group ID',
      'GET /api/requests/conflicts': 'Check for date conflicts',
    },
  });
});

// GET all time-off requests
router.get('/requests', async (req, res) => {
  try {
    const requests = await TimeOffRequest.findAll({
      include: [
        {
          model: Employee,
          attributes: ['name', 'code'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch requests',
      message: error.message,
    });
  }
});

// GET requests by group ID
router.get('/requests/group/:groupId', async (req, res) => {
  try {
    const requests = await TimeOffRequest.getByGroupId(req.params.groupId);

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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group requests',
      message: error.message,
    });
  }
});

// Check for date conflicts
router.get('/requests/conflicts', async (req, res) => {
  try {
    const { startDate, endDate, excludeGroupId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }

    const whereClause = {
      [Op.and]: [
        {
          startDate: {
            [Op.lte]: endDate,
          },
        },
        {
          endDate: {
            [Op.gte]: startDate,
          },
        },
        {
          status: {
            [Op.in]: ['PENDING', 'APPROVED'],
          },
        },
      ],
    };

    // Exclude specific group if provided
    if (excludeGroupId) {
      whereClause[Op.and].push({
        groupId: {
          [Op.ne]: excludeGroupId,
        },
      });
    }

    const conflicts = await TimeOffRequest.findAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          attributes: ['name', 'code'],
        },
      ],
    });

    res.json({
      success: true,
      data: conflicts,
      hasConflicts: conflicts.length > 0,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check conflicts',
      message: error.message,
    });
  }
});

// POST create group time-off request
router.post('/requests/group', async (req, res) => {
  try {
    const { dates, customMessage, employeeId = 1 } = req.body;

    // Validation
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Dates array is required',
      });
    }

    if (dates.length > (parseInt(process.env.MAX_DAYS_PER_REQUEST) || 4)) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${process.env.MAX_DAYS_PER_REQUEST || 4} days per request`,
      });
    }

    // Validate each date entry
    for (const dateInfo of dates) {
      if (!dateInfo.date || !dateInfo.type) {
        return res.status(400).json({
          success: false,
          error: 'Each date must have date and type fields',
        });
      }

      const validTypes = ['REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT'];
      if (!validTypes.includes(dateInfo.type)) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid request type. Must be one of: ' + validTypes.join(', '),
        });
      }

      if (dateInfo.type === 'FLIGHT' && !dateInfo.flightNumber) {
        return res.status(400).json({
          success: false,
          error: 'Flight number is required for flight requests',
        });
      }

      if (
        dateInfo.type === 'FLIGHT' &&
        dateInfo.flightNumber &&
        !dateInfo.flightNumber.startsWith('TB')
      ) {
        return res.status(400).json({
          success: false,
          error: 'TUIfly flight numbers must start with TB',
        });
      }
    }

    // Check for conflicts
    const startDate = dates[0].date;
    const endDate = dates[dates.length - 1].date;

    const conflicts = await TimeOffRequest.findAll({
      where: {
        [Op.and]: [
          {
            startDate: {
              [Op.lte]: endDate,
            },
          },
          {
            endDate: {
              [Op.gte]: startDate,
            },
          },
          {
            status: {
              [Op.in]: ['PENDING', 'APPROVED'],
            },
          },
          {
            employeeId,
          },
        ],
      },
    });

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
    const requests = await TimeOffRequest.createGroupRequest({
      dates,
      customMessage,
      employeeId,
    });

    res.status(201).json({
      success: true,
      data: requests,
      groupId: requests[0].groupId,
      message: `Group request created successfully (${requests.length} days)`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create group request',
      message: error.message,
    });
  }
});

// POST create single time-off request (updated)
router.post('/requests', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      type,
      flightNumber,
      customMessage,
      employeeId = 1,
    } = req.body;

    // Basic validation
    if (!startDate || !endDate || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: startDate, endDate, type',
      });
    }

    // Validate request type
    const validTypes = ['REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request type. Must be one of: ' + validTypes.join(', '),
      });
    }

    // Validate flight number for flight requests
    if (type === 'FLIGHT' && !flightNumber) {
      return res.status(400).json({
        success: false,
        error: 'Flight number is required for flight requests',
      });
    }

    if (type === 'FLIGHT' && flightNumber && !flightNumber.startsWith('TB')) {
      return res.status(400).json({
        success: false,
        error: 'TUIfly flight numbers must start with TB',
      });
    }

    // Check for conflicts
    const conflicts = await TimeOffRequest.findAll({
      where: {
        [Op.and]: [
          {
            startDate: {
              [Op.lte]: endDate,
            },
          },
          {
            endDate: {
              [Op.gte]: startDate,
            },
          },
          {
            status: {
              [Op.in]: ['PENDING', 'APPROVED'],
            },
          },
          {
            employeeId,
          },
        ],
      },
    });

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
    const newRequest = await TimeOffRequest.create({
      startDate,
      endDate,
      type,
      status: 'PENDING',
      flightNumber: type === 'FLIGHT' ? flightNumber : null,
      customMessage: customMessage || null,
      employeeId,
    });

    res.status(201).json({
      success: true,
      data: newRequest,
      message: 'Time-off request created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create request',
      message: error.message,
    });
  }
});

// GET specific time-off request
router.get('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = await TimeOffRequest.findByPk(requestId, {
      include: [
        {
          model: Employee,
          attributes: ['name', 'code'],
        },
      ],
    });

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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch request',
      message: error.message,
    });
  }
});

// PUT update time-off request
router.put('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = await TimeOffRequest.findByPk(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    const { startDate, endDate, type, status, flightNumber, customMessage } =
      req.body;

    // Update only provided fields
    const updates = {};
    if (startDate) updates.startDate = startDate;
    if (endDate) updates.endDate = endDate;
    if (type) updates.type = type;
    if (status) updates.status = status;
    if (flightNumber !== undefined) updates.flightNumber = flightNumber;
    if (customMessage !== undefined) updates.customMessage = customMessage;

    await request.update(updates);

    res.json({
      success: true,
      data: request,
      message: 'Time-off request updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update request',
      message: error.message,
    });
  }
});

// DELETE time-off request
router.delete('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = await TimeOffRequest.findByPk(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    await request.destroy();

    res.json({
      success: true,
      data: request,
      message: 'Time-off request deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete request',
      message: error.message,
    });
  }
});

// GET requests by status
router.get('/requests/status/:status', async (req, res) => {
  try {
    const status = req.params.status.toUpperCase();
    const validStatuses = ['PENDING', 'APPROVED', 'DENIED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: ' + validStatuses.join(', '),
      });
    }

    const filteredRequests = await TimeOffRequest.findAll({
      where: { status },
      include: [
        {
          model: Employee,
          attributes: ['name', 'code'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: filteredRequests,
      count: filteredRequests.length,
      status: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch requests by status',
      message: error.message,
    });
  }
});

module.exports = router;
