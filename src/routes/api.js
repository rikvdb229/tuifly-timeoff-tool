// src/routes/api.js
const express = require('express');
const { requireAuth, requireOnboarding } = require('../middleware/auth');
const { TimeOffRequest, User } = require('../models');
const gmailService = require('../services/gmailService');
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
          attributes: ['name', 'code', 'emailPreference'],
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

    // Enhance each request with email status information
    const enhancedRequests = requests.map((request) => {
      const requestData = request.toJSON();
      return {
        ...requestData,
        emailStatus: request.getEmailStatus(),
        emailStatusIcon: request.getEmailStatusIcon(),
        emailStatusLabel: request.getEmailStatusLabel(),
        canManualEmailBeSent: request.canManualEmailBeSent(),
        isEmailSent: request.isEmailSent(),
        hasReply: request.hasReply(),
      };
    });

    res.json({
      success: true,
      data: enhancedRequests,
      count: enhancedRequests.length,
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
// GET current user's email preference
router.get('/user/email-preference', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        emailPreference: req.user.emailPreference,
        gmailScopeGranted: req.user.gmailScopeGranted,
        canSendEmails: req.user.canSendEmails(),
        usesManualEmail: req.user.usesManualEmail(),
        usesAutomaticEmail: req.user.usesAutomaticEmail(),
      },
      user: req.user.toSafeObject(),
    });
  } catch (error) {
    console.error('Error fetching email preference:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email preference',
      message: error.message,
    });
  }
});

// PUT update user's email preference
router.put('/user/email-preference', async (req, res) => {
  try {
    const { preference } = req.body;

    if (!preference || !['automatic', 'manual'].includes(preference)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email preference',
        message: 'Preference must be "automatic" or "manual"',
      });
    }

    await req.user.setEmailPreference(preference);

    // If switching to automatic mode, user needs to grant Gmail permissions
    let requiresGmailAuth = false;
    if (preference === 'automatic' && !req.user.gmailScopeGranted) {
      requiresGmailAuth = true;
    }

    res.json({
      success: true,
      message: `Email preference updated to ${preference}`,
      data: {
        emailPreference: preference,
        requiresGmailAuth,
        gmailScopeGranted: req.user.gmailScopeGranted,
      },
      user: req.user.toSafeObject(),
    });
  } catch (error) {
    console.error('Error updating email preference:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update email preference',
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
        emailMode: req.user.emailPreference, // ✅ Use current user preference
      });
    });

    const createdRequests = await Promise.all(requestPromises);

    // ✅ NEW: For manual mode, generate group email content
    if (req.user.emailPreference === 'manual') {
      // Generate group email content using the first request
      const firstRequest = createdRequests[0];
      const groupEmailContent = await firstRequest.generateGroupEmailContent(
        req.user
      );

      // Store the email content in ALL requests in the group
      for (const request of createdRequests) {
        await request.storeManualEmailContent(groupEmailContent);
      }
    } else if (req.user.emailPreference === 'automatic') {
      // Handle automatic mode (existing logic)
      try {
        const GmailService = require('../services/gmailService');

        if (GmailService.needsReauthorization(req.user)) {
          return res.status(400).json({
            success: false,
            error: 'Gmail authorization required',
            message:
              'Please authorize Gmail access to send emails automatically',
            authRequired: true,
            authUrl: '/auth/google',
          });
        }

        const gmailService = new GmailService();
        const emailResult = await gmailService.sendEmail(
          req.user,
          createdRequests
        );

        // Mark all requests as email sent
        for (const request of createdRequests) {
          await request.markEmailSent(
            emailResult.messageId,
            emailResult.threadId
          );
        }
      } catch (emailError) {
        console.error('Email send failed:', emailError);

        // Mark all requests as email failed
        for (const request of createdRequests) {
          await request.markEmailFailed(emailError.message);
        }
      }
    }

    res.json({
      success: true,
      message: `Group request created successfully with ${createdRequests.length} date(s)`,
      data: {
        requests: createdRequests.map((r) => r.toJSON()),
        groupId,
        emailMode: req.user.emailPreference,
        totalDates: createdRequests.length,
      },
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

    // Validation
    if (!startDate || !endDate || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        details: [
          { field: 'startDate', message: 'Start date is required' },
          { field: 'endDate', message: 'End date is required' },
          { field: 'type', message: 'Request type is required' },
        ],
      });
    }

    // Create the request with email mode tracking
    const request = await TimeOffRequest.createForUser(req.user.id, {
      startDate,
      endDate,
      type,
      flightNumber: flightNumber || null,
      customMessage: customMessage || null,
    });

    // Get the user's email preference
    const emailPreference = req.user.emailPreference;
    let emailResponse = {};

    if (emailPreference === 'automatic' && req.user.canSendEmails()) {
      // AUTOMATIC MODE: Use existing Gmail service
      try {
        // Use existing Gmail service - pass requests as array
        const emailResult = await gmailService.sendEmail(req.user, [request]);

        await request.markEmailSent(
          emailResult.messageId,
          emailResult.threadId
        );

        emailResponse = {
          emailStatus: { sent: true, messageId: emailResult.messageId },
          message: 'Request created and email sent automatically',
        };
      } catch (emailError) {
        console.error('Gmail send failed:', emailError);
        emailResponse = {
          emailStatus: { sent: false, error: emailError.message },
          message: 'Request created but email failed to send',
        };
      }
    } else {
      // MANUAL MODE: Generate email content using existing service
      const emailContent = gmailService.generateEmailContent(req.user, [
        request,
      ]);

      await request.storeManualEmailContent(emailContent);

      emailResponse = {
        emailContent,
        emailMode: 'manual',
        message: 'Request created. Email ready to copy.',
      };
    }

    res.status(201).json({
      success: true,
      data: {
        ...request.toJSON(),
        emailStatus: request.getEmailStatus(),
        emailStatusIcon: request.getEmailStatusIcon(),
        emailStatusLabel: request.getEmailStatusLabel(),
      },
      ...emailResponse,
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

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID',
      });
    }

    // Use existing findByPkAndUser method
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

    // Check if request can be deleted using existing method
    if (!request.canBeDeleted()) {
      return res.status(403).json({
        success: false,
        error: 'Only pending or denied requests can be deleted',
      });
    }

    // Delete the request
    await request.destroy();

    res.json({
      success: true,
      message: 'Request deleted successfully',
      data: { id: requestId },
    });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete request',
      message: error.message,
    });
  }
});
router.delete('/requests/:id/delete-group', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await TimeOffRequest.findByPkAndUser(id, req.user.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    if (!request.groupId) {
      return res.status(400).json({
        success: false,
        error: 'This is not a group request',
      });
    }

    // Get all requests in the group
    const groupRequests = await TimeOffRequest.getByGroupIdAndUser(
      request.groupId,
      req.user.id
    );

    if (groupRequests.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No requests found in this group',
      });
    }

    // Check if any request in the group cannot be deleted
    const cannotDelete = groupRequests.filter(
      (req) => req.status !== 'PENDING' || req.manualEmailConfirmed
    );

    if (cannotDelete.length > 0) {
      return res.status(400).json({
        success: false,
        error:
          'Cannot delete group: some requests are already processed or confirmed',
        details: `${cannotDelete.length} out of ${groupRequests.length} requests cannot be deleted`,
      });
    }

    // Delete all requests in the group
    const deletePromises = groupRequests.map((req) => req.destroy());
    await Promise.all(deletePromises);

    res.json({
      success: true,
      message: `Group request deleted successfully`,
      data: {
        deletedCount: groupRequests.length,
        groupId: request.groupId,
        deletedRequestIds: groupRequests.map((req) => req.id),
      },
    });
  } catch (error) {
    console.error('Error deleting group request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete group request',
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
// GET email content for a specific request (manual mode)
router.get('/requests/:id/email-content', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await TimeOffRequest.findByPkAndUser(id, req.user.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    if (request.emailMode !== 'manual') {
      return res.status(400).json({
        success: false,
        error: 'This request is not in manual email mode',
      });
    }

    res.json({
      success: true,
      data: {
        emailContent: request.manualEmailContent,
        canBeSent: request.canManualEmailBeSent(),
        emailStatus: request.getEmailStatus(),
        emailStatusIcon: request.getEmailStatusIcon(),
        emailStatusLabel: request.getEmailStatusLabel(),
      },
    });
  } catch (error) {
    console.error('Error fetching email content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email content',
      message: error.message,
    });
  }
});

// POST mark manual email as sent
router.post('/requests/:id/mark-email-sent', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await TimeOffRequest.findByPkAndUser(id, req.user.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    // Check user's email preference
    if (req.user.emailPreference !== 'manual') {
      return res.status(400).json({
        success: false,
        error: 'This action is only available for users in manual email mode',
      });
    }

    if (request.manualEmailConfirmed) {
      return res.status(400).json({
        success: false,
        error: 'Email already marked as sent',
      });
    }

    // 🔥 NEW: Handle group requests - mark ALL requests in the group as sent
    let updatedRequests = [];

    if (request.groupId) {
      // Get all requests in the group
      const groupRequests = await TimeOffRequest.getByGroupIdAndUser(
        request.groupId,
        req.user.id
      );

      // Mark all requests in the group as manually sent
      for (const groupRequest of groupRequests) {
        if (!groupRequest.manualEmailConfirmed) {
          await groupRequest.markManualEmailSent();
          updatedRequests.push(groupRequest);
        }
      }

      res.json({
        success: true,
        message: `Email marked as sent for group of ${updatedRequests.length} request(s)`,
        data: {
          updatedRequests: updatedRequests.length,
          groupId: request.groupId,
          emailStatus: 'confirmed',
          emailStatusIcon: '✅',
          emailStatusLabel: 'Email Confirmed Sent',
        },
      });
    } else {
      // Single request
      await request.markManualEmailSent();

      res.json({
        success: true,
        message: 'Email marked as sent successfully',
        data: {
          updatedRequests: 1,
          emailStatus: request.getEmailStatus(),
          emailStatusIcon: request.getEmailStatusIcon(),
          emailStatusLabel: request.getEmailStatusLabel(),
        },
      });
    }
  } catch (error) {
    console.error('Error marking email as sent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark email as sent',
      message: error.message,
    });
  }
});
router.get('/requests/:id/group-email-content', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await TimeOffRequest.findByPkAndUser(id, req.user.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    let emailContent;

    if (request.groupId) {
      // Generate group email content
      emailContent = await request.generateGroupEmailContent(req.user);
    } else {
      // Generate single request email content
      emailContent = request.generateSingleEmailContent(req.user);
    }

    res.json({
      success: true,
      data: {
        emailContent,
        isGroup: !!request.groupId,
        groupId: request.groupId,
      },
    });
  } catch (error) {
    console.error('Error generating email content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate email content',
      message: error.message,
    });
  }
});

// POST retry email sending (uses existing Gmail service)
router.post('/requests/:id/retry-email', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await TimeOffRequest.findByPkAndUser(id, req.user.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    if (!req.user.canSendEmails()) {
      return res.status(400).json({
        success: false,
        error: 'User cannot send automatic emails',
        message: 'Gmail permissions required for automatic email sending',
      });
    }

    try {
      // Use existing Gmail service
      const emailResult = await gmailService.sendEmail(req.user, [request]);

      await request.markEmailSent(emailResult.messageId, emailResult.threadId);

      res.json({
        success: true,
        message: 'Email sent successfully',
        data: {
          emailStatus: 'sent',
          emailStatusIcon: '✅',
          emailStatusLabel: 'Email Sent',
          messageId: emailResult.messageId,
        },
      });
    } catch (emailError) {
      console.error('Gmail retry failed:', emailError);
      res.status(500).json({
        success: false,
        error: 'Failed to send email',
        message: emailError.message,
      });
    }
  } catch (error) {
    console.error('Error retrying email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry email',
      message: error.message,
    });
  }
});

// PUT manually override request status
router.put('/requests/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status || !['PENDING', 'APPROVED', 'DENIED'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        message: 'Status must be PENDING, APPROVED, or DENIED',
      });
    }

    const request = await TimeOffRequest.findByPkAndUser(id, req.user.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    const updates = { status };
    if (status !== 'PENDING') {
      updates.approvalDate = new Date();
    }
    if (status === 'DENIED' && reason) {
      updates.denialReason = reason;
    }

    await request.update(updates);

    res.json({
      success: true,
      message: `Request status updated to ${status}`,
      data: request,
    });
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update request status',
      message: error.message,
    });
  }
});

module.exports = router;
