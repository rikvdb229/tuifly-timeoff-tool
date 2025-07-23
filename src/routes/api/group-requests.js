// src/routes/api/group-requests.js - Group time-off request management
const express = require('express');
const { TimeOffRequest, User } = require('../../models');
const GmailService = require('../../services/gmailService');
const { sanitizeRequestBody } = require('../../utils/sanitize');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// POST create group time-off request WITH EMAIL INTEGRATION
router.post(
  '/requests/group',
  sanitizeRequestBody(['customMessage']),
  async (req, res) => {
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

      console.log('🔍 Creating group request with data:', {
        dates,
        customMessage,
        userPreference: req.user.emailPreference,
      });

      // Generate group ID for all requests
      const groupId = uuidv4();

      // Create all requests in the group
      const requestPromises = dates.map(dateObj => {
        return TimeOffRequest.create({
          userId: req.user.id,
          groupId,
          startDate: dateObj.date,
          endDate: dateObj.date,
          type: dateObj.type.toUpperCase(),
          flightNumber:
            dateObj.type.toUpperCase() === 'FLIGHT'
              ? dateObj.flightNumber
              : null,
          customMessage: customMessage || null,
          emailMode: req.user.emailPreference,
        });
      });

      const createdRequests = await Promise.all(requestPromises);
      console.log(
        '✅ Created requests:',
        createdRequests.map(r => ({
          id: r.id,
          startDate: r.startDate,
          type: r.type,
        }))
      );

      const emailResponse = {
        sent: false,
        message: 'Group request created successfully',
      };

      if (req.user.emailPreference === 'manual') {
        // Manual mode logic...
        const firstRequest = createdRequests[0];
        const groupEmailContent = await firstRequest.generateGroupEmailContent(
          req.user
        );

        for (const request of createdRequests) {
          await request.storeManualEmailContent(groupEmailContent);
        }

        emailResponse.message = `Group request created successfully with ${createdRequests.length} date(s). Email content ready to copy.`;
      } else if (req.user.emailPreference === 'automatic') {
        // Handle automatic mode
        try {
          console.log('🔍 Attempting automatic email send...');

          if (GmailService.needsReauthorization(req.user)) {
            console.log('❌ Gmail authorization needed');
            return res.status(400).json({
              success: false,
              error: 'Gmail authorization required',
              message:
                'Please authorize Gmail access to send emails automatically',
              authRequired: true,
              authUrl: '/auth/google',
            });
          }

          console.log('✅ Gmail authorization OK, using gmail service...');

          // Ensure requests have all required fields loaded
          const requestsWithFullData = await Promise.all(
            createdRequests.map(req => TimeOffRequest.findByPk(req.id))
          );

          console.log(
            '🔍 Requests for email:',
            requestsWithFullData.map(r => ({
              id: r.id,
              startDate: r.startDate,
              endDate: r.endDate,
              type: r.type,
              flightNumber: r.flightNumber,
              customMessage: r.customMessage,
            }))
          );

          console.log('🔍 User data for email:', {
            code: req.user.code,
            name: req.user.name,
            email: req.user.email,
            signature: req.user.signature ? 'Present' : 'Missing',
          });

          // Test email content generation first
          try {
            const emailContent = new GmailService().generateEmailContent(
              req.user,
              requestsWithFullData
            );
            console.log('✅ Email content generated:', {
              subject: emailContent.subject,
              to: emailContent.to,
              bodyLength: emailContent.text?.length || 0,
              bodyPreview: emailContent.text?.substring(0, 100) + '...',
            });
          } catch (contentError) {
            console.error('❌ Email content generation failed:', contentError);
            throw new Error(
              `Email content generation failed: ${contentError.message}`
            );
          }

          console.log('🔍 Sending email...');
          const emailResult = await new GmailService().sendEmail(
            req.user,
            requestsWithFullData
          );
          console.log('✅ Email sent successfully:', emailResult);

          // Mark all requests as email sent
          for (const request of createdRequests) {
            await request.markEmailSent(
              emailResult.messageId,
              emailResult.threadId
            );
          }

          emailResponse.sent = true;
          emailResponse.messageId = emailResult.messageId;
          emailResponse.message = `Group request created successfully with ${createdRequests.length} date(s) and email sent automatically`;
        } catch (emailError) {
          console.error('❌ Email send failed with full details:', {
            message: emailError.message,
            stack: emailError.stack,
            code: emailError.code,
          });

          // Mark all requests as email failed
          for (const request of createdRequests) {
            await request.markEmailFailed(emailError.message);
          }

          emailResponse.sent = false;
          emailResponse.error = emailError.message;
          emailResponse.message = `Group request created successfully with ${createdRequests.length} date(s) but email failed to send: ${emailError.message}`;
        }
      }

      res.json({
        success: true,
        message: emailResponse.message,
        data: {
          requests: createdRequests.map(r => r.toJSON()),
          groupId,
          emailMode: req.user.emailPreference,
          totalDates: createdRequests.length,
          emailSent: emailResponse.sent,
          emailError: emailResponse.error || null,
          messageId: emailResponse.messageId || null,
        },
      });
    } catch (error) {
      console.error('❌ Group request creation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create group request',
        message: error.message,
      });
    }
  }
);

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

// DELETE entire group request
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
    // Only check email status - if email sent, cannot delete
    const cannotDelete = groupRequests.filter(
      req => req.emailSent || req.manualEmailConfirmed
    );

    if (cannotDelete.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete group: some requests have emails already sent',
        details: `${cannotDelete.length} out of ${groupRequests.length} requests cannot be deleted`,
      });
    }

    // Delete all requests in the group
    const deletePromises = groupRequests.map(req => req.destroy());
    await Promise.all(deletePromises);

    res.json({
      success: true,
      message: `Group request deleted successfully`,
      data: {
        deletedCount: groupRequests.length,
        groupId: request.groupId,
        deletedRequestIds: groupRequests.map(req => req.id),
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

// POST create group time-off request with manual email confirmation
router.post(
  '/requests/group-manual',
  sanitizeRequestBody(['customMessage']),
  async (req, res) => {
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

      // Ensure user is in manual mode
      if (req.user.emailPreference !== 'manual') {
        return res.status(400).json({
          success: false,
          error:
            'Manual request creation only available for users in manual email mode',
        });
      }

      console.log('🔍 Creating manual group request with data:', {
        dates,
        customMessage,
        userPreference: req.user.emailPreference,
      });

      // Generate group ID for all requests
      const groupId = uuidv4();

      // Create all requests in the group with manual email confirmed
      const requestPromises = dates.map(dateObj => {
        return TimeOffRequest.create({
          userId: req.user.id,
          groupId,
          startDate: dateObj.date,
          endDate: dateObj.date,
          type: dateObj.type.toUpperCase(),
          flightNumber:
            dateObj.type.toUpperCase() === 'FLIGHT'
              ? dateObj.flightNumber
              : null,
          customMessage: customMessage || null,
          emailMode: 'manual',
          manualEmailConfirmed: true,
          manualEmailConfirmedAt: new Date(),
        });
      });

      const createdRequests = await Promise.all(requestPromises);
      console.log(
        '✅ Created manual requests:',
        createdRequests.map(r => ({
          id: r.id,
          startDate: r.startDate,
          type: r.type,
          manualEmailConfirmed: r.manualEmailConfirmed,
        }))
      );

      res.status(201).json({
        success: true,
        message: `Group request created successfully with ${createdRequests.length} date(s). Email marked as sent.`,
        data: {
          groupId,
          requestCount: createdRequests.length,
          requests: createdRequests.map(r => r.toJSON()),
        },
      });
    } catch (error) {
      console.error('Error creating manual group request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create manual group request',
        message: error.message,
      });
    }
  }
);

// GET group details by request ID
router.get('/requests/:id/group-details', async (req, res) => {
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
      // If it's not a group request, return just this request
      return res.json({
        success: true,
        data: {
          groupId: null,
          requests: [request.toJSON()],
          totalRequests: 1,
          statusSummary: {
            pending: request.status === 'PENDING' ? 1 : 0,
            approved: request.status === 'APPROVED' ? 1 : 0,
            denied: request.status === 'DENIED' ? 1 : 0,
          },
        },
      });
    }

    // Get all requests in the group
    const groupRequests = await TimeOffRequest.getByGroupIdAndUser(
      request.groupId,
      req.user.id
    );

    // Sort by date
    groupRequests.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    res.json({
      success: true,
      data: {
        groupId: request.groupId,
        requests: groupRequests.map(r => r.toJSON()),
        totalRequests: groupRequests.length,
        statusSummary: {
          pending: groupRequests.filter(r => r.status === 'PENDING').length,
          approved: groupRequests.filter(r => r.status === 'APPROVED').length,
          denied: groupRequests.filter(r => r.status === 'DENIED').length,
        },
      },
    });
  } catch (error) {
    console.error('Error getting group details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get group details',
      message: error.message,
    });
  }
});

module.exports = router;
