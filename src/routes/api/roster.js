// src/routes/api/roster.js - Public roster endpoints
const express = require('express');
const { RosterSchedule } = require('../../models');
const { logger } = require('../../utils/logger');

const router = express.Router();

// Get all roster deadlines for users with request statistics
router.get('/roster-deadlines', async (req, res) => {
  try {
    const schedules = await RosterSchedule.findAll({
      where: { isActive: true },
      order: [['latestRequestDate', 'ASC']],
    });

    const { TimeOffRequest } = require('../../models');
    const userId = req.user.id;

    // For each schedule, calculate request statistics
    const schedulesWithStats = await Promise.all(schedules.map(async (schedule) => {
      const scheduleObj = schedule.toSafeObject();
      
      // Get all requests for this user within this roster period
      const requests = await TimeOffRequest.findAll({
        where: {
          userId: userId,
          startDate: {
            [require('sequelize').Op.gte]: schedule.startPeriod
          },
          endDate: {
            [require('sequelize').Op.lte]: schedule.endPeriod
          }
        }
      });

      // Calculate statistics
      let requestedDays = 0;
      let approvedDays = 0;
      let deniedDays = 0;
      let pendingDays = 0;

      requests.forEach(request => {
        // Calculate number of days for this request
        const startDate = new Date(request.startDate);
        const endDate = new Date(request.endDate);
        const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        
        requestedDays += days;
        
        switch (request.status) {
          case 'APPROVED':
            approvedDays += days;
            break;
          case 'DENIED':
            deniedDays += days;
            break;
          case 'PENDING':
            pendingDays += days;
            break;
        }
      });

      // Add statistics to schedule object
      scheduleObj.requestStats = {
        requested: requestedDays,
        approved: approvedDays,
        denied: deniedDays,
        pending: pendingDays
      };

      return scheduleObj;
    }));

    res.json({
      success: true,
      data: schedulesWithStats,
    });
  } catch (error) {
    logger.error('Error fetching roster deadlines:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roster deadlines',
    });
  }
});


module.exports = router;