// src/routes/api/replies.js
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const ReplyCheckingService = require('../../services/ReplyCheckingService');
const { EmailReply, TimeOffRequest, RosterSchedule } = require('../../models');
const { sequelize } = require('../../../config/database');
const { routeLogger } = require('../../utils/logger');
const GmailService = require('../../services/gmailService');
const { Op } = require('sequelize');

const router = express.Router();

// Apply authentication middleware
router.use(requireAuth);

/**
 * POST /api/check-replies
 * Manually trigger reply checking for current user
 */
router.post('/check-replies', async (req, res) => {
  try {
    const result = await ReplyCheckingService.checkUserReplies(req.user);

    routeLogger.info(`Reply check completed for user ${req.user.id}`, {
      newReplies: result.newReplies.length,
      updatedRequests: result.updatedRequests.length,
    });

    res.json({
      success: true,
      data: {
        newRepliesCount: result.newReplies.length,
        updatedRequests: result.updatedRequests.map(r => ({
          id: r.id,
          needsReview: r.needsReview,
        })),
        totalChecked: result.totalChecked,
      },
      message: `Found ${result.newReplies.length} new replies`,
    });
  } catch (error) {
    routeLogger.logError(error, {
      operation: 'checkReplies',
      userId: req.user.id,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check for replies',
    });
  }
});

/**
 * GET /api/replies
 * Get replies with filtering
 */
router.get('/replies', async (req, res) => {
  try {
    const { filter = 'needreview', page = 1, limit = 20 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get current roster period date range to filter old replies
    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    // Get relevant roster periods (current + last 90 days)
    const relevantPeriods = await RosterSchedule.findAll({
      where: {
        isActive: true,
        [Op.or]: [
          // Currently active period
          {
            startPeriod: { [Op.lte]: today },
            endPeriod: { [Op.gte]: today }
          },
          // Period started within last 90 days
          { startPeriod: { [Op.gte]: ninetyDaysAgo } },
          // Period ends after 90 days ago
          { endPeriod: { [Op.gte]: ninetyDaysAgo } }
        ]
      },
      order: [['startPeriod', 'ASC']]
    });

    let dateRangeStart, dateRangeEnd;
    if (relevantPeriods.length > 0) {
      dateRangeStart = relevantPeriods[0].startPeriod;
      dateRangeEnd = relevantPeriods[relevantPeriods.length - 1].endPeriod;
    } else {
      // Fallback: use last 90 days
      dateRangeStart = ninetyDaysAgo;
      dateRangeEnd = today;
    }

    // Build where clause based on filter
    let whereClause = {};
    switch (filter) {
      case 'needreview':
        whereClause.isProcessed = false;
        break;
      case 'reviewed':
        whereClause.isProcessed = true;
        break;
      case 'all':
        // No additional filter
        break;
      default:
        whereClause.isProcessed = false;
    }

    // For reviewed section, we need to handle duplicates differently
    let replies;
    if (filter === 'reviewed') {
      // First get distinct thread IDs for processed replies
      const distinctThreads = await EmailReply.findAll({
        where: whereClause,
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('gmail_thread_id')), 'gmailThreadId']],
        include: [
          {
            model: TimeOffRequest,
            where: { userId: req.user.id },
            required: true,
            attributes: [],
          },
        ],
        raw: true,
      });

      const threadIds = distinctThreads.map(t => t.gmailThreadId);
      
      // Now get the latest reply for each thread
      const repliesData = [];
      for (const threadId of threadIds) {
        const latestReply = await EmailReply.findOne({
          where: {
            ...whereClause,
            gmailThreadId: threadId,
          },
          include: [
            {
              model: TimeOffRequest,
              where: { userId: req.user.id },
              required: true,
              attributes: [
                'id',
                'startDate',
                'endDate',
                'type',
                'status',
                'flightNumber',
                'customMessage',
                'gmailThreadId',
                'needsReview',
                'emailSent',
              ],
            },
          ],
          order: [['receivedAt', 'DESC']],
        });
        if (latestReply) {
          repliesData.push(latestReply);
        }
      }
      
      // Sort by receivedAt DESC and apply pagination
      repliesData.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
      const paginatedReplies = repliesData.slice(offset, offset + parseInt(limit));
      
      replies = {
        rows: paginatedReplies,
        count: threadIds.length,
      };
    } else {
      // For other filters, use the standard query
      replies = await EmailReply.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: TimeOffRequest,
            where: { 
              userId: req.user.id,
              startDate: {
                [Op.between]: [dateRangeStart, dateRangeEnd]
              }
            },
            required: true,
            attributes: [
              'id',
              'startDate',
              'endDate',
              'type',
              'status',
              'flightNumber',
              'customMessage',
              'gmailThreadId',
              'needsReview',
              'emailSent',
            ],
          },
        ],
        order: [['receivedAt', 'DESC']],
        limit: parseInt(limit),
        offset: offset,
      });
    }

    // For each reply, fetch all requests in the same Gmail thread for group request handling
    // Also fetch all replies in the thread to show conversation history
    const repliesWithGroupRequests = await Promise.all(
      replies.rows.map(async (reply) => {
        const allRequestsInGroup = await TimeOffRequest.findAll({
          where: {
            gmailThreadId: reply.TimeOffRequest.gmailThreadId,
            userId: req.user.id,
            startDate: {
              [Op.between]: [dateRangeStart, dateRangeEnd]
            }
          },
          attributes: [
            'id',
            'startDate',
            'endDate',
            'type',
            'status',
            'flightNumber',
            'customMessage',
          ],
          order: [['startDate', 'ASC']],
        });

        // Fetch all replies in this thread to show conversation history
        const threadReplies = await EmailReply.findAll({
          where: {
            gmailThreadId: reply.gmailThreadId,
          },
          attributes: [
            'id',
            'fromEmail',
            'fromName',
            'replyContent',
            'receivedAt',
            'userReplySent',
            'userReplyContent',
            'userReplySentAt',
          ],
          order: [['receivedAt', 'DESC']], // Newest first
        });

        // Get the original request details to show initial email
        const originalRequest = allRequestsInGroup[0]; // First request in the group

        return {
          ...reply.toJSON(),
          allRequestsInGroup,
          threadReplies, // Include all replies in the thread
        };
      })
    );

    res.json({
      success: true,
      data: {
        replies: repliesWithGroupRequests,
        totalCount: replies.count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(replies.count / parseInt(limit)),
      },
    });
  } catch (error) {
    routeLogger.logError(error, {
      operation: 'getReplies',
      userId: req.user.id,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to load replies',
    });
  }
});

/**
 * PUT /api/replies/:id/process
 * Mark reply as processed and update request status (bulk)
 */
router.put('/replies/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['APPROVED', 'DENIED', 'PENDING'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be APPROVED, DENIED, or PENDING',
      });
    }

    const result = await ReplyCheckingService.processReply(
      id,
      status,
      req.user.id
    );

    res.json({
      success: true,
      data: result,
      message: `Reply marked as ${status.toLowerCase()}`,
    });
  } catch (error) {
    routeLogger.logError(error, {
      operation: 'processReply',
      replyId: req.params.id,
      userId: req.user.id,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process reply',
    });
  }
});

/**
 * PUT /api/replies/:id/process-individual
 * Process reply with individual request statuses for group requests
 */
router.put('/replies/:id/process-individual', async (req, res) => {
  try {
    const { id } = req.params;
    const { requestStatuses } = req.body; // Array of {requestId, status}

    if (!requestStatuses || !Array.isArray(requestStatuses)) {
      return res.status(400).json({
        success: false,
        error: 'requestStatuses array is required',
      });
    }

    // Validate all statuses
    for (const { requestId, status } of requestStatuses) {
      if (!requestId || !['APPROVED', 'DENIED', 'PENDING'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Each request must have valid requestId and status',
        });
      }
    }

    const reply = await EmailReply.findByPk(id, {
      include: [{ model: TimeOffRequest, required: true }],
    });

    if (!reply) {
      return res.status(404).json({
        success: false,
        error: 'Reply not found',
      });
    }

    // Mark reply as processed
    await reply.markAsProcessed(req.user.id);

    // Update each request individually
    const updatedRequests = [];
    for (const { requestId, status } of requestStatuses) {
      const request = await TimeOffRequest.findByPk(requestId);
      if (request && request.userId === req.user.id) {
        await request.update({
          status: status,
          needsReview: false,
        });
        updatedRequests.push(request);
        routeLogger.info(`Updated request ${requestId} to ${status} via individual processing`);
      }
    }

    res.json({
      success: true,
      data: {
        reply,
        updatedRequests,
      },
      message: `Reply processed with individual statuses`,
    });
  } catch (error) {
    routeLogger.logError(error, {
      operation: 'processReplyIndividual',
      replyId: req.params.id,
      userId: req.user.id,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process reply',
    });
  }
});

/**
 * GET /api/replies/count
 * Get unread reply count for badge
 */
router.get('/replies/count', async (req, res) => {
  try {
    // Use the same roster period filtering as the main replies endpoint
    const today = new Date();
    const ninetyDaysAgo = new Date(today.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    // Get relevant roster periods (current + last 90 days)
    const relevantPeriods = await RosterSchedule.findAll({
      where: {
        isActive: true,
        [Op.or]: [
          // Currently active period
          {
            startPeriod: { [Op.lte]: today },
            endPeriod: { [Op.gte]: today }
          },
          // Period started within last 90 days
          { startPeriod: { [Op.gte]: ninetyDaysAgo } },
          // Period ends after 90 days ago
          { endPeriod: { [Op.gte]: ninetyDaysAgo } }
        ]
      },
      order: [['startPeriod', 'ASC']]
    });

    let dateRangeStart, dateRangeEnd;
    if (relevantPeriods.length > 0) {
      dateRangeStart = relevantPeriods[0].startPeriod;
      dateRangeEnd = relevantPeriods[relevantPeriods.length - 1].endPeriod;
    } else {
      // Fallback: use last 90 days
      dateRangeStart = ninetyDaysAgo;
      dateRangeEnd = today;
    }

    // Count unprocessed replies with roster period filtering
    const count = await EmailReply.count({
      where: { isProcessed: false },
      include: [
        {
          model: TimeOffRequest,
          where: { 
            userId: req.user.id,
            startDate: {
              [Op.between]: [dateRangeStart, dateRangeEnd]
            }
          },
          required: true,
        },
      ],
    });

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    routeLogger.logError(error, {
      operation: 'getRepliesCount',
      userId: req.user.id,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get replies count',
    });
  }
});

/**
 * POST /api/replies/:id/respond
 * Send threaded reply (for automatic email users only)
 */
router.post('/replies/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    // Check if user has automatic email enabled
    if (req.user.emailPreference !== 'automatic') {
      return res.status(403).json({
        success: false,
        error: 'Reply feature only available for automatic email users',
      });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required',
      });
    }

    const reply = await EmailReply.findByPk(id, {
      include: [{ model: TimeOffRequest, required: true }],
    });

    if (!reply) {
      return res.status(404).json({
        success: false,
        error: 'Reply not found',
      });
    }

    // Use Gmail service to send threaded reply
    const gmailService = new GmailService();
    const result = await gmailService.sendThreadedReply(
      req.user,
      reply.gmailThreadId,
      reply.fromEmail,
      message.trim()
    );

    // Update reply with sent user reply information and mark as processed
    await reply.update({
      isProcessed: true,  // Mark as processed since user has responded
      processedAt: new Date(),
      processedBy: req.user.id,
      userReplySent: true,
      userReplyContent: message.trim(),
      userReplySentAt: new Date()
    });

    // Reset needsReview for all requests in this thread since we sent a reply
    // We're now waiting for a new manager response
    const requestsInThread = await TimeOffRequest.findAll({
      where: {
        gmailThreadId: reply.gmailThreadId,
        userId: req.user.id
      }
    });

    for (const request of requestsInThread) {
      await request.update({
        needsReview: false
        // Don't update lastReplyCheck here - let the checking service handle it properly
      });
    }

    routeLogger.info(`Reply sent and review status reset for ${requestsInThread.length} requests in thread ${reply.gmailThreadId}`, {
      userId: req.user.id,
      replyId: id,
      threadId: reply.gmailThreadId
    });

    res.json({
      success: true,
      data: result,
      message: 'Reply sent successfully',
    });
  } catch (error) {
    routeLogger.logError(error, {
      operation: 'sendReply',
      replyId: req.params.id,
      userId: req.user.id,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send reply',
    });
  }
});

module.exports = router;