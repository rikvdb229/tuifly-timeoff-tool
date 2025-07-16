// src/models/TimeOffRequest.js
const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

function defineTimeOffRequest(sequelize) {
  const TimeOffRequest = sequelize.define(
    'TimeOffRequest',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      groupId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'UUID linking multiple days in single request',
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM('REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'DENIED'),
        defaultValue: 'PENDING',
      },
      flightNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isTUIFlyFormat(value) {
            if (this.type === 'FLIGHT' && value && !value.startsWith('TB')) {
              throw new Error('TUIfly flight numbers must start with TB');
            }
          },
        },
      },
      customMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      emailSent: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      threadId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      approvalDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      approvedBy: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Email of approver',
      },
      denialReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'time_off_requests',
      timestamps: true,
      indexes: [
        {
          fields: ['userId', 'startDate'],
        },
        {
          fields: ['userId', 'status'],
        },
        {
          fields: ['groupId'],
        },
      ],
      validate: {
        endDateAfterStartDate() {
          if (this.endDate < this.startDate) {
            throw new Error('End date must be after start date');
          }
        },
        flightNumberRequired() {
          if (this.type === 'FLIGHT' && !this.flightNumber) {
            throw new Error('Flight number is required for flight requests');
          }
        },
      },
      hooks: {
        beforeCreate: (request) => {
          // Generate groupId for single day requests if not provided
          if (!request.groupId) {
            request.groupId = uuidv4();
          }
        },
      },
    }
  );

  // Instance methods
  TimeOffRequest.prototype.isEditable = function () {
    return this.status === 'PENDING';
  };

  TimeOffRequest.prototype.canBeDeleted = function () {
    return this.status === 'PENDING' || this.status === 'DENIED';
  };

  TimeOffRequest.prototype.getDisplayType = function () {
    const typeMap = {
      REQ_DO: 'Day Off',
      PM_OFF: 'PM Off',
      AM_OFF: 'AM Off',
      FLIGHT: 'Flight',
    };
    return typeMap[this.type] || this.type;
  };

  // Class methods for user isolation
  TimeOffRequest.findAllByUser = async function (userId, options = {}) {
    return await this.findAll({
      where: { userId, ...options.where },
      ...options,
      order: options.order || [['createdAt', 'DESC']],
    });
  };

  TimeOffRequest.findByPkAndUser = async function (id, userId) {
    return await this.findOne({
      where: { id, userId },
    });
  };

  TimeOffRequest.createForUser = async function (userId, requestData) {
    return await this.create({
      ...requestData,
      userId,
    });
  };

  TimeOffRequest.createGroupRequest = async function (userId, requestData) {
    const { dates, customMessage } = requestData;
    const groupId = uuidv4();
    const requests = [];

    for (const dateInfo of dates) {
      const request = await this.create({
        userId,
        groupId,
        startDate: dateInfo.date,
        endDate: dateInfo.date,
        type: dateInfo.type,
        flightNumber: dateInfo.flightNumber || null,
        customMessage,
      });
      requests.push(request);
    }

    return requests;
  };

  TimeOffRequest.getByGroupIdAndUser = async function (groupId, userId) {
    return await this.findAll({
      where: { groupId, userId },
      order: [['startDate', 'ASC']],
    });
  };

  TimeOffRequest.getConflictsForUser = async function (
    userId,
    startDate,
    endDate,
    excludeGroupId
  ) {
    const { Op } = require('sequelize');

    const whereClause = {
      userId,
      [Op.and]: [
        {
          startDate: {
            [Op.lte]: endDate,
          },
        },
        {
          endDate: {
            [Op.gte]: startDate,
          },
        },
        {
          status: {
            [Op.in]: ['PENDING', 'APPROVED'],
          },
        },
      ],
    };

    if (excludeGroupId) {
      whereClause[Op.and].push({
        groupId: {
          [Op.ne]: excludeGroupId,
        },
      });
    }

    return await this.findAll({
      where: whereClause,
      order: [['startDate', 'ASC']],
    });
  };

  TimeOffRequest.getStatusCountsForUser = async function (userId) {
    const { Op } = require('sequelize');

    const counts = await this.findAll({
      where: { userId },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    const result = {
      PENDING: 0,
      APPROVED: 0,
      DENIED: 0,
      TOTAL: 0,
    };

    counts.forEach((count) => {
      result[count.status] = parseInt(count.count);
      result.TOTAL += parseInt(count.count);
    });

    return result;
  };

  TimeOffRequest.deleteByIdAndUser = async function (id, userId) {
    const request = await this.findByPkAndUser(id, userId);
    if (!request) {
      throw new Error('Request not found');
    }

    if (!request.canBeDeleted()) {
      throw new Error('Request cannot be deleted');
    }

    await request.destroy();
    return request;
  };

  return TimeOffRequest;
}

module.exports = defineTimeOffRequest;
