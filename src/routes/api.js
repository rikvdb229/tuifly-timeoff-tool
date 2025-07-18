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
      'GET /api/gmail/status': 'Check Gmail connection status',
      'POST /api/requests/:id/resend-email':
        'Resend email for specific request',
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
// POST create group time-off request WITH EMAIL INTEGRATION
router.post('/requests/group', async (req, res) => {
  try {
    const { dates, customMessage } = req.body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid dates array',
        message:
          'Provide array of date objects with date, type, and optional flightNumber',
      });
    }

    // Generate group ID for all requests
    const { v4: uuidv4 } = require('uuid');
    const groupId = uuidv4();

    // Create all requests in the group
    const requestPromises = dates.map((dateObj) => {
      return TimeOffRequest.create({
        userId: req.user.id,
        groupId,
        startDate: dateObj.date,
        endDate: dateObj.date,
        type: dateObj.type.toUpperCase(),
        flightNumber:
          dateObj.type.toUpperCase() === 'FLIGHT' ? dateObj.flightNumber : null,
        customMessage: customMessage || null,
      });
    });

    const newRequests = await Promise.all(requestPromises);

    // 🚀 NEW: Attempt to send email for the group
    let emailStatus = {
      sent: false,
      error: null,
      canRetry: false,
    };

    if (req.user.canSendEmails()) {
      try {
        console.log(
          `Attempting to send group email for ${newRequests.length} requests...`
        );
        const gmailService = require('../services/gmailService');
        const emailResult = await gmailService.sendEmail(req.user, newRequests);

        // Mark all requests as having email sent
        await Promise.all(
          newRequests.map((request) =>
            request.markEmailSent(emailResult.messageId, emailResult.threadId)
          )
        );

        emailStatus.sent = true;
        console.log(
          `✅ Group email sent successfully for ${newRequests.length} requests`
        );
      } catch (emailError) {
        console.error('Group email sending failed:', emailError);
        emailStatus.error = emailError.message;
        emailStatus.canRetry = true;

        console.log(
          `⚠️ Group requests created but email failed: ${emailError.message}`
        );
      }
    } else {
      emailStatus.error =
        'Gmail not configured - please re-login to grant Gmail permissions';
      emailStatus.canRetry = true;
      emailStatus.authUrl = '/auth/google';
    }

    // Reload requests to get updated email fields
    for (const request of newRequests) {
      await request.reload();
    }

    res.status(201).json({
      success: true,
      data: newRequests,
      groupId,
      emailStatus,
      message: emailStatus.sent
        ? `Group request created with ${newRequests.length} days and email sent successfully`
        : `Group request created with ${newRequests.length} days but email could not be sent`,
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

// POST create single time-off request WITH EMAIL INTEGRATION
router.post('/requests', async (req, res) => {
  try {
    const { startDate, endDate, type, flightNumber, customMessage } = req.body;

    // Validate required fields
    if (!startDate || !endDate || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['startDate', 'endDate', 'type'],
      });
    }

    // Create the request first
    const newRequest = await TimeOffRequest.create({
      userId: req.user.id,
      startDate,
      endDate,
      type: type.toUpperCase(),
      flightNumber: type.toUpperCase() === 'FLIGHT' ? flightNumber : null,
      customMessage: customMessage || null,
    });

    // 🚀 NEW: Attempt to send email after successful request creation
    let emailStatus = {
      sent: false,
      error: null,
      canRetry: false,
    };

    if (req.user.canSendEmails()) {
      try {
        console.log(`Attempting to send email for request ${newRequest.id}...`);
        const gmailService = require('../services/gmailService');
        const emailResult = await gmailService.sendEmail(req.user, [
          newRequest,
        ]);

        // Mark email as sent in database
        await newRequest.markEmailSent(
          emailResult.messageId,
          emailResult.threadId
        );

        emailStatus.sent = true;
        console.log(`✅ Email sent successfully for request ${newRequest.id}`);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        emailStatus.error = emailError.message;
        emailStatus.canRetry = true;

        // Don't fail the request creation, just log the email failure
        console.log(
          `⚠️ Request ${newRequest.id} created but email failed: ${emailError.message}`
        );
      }
    } else {
      emailStatus.error =
        'Gmail not configured - please re-login to grant Gmail permissions';
      emailStatus.canRetry = true;
      emailStatus.authUrl = '/auth/google';
    }

    // Reload request to get updated email fields
    await newRequest.reload();

    res.status(201).json({
      success: true,
      data: newRequest,
      emailStatus,
      message: emailStatus.sent
        ? 'Time-off request created and email sent successfully'
        : 'Time-off request created but email could not be sent',
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
// 🚀 NEW: Gmail status and management endpoints

// GET Gmail connection status
// GET Gmail connection status
router.get('/gmail/status', async (req, res) => {
  try {
    // Debug: Check what canSendEmails() returns
    const canSendEmailsResult = req.user.canSendEmails();
    console.log(
      '🔍 canSendEmails() result:',
      canSendEmailsResult,
      typeof canSendEmailsResult
    );

    const status = {
      connected: req.user.gmailScopeGranted || false,
      canSendEmails: Boolean(req.user.canSendEmails()), // Force boolean conversion
      hasValidToken: req.user.hasValidGmailToken(),
      tokenExpiry: req.user.gmailTokenExpiry,
      needsReauth: false,
      authUrl: '/auth/google', // Unified login URL
    };

    // Check if re-authorization is needed
    if (
      status.connected &&
      !status.hasValidToken &&
      !req.user.gmailRefreshToken
    ) {
      status.needsReauth = true;
    }

    res.json({
      success: true,
      data: status,
      message: status.canSendEmails
        ? 'Gmail is ready for sending emails'
        : 'Gmail needs to be connected - please re-login',
    });
  } catch (error) {
    console.error('Error getting Gmail status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Gmail status',
      message: error.message,
    });
  }
});

// POST resend email for specific request
router.post('/requests/:id/resend-email', async (req, res) => {
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

    if (!req.user.canSendEmails()) {
      return res.status(403).json({
        success: false,
        error: 'Gmail not configured for this user',
        message: 'Please re-login to grant Gmail permissions',
        needsAuth: true,
        authUrl: '/auth/google',
      });
    }

    try {
      console.log(`Sending email for request ${requestId}...`);
      const gmailService = require('../services/gmailService');
      const emailResult = await gmailService.sendEmail(req.user, [request]);

      // Update email fields in database
      await request.markEmailSent(emailResult.messageId, emailResult.threadId);
      await request.reload();

      res.json({
        success: true,
        data: request,
        message: 'Email sent successfully',
      });
    } catch (emailError) {
      console.error('Email send failed:', emailError);
      res.status(500).json({
        success: false,
        error: 'Failed to send email',
        message: emailError.message,
        canRetry: true,
      });
    }
  } catch (error) {
    console.error('Error in resend email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send email',
      message: error.message,
    });
  }
});

module.exports = router;
