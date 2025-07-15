// STEP 2: Create basic API routes for time-off requests

// FILE: src/routes/api.js (Updated version)
const express = require('express');
const router = express.Router();

// Temporary in-memory storage for testing (we'll replace with database later)
let timeOffRequests = [
  {
    id: 1,
    startDate: '2025-01-28',
    endDate: '2025-01-28',
    type: 'REQ_DO',
    status: 'PENDING',
    flightNumber: null,
    customMessage: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    startDate: '2025-01-29',
    endDate: '2025-01-29',
    type: 'PM_OFF',
    status: 'APPROVED',
    flightNumber: null,
    customMessage: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    startDate: '2025-01-30',
    endDate: '2025-01-30',
    type: 'FLIGHT',
    status: 'PENDING',
    flightNumber: 'TB123',
    customMessage: null,
    createdAt: new Date().toISOString(),
  },
];

// API Info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TUIfly Time-Off API',
    version: '1.0.0',
    endpoints: {
      'GET /api/requests': 'Get all time-off requests',
      'POST /api/requests': 'Create new time-off request',
      'PUT /api/requests/:id': 'Update time-off request',
      'DELETE /api/requests/:id': 'Delete time-off request',
      'GET /api/requests/:id': 'Get specific time-off request',
    },
  });
});

// GET all time-off requests
router.get('/requests', (req, res) => {
  try {
    res.json({
      success: true,
      data: timeOffRequests,
      count: timeOffRequests.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch requests',
      message: error.message,
    });
  }
});

// GET specific time-off request
router.get('/requests/:id', (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = timeOffRequests.find((r) => r.id === requestId);

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

// POST create new time-off request
router.post('/requests', (req, res) => {
  try {
    const { startDate, endDate, type, flightNumber, customMessage } = req.body;

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

    // Create new request
    const newRequest = {
      id: Math.max(...timeOffRequests.map((r) => r.id), 0) + 1,
      startDate,
      endDate,
      type,
      status: 'PENDING',
      flightNumber: type === 'FLIGHT' ? flightNumber : null,
      customMessage: customMessage || null,
      createdAt: new Date().toISOString(),
    };

    timeOffRequests.push(newRequest);

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

// PUT update time-off request
router.put('/requests/:id', (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const requestIndex = timeOffRequests.findIndex((r) => r.id === requestId);

    if (requestIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    const { startDate, endDate, type, status, flightNumber, customMessage } =
      req.body;
    const existingRequest = timeOffRequests[requestIndex];

    // Update only provided fields
    const updatedRequest = {
      ...existingRequest,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(type && { type }),
      ...(status && { status }),
      ...(flightNumber !== undefined && { flightNumber }),
      ...(customMessage !== undefined && { customMessage }),
      updatedAt: new Date().toISOString(),
    };

    timeOffRequests[requestIndex] = updatedRequest;

    res.json({
      success: true,
      data: updatedRequest,
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
router.delete('/requests/:id', (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const requestIndex = timeOffRequests.findIndex((r) => r.id === requestId);

    if (requestIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    const deletedRequest = timeOffRequests.splice(requestIndex, 1)[0];

    res.json({
      success: true,
      data: deletedRequest,
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
router.get('/requests/status/:status', (req, res) => {
  try {
    const status = req.params.status.toUpperCase();
    const validStatuses = ['PENDING', 'APPROVED', 'DENIED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: ' + validStatuses.join(', '),
      });
    }

    const filteredRequests = timeOffRequests.filter((r) => r.status === status);

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
