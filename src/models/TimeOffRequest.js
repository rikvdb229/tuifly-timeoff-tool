// src/models/TimeOffRequest.js
const { DataTypes, Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

/**
 * Defines the TimeOffRequest model for the database
 * @param {Object} sequelize - Sequelize instance
 * @returns {Object} TimeOffRequest model with associations and instance methods
 */
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
      // NEW EMAIL TRACKING FIELDS
      emailSent: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp when email was sent',
      },
      emailFailed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether automatic email sending failed',
      },
      emailFailedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp when email sending failed',
      },
      emailFailedReason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Reason why email failed (for debugging)',
      },
      gmailMessageId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Gmail message ID for tracking replies',
      },
      gmailThreadId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Gmail thread ID for reply tracking',
      },
      lastReplyCheck: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Last time we checked for replies',
      },
      manualEmailConfirmed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Whether user confirmed they sent the email manually',
      },
      manualEmailContent: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          'Generated email content for manual sending (subject, body, to)',
      },
      emailMode: {
        type: DataTypes.ENUM('automatic', 'manual'),
        allowNull: true,
        comment: 'Which email mode was used when this request was created',
      },
      replyReceived: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp when reply was received',
      },
      replyContent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Content of the reply for reference',
      },
      autoApproved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether status was auto-updated from reply',
      },
      // EXISTING FIELDS
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
      statusUpdateMethod: {
        type: DataTypes.STRING,
        allowNull: true,
        comment:
          'How the status was updated: manual_user_update, auto_reply_detection, admin_override',
      },
      statusUpdatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the status was last updated',
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
        {
          fields: ['gmailMessageId'],
        },
        {
          fields: ['gmailThreadId'],
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
    // Can only delete if no email has been sent (automatic or manual)
    return !this.emailSent && !this.manualEmailConfirmed;
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

  // NEW EMAIL METHODS
  TimeOffRequest.prototype.isEmailSent = function () {
    return this.emailSent !== null;
  };

  TimeOffRequest.prototype.hasReply = function () {
    return this.replyReceived !== null;
  };

  TimeOffRequest.prototype.needsReplyCheck = function () {
    // Check for replies if email was sent but no reply received
    // and last check was more than 1 hour ago
    if (!this.isEmailSent() || this.hasReply()) {
      return false;
    }

    if (!this.lastReplyCheck) {
      return true;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.lastReplyCheck < oneHourAgo;
  };

  TimeOffRequest.prototype.markEmailSent = function (
    gmailMessageId,
    gmailThreadId
  ) {
    return this.update({
      emailSent: new Date(),
      gmailMessageId,
      gmailThreadId,
      // Clear any previous failure state
      emailFailed: false,
      emailFailedAt: null,
      emailFailedReason: null,
    });
  };
  TimeOffRequest.prototype.markEmailFailed = function (reason) {
    return this.update({
      emailFailed: true,
      emailFailedAt: new Date(),
      emailFailedReason: reason,
      emailSent: null, // Clear any previous success
      gmailMessageId: null,
      gmailThreadId: null,
    });
  };

  TimeOffRequest.prototype.canResendEmail = function () {
    return (
      this.emailFailed &&
      this.status === 'PENDING' &&
      this.emailMode === 'automatic'
    );
  };

  TimeOffRequest.prototype.markReplyReceived = function (
    replyContent,
    autoStatus = null
  ) {
    const updates = {
      replyReceived: new Date(),
      replyContent,
      lastReplyCheck: new Date(),
    };

    if (autoStatus && ['APPROVED', 'DENIED'].includes(autoStatus)) {
      updates.status = autoStatus;
      updates.approvalDate = new Date();
      updates.autoApproved = true;
    }

    return this.update(updates);
  };

  TimeOffRequest.prototype.updateReplyCheckTime = function () {
    return this.update({
      lastReplyCheck: new Date(),
    });
  };
  TimeOffRequest.prototype.markManualEmailSent = function () {
    return this.update({
      manualEmailConfirmed: true,
      emailSent: new Date(),
    });
  };

  TimeOffRequest.prototype.storeManualEmailContent = function (emailContent) {
    return this.update({
      manualEmailContent: emailContent,
    });
  };

  TimeOffRequest.prototype.getEmailStatus = function () {
    if (this.emailMode === 'automatic') {
      if (this.emailSent) return 'sent';
      if (this.emailFailed) return 'failed'; // Use the new emailFailed field
      return 'not_sent';
    } else {
      // manual mode
      if (this.manualEmailConfirmed) return 'confirmed';
      if (this.manualEmailContent) return 'ready';
      return 'not_sent';
    }
  };

  TimeOffRequest.prototype.getEmailStatusIcon = function () {
    const status = this.getEmailStatus();
    const iconMap = {
      sent: '✅',
      failed: '❌',
      sending: '🔄',
      confirmed: '✅',
      ready: '📧',
      not_sent: '⚠️',
    };
    return iconMap[status] || '❓';
  };

  TimeOffRequest.prototype.getEmailStatusLabel = function () {
    const status = this.getEmailStatus();
    const labelMap = {
      sent: 'Email Sent',
      failed: `Email Failed${this.emailFailedReason ? ': ' + this.emailFailedReason : ''}`,
      sending: 'Sending Email',
      confirmed: 'Email Confirmed Sent',
      ready: 'Ready to Copy',
      not_sent: 'Not Sent',
    };
    return labelMap[status] || 'Unknown';
  };

  TimeOffRequest.prototype.canManualEmailBeSent = function () {
    return (
      this.emailMode === 'manual' &&
      this.manualEmailContent &&
      !this.manualEmailConfirmed
    );
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
    // Get user to determine email mode
    const User = require('./index').User;
    const user = await User.findByPk(userId);

    return await this.create({
      ...requestData,
      userId,
      emailMode: user ? user.emailPreference : 'manual', // Capture the mode used
    });
  };

  TimeOffRequest.createGroupRequest = async function (userId, requestData) {
    const { dates, customMessage } = requestData;

    // Get user to determine email mode
    const User = require('./index').User;
    const user = await User.findByPk(userId);

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
        emailMode: user ? user.emailPreference : 'manual', // ADD THIS LINE
      });
      requests.push(request);
    }

    return requests;
  };
  /**
   * Unified email content generation for both single and group requests
   * @param {Object} user - User object with code, signature, name, email
   * @returns {Object} Email content with subject, body, and to fields
   */
  TimeOffRequest.prototype.generateEmailContent = async function (user) {
    let requestsToProcess;

    if (this.groupId) {
      // Group request - get all requests in the group
      requestsToProcess = await TimeOffRequest.getByGroupIdAndUser(
        this.groupId,
        this.userId
      );
      requestsToProcess.sort(
        (a, b) => new Date(a.startDate) - new Date(b.startDate)
      );
    } else {
      // Single request
      requestsToProcess = [this];
    }

    // Generate subject based on first month
    const firstDate = new Date(requestsToProcess[0].startDate);
    const month = firstDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    const subject = `${user.code || 'RVB'} - CREW REQUEST - ${month}`;

    // Generate body with all dates
    let bodyLines = ['Dear,', ''];

    requestsToProcess.forEach((request) => {
      let line = `${request.startDate} - `;

      // Convert type to display format
      switch (request.type) {
        case 'REQ_DO':
          line += 'REQ DO';
          break;
        case 'PM_OFF':
          line += 'PM OFF';
          break;
        case 'AM_OFF':
          line += 'AM OFF';
          break;
        case 'FLIGHT':
          line += 'FLIGHT';
          break;
        default:
          line += request.type;
      }

      if (request.flightNumber) {
        line += ` ${request.flightNumber}`;
      }
      bodyLines.push(line);
    });

    if (this.customMessage) {
      bodyLines.push('');
      bodyLines.push(this.customMessage);
      bodyLines.push(''); // ✅ Extra line break after custom message
    }

    bodyLines.push('');
    bodyLines.push(
      user.signature || `Brgds,\n${user.name || user.email.split('@')[0]}`
    );

    return {
      subject,
      body: bodyLines.join('\n'),
      to: process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be',
    };
  };

  // Backward compatibility aliases
  TimeOffRequest.prototype.generateGroupEmailContent = function (user) {
    return this.generateEmailContent(user);
  };

  TimeOffRequest.prototype.generateSingleEmailContent = function (user) {
    return this.generateEmailContent(user);
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
    const whereClause = {
      userId,
      [Op.or]: [
        {
          startDate: {
            [Op.between]: [startDate, endDate],
          },
        },
        {
          endDate: {
            [Op.between]: [startDate, endDate],
          },
        },
        {
          [Op.and]: [
            { startDate: { [Op.lte]: startDate } },
            { endDate: { [Op.gte]: endDate } },
          ],
        },
      ],
    };

    if (excludeGroupId) {
      whereClause.groupId = { [Op.ne]: excludeGroupId };
    }

    return await this.findAll({
      where: whereClause,
      order: [['startDate', 'ASC']],
    });
  };

  TimeOffRequest.getStatusCountsForUser = async function (userId) {
    const counts = await this.findAll({
      where: { userId },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('status')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    const result = {
      total: 0,
      pending: 0,
      approved: 0,
      denied: 0,
      emailSent: 0,
      awaitingReply: 0,
    };

    counts.forEach((count) => {
      result[count.status.toLowerCase()] = parseInt(count.count);
      result.total += parseInt(count.count);
    });

    // NEW EMAIL STATS
    const emailStats = await this.findAll({
      where: {
        userId,
        emailSent: { [Op.ne]: null },
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'emailSentCount'],
      ],
      raw: true,
    });

    const awaitingReplyStats = await this.findAll({
      where: {
        userId,
        emailSent: { [Op.ne]: null },
        replyReceived: null,
        status: 'PENDING',
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'awaitingReplyCount'],
      ],
      raw: true,
    });

    result.emailSent = parseInt(emailStats[0]?.emailSentCount || 0);
    result.awaitingReply = parseInt(
      awaitingReplyStats[0]?.awaitingReplyCount || 0
    );

    return result;
  };

  // NEW METHOD: Get requests that need reply checking
  TimeOffRequest.getRequestsNeedingReplyCheck = async function (userId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    return await this.findAll({
      where: {
        userId,
        emailSent: { [Op.ne]: null },
        replyReceived: null,
        [Op.or]: [
          { lastReplyCheck: null },
          { lastReplyCheck: { [Op.lt]: oneHourAgo } },
        ],
      },
      order: [['emailSent', 'ASC']],
    });
  };

  return TimeOffRequest;
}

module.exports = defineTimeOffRequest;
