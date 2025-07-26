// src/services/ReplyCheckingService.js
const { EmailReply, TimeOffRequest, RosterSchedule } = require('../models');
const GmailService = require('./gmailService');
const { serviceLogger } = require('../utils/logger');
const { Op } = require('sequelize');

class ReplyCheckingService {
  /**
   * Check for new replies for a specific user
   * Only checks requests from the last 3 active roster periods
   */
  static async checkUserReplies(user) {
    try {
      serviceLogger.info(`Checking replies for user ${user.id}`);

      // Get requests that need reply checking
      const requestsToCheck = await this.getRequestsNeedingCheck(user.id);

      if (requestsToCheck.length === 0) {
        return { success: true, newReplies: [], updatedRequests: [], totalChecked: 0 };
      }

      const gmailService = new GmailService();
      const newReplies = [];
      const updatedRequests = [];

      // Group requests by Gmail thread ID to handle group requests correctly
      const threadGroups = new Map();
      for (const request of requestsToCheck) {
        if (!request.gmailThreadId) continue;
        
        if (!threadGroups.has(request.gmailThreadId)) {
          threadGroups.set(request.gmailThreadId, []);
        }
        threadGroups.get(request.gmailThreadId).push(request);
      }

      serviceLogger.info(`Processing ${threadGroups.size} unique Gmail threads for ${requestsToCheck.length} requests`);

      // Process each unique thread only once
      for (const [threadId, requestsInThread] of threadGroups) {
        try {
          // Find the last processed message ID from existing EmailReply records for this thread
          const lastProcessedReply = await EmailReply.findOne({
            where: { gmailThreadId: threadId },
            order: [['receivedAt', 'DESC']], // Most recent reply record by when it was received
            attributes: ['gmailMessageId']
          });
          
          const lastProcessedMessageId = lastProcessedReply ? lastProcessedReply.gmailMessageId : null;
          
          serviceLogger.info(`Thread ${threadId} last processed message analysis:`, {
            requestCount: requestsInThread.length,
            lastProcessedMessageId: lastProcessedMessageId
          });

          serviceLogger.info(`Checking thread ${threadId} for ${requestsInThread.length} requests (last processed message: ${lastProcessedMessageId || 'none'})`);

          const result = await gmailService.checkForReplies(
            user,
            threadId,
            lastProcessedMessageId
          );

          const checkTime = new Date(); // Always use current time for lastReplyCheck
          
          if (result.success && result.newMessages.length > 0) {
            serviceLogger.info(`Found ${result.newMessages.length} new messages in thread ${threadId}`);

            // For group requests: create ONE reply record per message, linked to the first request
            const primaryRequest = requestsInThread[0];
            
            for (const message of result.newMessages) {
              // Only create EmailReply records for scheduling messages, not user replies
              if (!message.isUserReply) {
                // Check if this Gmail message already has a reply record (prevent duplicates)
                const existingReply = await EmailReply.findOne({
                  where: {
                    gmailMessageId: message.id,
                    gmailThreadId: threadId
                  }
                });

                if (!existingReply) {
                  const reply = await EmailReply.create({
                    timeOffRequestId: primaryRequest.id, // Link to primary request only
                    gmailMessageId: message.id,
                    gmailThreadId: threadId,
                    fromEmail: message.from,
                    fromName: this.extractNameFromEmail(message.from),
                    replyContent: message.body,
                    replySnippet: message.body.substring(0, 500),
                    receivedAt: message.receivedAt,
                    isProcessed: false,
                  });
                  newReplies.push(reply);
                  serviceLogger.info(`Created EmailReply ${reply.id} for scheduling message ${message.id} (thread ${threadId})`);
                } else {
                  serviceLogger.info(`EmailReply already exists for message ${message.id}, skipping`);
                }
              } else {
                serviceLogger.info(`Skipping EmailReply creation for user message ${message.id} - user replies don't need reply records`);
              }
            }

            // Check if the latest message is a user reply (user has reviewed by responding)
            const latestMessage = result.newMessages[result.newMessages.length - 1];
            const needsReview = !latestMessage.isUserReply; // false if user replied (reviewed), true if scheduling replied (needs review)
            
            serviceLogger.info(`Latest message in thread ${threadId} is ${latestMessage.isUserReply ? 'user reply' : 'scheduling reply'} - setting needsReview=${needsReview}`);

            // Get the latest message timestamp for lastReplyAt
            const latestMessageTime = latestMessage.receivedAt;

            // Update ALL requests in this thread group
            for (const request of requestsInThread) {
              const updateData = {
                needs_review: needsReview,  // Try using database field name directly
                needsReview: needsReview,   // Also keep the model property name
                replyCount: request.replyCount + result.newMessages.length,
                lastReplyAt: latestMessageTime,
                lastReplyCheck: checkTime,
              };
              
              serviceLogger.info(`Updating request ${request.id} with data:`, {
                updateData,
                currentNeedsReview: request.needsReview,
                newNeedsReview: needsReview
              });
              
              await request.update(updateData);
              
              // Force reload to verify update
              await request.reload();
              serviceLogger.info(`After update - request ${request.id} needsReview is now: ${request.needsReview}`);
              
              updatedRequests.push(request);
            }

            serviceLogger.info(`Updated ${requestsInThread.length} requests in thread ${threadId} with needsReview=${needsReview}`);
          } else {
            serviceLogger.info(`No new messages in thread ${threadId}`);
            
            // Update last check time for all requests in this thread
            for (const request of requestsInThread) {
              await request.update({ lastReplyCheck: checkTime });
            }
            serviceLogger.info(`Updated lastReplyCheck for ${requestsInThread.length} requests`);
          }
        } catch (error) {
          serviceLogger.logError(error, {
            operation: 'checkThreadReplies',
            threadId: threadId,
            requestCount: requestsInThread.length,
            requestIds: requestsInThread.map(r => r.id),
            userId: user.id,
          });
          // Continue with other threads
        }
      }

      return {
        success: true,
        newReplies,
        updatedRequests,
        totalChecked: requestsToCheck.length,
      };
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'checkUserReplies',
        userId: user.id,
      });
      throw error;
    }
  }

  /**
   * Get requests that need reply checking (last 3 roster periods)
   */
  static async getRequestsNeedingCheck(userId) {
    try {
      // Get all active roster periods
      const allPeriods = await RosterSchedule.findAll({
        where: { isActive: true },
        order: [['startPeriod', 'ASC']],
      });

      serviceLogger.info(`Found ${allPeriods.length} active roster periods for reply checking`);

      if (allPeriods.length === 0) return [];

      // Find periods that cover current date and recent past (last 90 days)
      const today = new Date();
      const ninetyDaysAgo = new Date(today.getTime() - (90 * 24 * 60 * 60 * 1000));
      
      // Get periods that either:
      // 1. Are currently active (today falls within the period), or
      // 2. Started within the last 90 days, or  
      // 3. End after 90 days ago
      const relevantPeriods = allPeriods.filter(period => {
        const startDate = new Date(period.startPeriod);
        const endDate = new Date(period.endPeriod);
        
        return (
          // Currently active period (today is within the period)
          (startDate <= today && endDate >= today) ||
          // Period started within last 90 days
          (startDate >= ninetyDaysAgo) ||
          // Period ends after 90 days ago (overlaps with our timeframe)
          (endDate >= ninetyDaysAgo)
        );
      });

      serviceLogger.info(`Found ${relevantPeriods.length} relevant roster periods (current + last 90 days)`);
      
      if (relevantPeriods.length === 0) {
        // Fallback: use the 3 most recent periods if no relevant ones found
        const fallbackPeriods = allPeriods.slice(-3);
        serviceLogger.info(`Using fallback: last 3 periods from ${allPeriods.length} total periods`);
        
        if (fallbackPeriods.length === 0) return [];
        
        const oldestPeriod = fallbackPeriods[0];
        const newestPeriod = fallbackPeriods[fallbackPeriods.length - 1];
        
        serviceLogger.info(`Fallback checking requests between ${oldestPeriod.startPeriod} and ${newestPeriod.endPeriod}`);
        
        // Use fallback periods for date range
        var dateRangeStart = oldestPeriod.startPeriod;
        var dateRangeEnd = newestPeriod.endPeriod;
      } else {
        // Use relevant periods
        const oldestRelevant = relevantPeriods[0];
        const newestRelevant = relevantPeriods[relevantPeriods.length - 1];
        
        serviceLogger.info(`Checking requests between ${oldestRelevant.startPeriod} and ${newestRelevant.endPeriod}`);
        
        var dateRangeStart = oldestRelevant.startPeriod;
        var dateRangeEnd = newestRelevant.endPeriod;
      }

      // First, get all requests for the user in the date range to see what we have
      const allUserRequests = await TimeOffRequest.findAll({
        where: {
          userId: userId,
          startDate: {
            [Op.between]: [dateRangeStart, dateRangeEnd],
          },
        },
        order: [['startDate', 'DESC']],
      });

      serviceLogger.info(`Found ${allUserRequests.length} total requests for user in date range`);

      // Now filter for requests that have email info and need checking
      // Only check PENDING requests - skip already approved/denied ones
      const requestsNeedingCheck = await TimeOffRequest.findAll({
        where: {
          userId: userId,
          emailSent: { [Op.ne]: null },
          gmailThreadId: { [Op.ne]: null },
          status: 'PENDING', // Only check pending requests
          startDate: {
            [Op.between]: [dateRangeStart, dateRangeEnd],
          },
        },
        order: [['emailSent', 'DESC']],
      });

      serviceLogger.info(`Found ${requestsNeedingCheck.length} requests that need reply checking (have emailSent and gmailThreadId)`);

      return requestsNeedingCheck;
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'getRequestsNeedingCheck',
        userId: userId,
      });
      return [];
    }
  }

  /**
   * Extract name from email address
   */
  static extractNameFromEmail(fromString) {
    const match = fromString.match(/^(.*?)\s*<(.+@.+)>$/);
    return match ? match[1].replace(/"/g, '').trim() : fromString;
  }

  /**
   * Process a reply and update request status
   * For group requests, this updates ALL requests in the same Gmail thread
   */
  static async processReply(replyId, newStatus, userId) {
    try {
      const reply = await EmailReply.findByPk(replyId, {
        include: [{ model: TimeOffRequest, required: true }],
      });

      if (!reply) {
        throw new Error('Reply not found');
      }

      const linkedRequest = reply.TimeOffRequest;

      // Find ALL requests that share the same Gmail thread (group requests)
      const allRequestsInGroup = await TimeOffRequest.findAll({
        where: {
          gmailThreadId: reply.gmailThreadId,
          userId: linkedRequest.userId, // Ensure same user
          status: 'PENDING' // Only update pending requests
        }
      });

      serviceLogger.info(`Processing reply ${replyId}: Found ${allRequestsInGroup.length} pending requests in Gmail thread ${reply.gmailThreadId}`);

      // Mark reply as processed
      await reply.markAsProcessed(userId);

      // Update ALL pending requests in the group with the same status
      const updatedRequests = [];
      for (const request of allRequestsInGroup) {
        await request.update({
          status: newStatus,
          needsReview: false,
        });
        updatedRequests.push(request);
        serviceLogger.info(`Updated request ${request.id} (${request.startDate}) to status: ${newStatus}`);
      }

      // Check if there are other unprocessed replies for this Gmail thread
      const unprocessedCount = await EmailReply.count({
        where: {
          gmailThreadId: reply.gmailThreadId,
          isProcessed: false,
        },
      });

      // If no more unprocessed replies for this thread, remove needs_review flag from all requests
      if (unprocessedCount === 0) {
        for (const request of allRequestsInGroup) {
          await request.update({ needsReview: false });
        }
        serviceLogger.info(`Removed needsReview flag from ${allRequestsInGroup.length} requests in thread ${reply.gmailThreadId}`);
      }

      return { 
        success: true, 
        linkedRequest, // The request the reply was linked to
        allUpdatedRequests: updatedRequests, // All requests that were updated
        reply 
      };
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'processReply',
        replyId,
        newStatus,
        userId,
      });
      throw error;
    }
  }
}

module.exports = ReplyCheckingService;