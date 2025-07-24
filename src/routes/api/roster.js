// src/routes/api/roster.js - Public roster endpoints
const express = require('express');
const { RosterSchedule } = require('../../models');
const { logger } = require('../../utils/logger');

const router = express.Router();

// Get all roster deadlines for users
router.get('/roster-deadlines', async (req, res) => {
  try {
    const schedules = await RosterSchedule.findAll({
      where: { isActive: true },
      order: [['latestRequestDate', 'ASC']],
    });

    const schedulesWithStatus = schedules.map(schedule => schedule.toSafeObject());

    res.json({
      success: true,
      data: schedulesWithStatus,
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