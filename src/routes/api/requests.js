// src/routes/api/requests.js - Single time-off request management
const express = require('express');
const { TimeOffRequest, User } = require('../../models');
const GmailService = require('../../services/gmailService');
const { sanitizeRequestBody } = require('../../utils/sanitize');
const { createRequestSchema } = require('./validators');
const { routeLogger } = require('../../utils/logger');

const router = express.Router();

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
    const enhancedRequests = requests.map(request => {
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
    routeLogger.logError(error, { 
      operation: 'fetchRequests', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      queryParams: { 
        status: req.query?.status, 
        limit: req.query?.limit, 
        offset: req.query?.offset 
      }, 
      endpoint: '/requests' 
    });
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
    routeLogger.logError(error, { 
      operation: 'fetchRequestStats', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      endpoint: '/requests/stats' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
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
    routeLogger.logError(error, { 
      operation: 'checkConflicts', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      queryParams: { 
        startDate: req.query?.startDate, 
        endDate: req.query?.endDate, 
        excludeGroupId: req.query?.excludeGroupId 
      }, 
      endpoint: '/requests/conflicts' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to check conflicts',
      message: error.message,
    });
  }
});

// POST create single time-off request WITH EMAIL INTEGRATION
router.post(
  '/requests',
  sanitizeRequestBody(['customMessage', 'flightNumber']),
  async (req, res) => {
    try {
      const { startDate, endDate, type, flightNumber, customMessage } =
        req.body;

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

      routeLogger.info('Request created successfully', { 
        userId: req.user.id, 
        userEmail: req.user.email, 
        requestId: request.id, 
        type: request.type, 
        startDate: request.startDate, 
        endDate: request.endDate, 
        hasFlightNumber: !!request.flightNumber, 
        hasCustomMessage: !!request.customMessage, 
        emailPreference: req.user.emailPreference, 
        operation: 'createRequest' 
      });

      // Get the user's email preference
      const emailPreference = req.user.emailPreference;
      let emailResponse = {};

      if (emailPreference === 'automatic' && req.user.canSendEmails()) {
        // AUTOMATIC MODE: Use existing Gmail service
        try {
          // Use existing Gmail service - pass requests as array
          const emailResult = await new GmailService().sendEmail(req.user, [
            request,
          ]);

          await request.markEmailSent(
            emailResult.messageId,
            emailResult.threadId
          );

          routeLogger.info('Automatic email sent successfully', { 
            userId: req.user.id, 
            userEmail: req.user.email, 
            requestId: request.id, 
            messageId: emailResult.messageId, 
            threadId: emailResult.threadId, 
            to: emailResult.to, 
            operation: 'sendAutomaticEmail' 
          });

          emailResponse = {
            emailStatus: { sent: true, messageId: emailResult.messageId },
            message: 'Request created and email sent automatically',
          };
        } catch (emailError) {
          routeLogger.logError(emailError, { 
            operation: 'sendAutomaticEmail', 
            userId: req.user.id, 
            userEmail: req.user.email, 
            requestId: request.id, 
            requestType: request.type, 
            startDate: request.startDate, 
            endDate: request.endDate, 
            emailService: 'gmail' 
          });
          emailResponse = {
            emailStatus: { sent: false, error: emailError.message },
            message: 'Request created but email failed to send',
          };
        }
      } else {
        // MANUAL MODE: Generate email content using existing service
        const emailContent = new GmailService().generateEmailContent(req.user, [
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
      routeLogger.logError(error, { 
        operation: 'createRequest', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        requestData: { 
          startDate: req.body?.startDate, 
          endDate: req.body?.endDate, 
          type: req.body?.type 
        }, 
        endpoint: 'POST /requests' 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to create request',
        message: error.message,
      });
    }
  }
);

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
    routeLogger.logError(error, { 
      operation: 'fetchSingleRequest', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      requestId: req.params?.id, 
      endpoint: '/requests/:id' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch request',
      message: error.message,
    });
  }
});

// PUT update time-off request for current user
router.put(
  '/requests/:id',
  sanitizeRequestBody(['customMessage', 'flightNumber']),
  async (req, res) => {
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
      if (startDate) {updates.startDate = startDate;}
      if (endDate) {updates.endDate = endDate;}
      if (type) {updates.type = type;}
      if (status && ['PENDING', 'APPROVED', 'DENIED'].includes(status)) {
        updates.status = status;
        if (status !== 'PENDING') {
          updates.approvalDate = new Date();
        }
      }
      if (flightNumber !== undefined) {updates.flightNumber = flightNumber;}
      if (customMessage !== undefined) {updates.customMessage = customMessage;}

      await request.update(updates);

      routeLogger.info('Request updated successfully', { 
        userId: req.user.id, 
        userEmail: req.user.email, 
        requestId, 
        updatedFields: Object.keys(updates), 
        operation: 'updateRequest' 
      });

      res.json({
        success: true,
        data: request,
        message: 'Time-off request updated successfully',
      });
    } catch (error) {
      routeLogger.logError(error, { 
        operation: 'updateRequest', 
        userId: req.user?.id, 
        userEmail: req.user?.email, 
        requestId: req.params?.id, 
        updateData: { 
          startDate: req.body?.startDate, 
          endDate: req.body?.endDate, 
          type: req.body?.type, 
          status: req.body?.status 
        }, 
        endpoint: 'PUT /requests/:id' 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update request',
        message: error.message,
      });
    }
  }
);

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
        error: 'Cannot delete request: email has already been sent',
      });
    }

    // Delete the request
    await request.destroy();

    routeLogger.info('Request deleted successfully', { 
      userId: req.user.id, 
      userEmail: req.user.email, 
      requestId, 
      requestType: request.type, 
      startDate: request.startDate, 
      endDate: request.endDate, 
      operation: 'deleteRequest' 
    });

    res.json({
      success: true,
      message: 'Request deleted successfully',
      data: { id: requestId },
    });
  } catch (error) {
    routeLogger.logError(error, { 
      operation: 'deleteRequest', 
      userId: req.user?.id, 
      userEmail: req.user?.email, 
      requestId: req.params?.id, 
      endpoint: 'DELETE /requests/:id' 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete request',
      message: error.message,
    });
  }
});

module.exports = router;
