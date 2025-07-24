// src/models/RosterSchedule.js
const { DataTypes } = require('sequelize');

/**
 * Defines the RosterSchedule model for managing TUIfly roster publication dates and request deadlines
 * @param {Object} sequelize - Sequelize instance
 * @returns {Object} RosterSchedule model with all methods
 */
function defineRosterSchedule(sequelize) {
  const RosterSchedule = sequelize.define(
    'RosterSchedule',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      publicationDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'Date when the roster is published by TUIfly',
      },
      latestRequestDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'Latest date crew can submit time-off requests for this roster period',
      },
      startPeriod: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'Start date of the roster period',
      },
      endPeriod: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'End date of the roster period',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this roster schedule is active for request calculations',
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Optional description for this roster period (e.g., "Summer 2024 Schedule")',
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'User ID of admin who created this roster schedule',
        references: {
          model: 'users',
          key: 'id',
        },
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'User ID of admin who last updated this roster schedule',
        references: {
          model: 'users',
          key: 'id',
        },
      },
    },
    {
      indexes: [
        {
          fields: ['publicationDate'],
        },
        {
          fields: ['latestRequestDate'],
        },
        {
          fields: ['startPeriod', 'endPeriod'],
        },
        {
          fields: ['isActive'],
        },
      ],
    }
  );

  // Class methods
  RosterSchedule.getActiveSchedules = async function () {
    return await this.findAll({
      where: { isActive: true },
      order: [['publicationDate', 'ASC']],
    });
  };

  RosterSchedule.getScheduleForDate = async function (targetDate) {
    const { Op } = require('sequelize');
    return await this.findOne({
      where: {
        isActive: true,
        startPeriod: { [Op.lte]: targetDate },
        endPeriod: { [Op.gte]: targetDate },
      },
    });
  };

  RosterSchedule.getUpcomingSchedules = async function (limit = 10) {
    const { Op } = require('sequelize');
    const today = new Date().toISOString().split('T')[0];
    return await this.findAll({
      where: {
        isActive: true,
        publicationDate: { [Op.gte]: today },
      },
      order: [['publicationDate', 'ASC']],
      limit,
    });
  };

  RosterSchedule.getRequestDeadlineForDate = async function (targetDate) {
    const schedule = await this.getScheduleForDate(targetDate);
    if (!schedule) {
      return null;
    }
    
    return {
      deadline: schedule.latestRequestDate,
      publicationDate: schedule.publicationDate,
      rosterPeriod: {
        start: schedule.startPeriod,
        end: schedule.endPeriod,
      },
      description: schedule.description,
    };
  };

  // Instance methods
  RosterSchedule.prototype.isRequestAllowed = function (requestDate = new Date()) {
    const today = new Date().toISOString().split('T')[0];
    const latestRequest = this.latestRequestDate;
    
    return requestDate <= latestRequest && today <= latestRequest;
  };

  RosterSchedule.prototype.getDaysUntilDeadline = function () {
    const today = new Date();
    const deadline = new Date(this.latestRequestDate);
    const diffTime = deadline - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  };

  RosterSchedule.prototype.getStatus = function () {
    const today = new Date().toISOString().split('T')[0];
    const publicationDate = this.publicationDate;
    const latestRequestDate = this.latestRequestDate;
    
    if (today > publicationDate) {
      return 'published';
    } else if (today > latestRequestDate) {
      return 'deadline_passed';
    } else {
      return 'accepting_requests';
    }
  };

  RosterSchedule.prototype.toSafeObject = function () {
    return {
      id: this.id,
      publicationDate: this.publicationDate,
      latestRequestDate: this.latestRequestDate,
      startPeriod: this.startPeriod,
      endPeriod: this.endPeriod,
      isActive: this.isActive,
      description: this.description,
      status: this.getStatus(),
      daysUntilDeadline: this.getDaysUntilDeadline(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  };

  return RosterSchedule;
}

module.exports = defineRosterSchedule;