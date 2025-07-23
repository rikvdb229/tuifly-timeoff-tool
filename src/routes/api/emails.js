// src/routes/api/emails.js - Email management endpoints
const express = require('express');
const { TimeOffRequest } = require('../../models');
const GmailService = require('../../services/gmailService');

const router = express.Router();

// POST resend email for specific request
router.post('/requests/:id/resend-email', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await TimeOffRequest.findByPkAndUser(id, req.user.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    // Check if user is in automatic mode
    if (req.user.emailPreference !== 'automatic') {
      return res.status(400).json({
        success: false,
        error: 'Resend is only available in automatic email mode',
      });
    }

    // Check Gmail authorization
    if (GmailService.needsReauthorization(req.user)) {
      return res.status(400).json({
        success: false,
        error: 'Gmail authorization required',
        message: 'Please authorize Gmail access to send emails automatically',
        authRequired: true,
        authUrl: '/auth/google',
      });
    }

    let requestsToResend = [request];

    // If it's a group request, get all requests in the group
    if (request.groupId) {
      requestsToResend = await TimeOffRequest.getByGroupIdAndUser(
        request.groupId,
        req.user.id
      );
    }

    // Attempt to send email
    try {
      console.log(`Resending email for request ${id}...`);
      const emailResult = await new GmailService().sendEmail(
        req.user,
        requestsToResend
      );

      // Mark all requests as email sent
      const updatePromises = requestsToResend.map(req =>
        req.markEmailSent(emailResult.messageId, emailResult.threadId)
      );
      await Promise.all(updatePromises);

      res.json({
        success: true,
        message: `Email ${request.groupId ? 'group ' : ''}resent successfully`,
        data: {
          updatedCount: requestsToResend.length,
          isGroup: request.groupId ? true : false,
          groupId: request.groupId,
          messageId: emailResult.messageId,
          threadId: emailResult.threadId,
          to: emailResult.to,
          subject: emailResult.subject,
        },
      });
    } catch (emailError) {
      console.error('Email resend failed:', emailError);

      // Mark all requests as email failed
      const updatePromises = requestsToResend.map(req =>
        req.markEmailFailed(emailError.message)
      );
      await Promise.all(updatePromises);

      res.status(500).json({
        success: false,
        error: 'Failed to resend email',
        message: emailError.message,
        canRetry: true,
        data: {
          updatedCount: requestsToResend.length,
          isGroup: request.groupId ? true : false,
        },
      });
    }
  } catch (error) {
    console.error('Error in resend email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend email',
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

    // Check if this request can be marked as manually sent
    // Only allow for requests where no automatic email was sent
    if (request.emailSent) {
      return res.status(400).json({
        success: false,
        error:
          'This request already has an automatic email sent. Cannot mark as manually sent.',
      });
    }

    if (request.manualEmailConfirmed) {
      return res.status(400).json({
        success: false,
        error: 'Email already marked as sent',
      });
    }

    // Handle group requests - mark ALL requests in the group as sent
    const updatedRequests = [];

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

// GET group email content
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

    // Generate email content (unified function handles both single and group requests)
    emailContent = await request.generateEmailContent(req.user);

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

module.exports = router;
