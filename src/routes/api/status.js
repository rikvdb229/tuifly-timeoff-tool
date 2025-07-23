// src/routes/api/status.js - Request status management endpoints
const express = require('express');
const { TimeOffRequest } = require('../../models');
const { sanitizeRequestBody } = require('../../utils/sanitize');

const router = express.Router();

// PUT manually override request status
router.put(
  '/requests/:id/status',
  sanitizeRequestBody(['status', 'method']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        status,
        method = 'manual_user_update',
        updateGroup = false,
      } = req.body;

      // Validate status
      if (!['APPROVED', 'DENIED', 'PENDING'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status',
          message: 'Status must be APPROVED, DENIED, or PENDING',
        });
      }

      const request = await TimeOffRequest.findByPkAndUser(id, req.user.id);

      if (!request) {
        return res.status(404).json({
          success: false,
          error: 'Request not found',
        });
      }

      // Check if request can be updated
      const requestEmailMode = request.emailMode || 'automatic';
      const emailSent =
        (requestEmailMode === 'automatic' && request.emailSent) ||
        (requestEmailMode === 'manual' && request.manualEmailConfirmed);

      if (!emailSent) {
        return res.status(400).json({
          success: false,
          error: 'Cannot update status before email is sent',
          message: 'Please send the email first before updating the status',
        });
      }

      let requestsToUpdate = [request];

      // If updateGroup is true and it's a group request, update all requests in the group
      if (updateGroup && request.groupId) {
        requestsToUpdate = await TimeOffRequest.getByGroupIdAndUser(
          request.groupId,
          req.user.id
        );
      }

      // Update request status
      const updateData = {
        status: status,
        statusUpdateMethod: method,
        statusUpdatedAt: new Date(),
      };

      // Set approval/denial date
      if (status === 'APPROVED') {
        updateData.approvalDate = new Date();
        updateData.denialReason = null;
      } else if (status === 'DENIED') {
        updateData.approvalDate = null;
        // Could add denialReason field here if needed
      } else if (status === 'PENDING') {
        // Reset both dates for pending
        updateData.approvalDate = null;
        updateData.denialReason = null;
      }

      // Update all requests
      const updatePromises = requestsToUpdate.map(req =>
        req.update(updateData)
      );
      await Promise.all(updatePromises);

      res.json({
        success: true,
        message: `Request${requestsToUpdate.length > 1 ? 's' : ''} marked as ${status.toLowerCase()} successfully`,
        data: {
          updatedCount: requestsToUpdate.length,
          status: status,
          statusUpdatedAt: updateData.statusUpdatedAt,
          isGroup: request.groupId ? true : false,
          groupId: request.groupId,
          method: method,
          updateGroup: updateGroup,
        },
      });
    } catch (error) {
      console.error('Error updating request status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update request status',
        message: error.message,
      });
    }
  }
);

module.exports = router;
