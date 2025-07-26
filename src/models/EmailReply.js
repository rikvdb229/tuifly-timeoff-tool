// src/models/EmailReply.js
const { DataTypes } = require('sequelize');

/**
 * Defines the EmailReply model for storing email replies to time-off requests
 * @param {Object} sequelize - Sequelize instance
 * @returns {Object} EmailReply model with associations and methods
 */
function defineEmailReply(sequelize) {
  const EmailReply = sequelize.define(
    'EmailReply',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      timeOffRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'time_off_request_id',
        references: {
          model: 'time_off_requests',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      gmailMessageId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'gmail_message_id',
      },
      gmailThreadId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'gmail_thread_id',
      },
      fromEmail: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'from_email',
      },
      fromName: {
        type: DataTypes.STRING(255),
        field: 'from_name',
      },
      replyContent: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'reply_content',
      },
      replySnippet: {
        type: DataTypes.STRING(500),
        field: 'reply_snippet',
      },
      receivedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'received_at',
      },
      isProcessed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_processed',
      },
      processedAt: {
        type: DataTypes.DATE,
        field: 'processed_at',
      },
      processedBy: {
        type: DataTypes.INTEGER,
        field: 'processed_by',
        references: {
          model: 'users',
          key: 'id',
        },
      },
      // User reply tracking fields
      userReplySent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'user_reply_sent',
        comment: 'Whether the user has sent a reply to this email',
      },
      userReplyContent: {
        type: DataTypes.TEXT,
        field: 'user_reply_content',
        comment: 'Content of the user reply that was sent',
      },
      userReplySentAt: {
        type: DataTypes.DATE,
        field: 'user_reply_sent_at',
        comment: 'When the user reply was sent',
      },
    },
    {
      tableName: 'email_replies',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          fields: ['time_off_request_id'],
          name: 'idx_email_replies_request_id',
        },
        {
          fields: ['is_processed'],
          name: 'idx_email_replies_processed',
        },
        {
          fields: ['received_at'],
          name: 'idx_email_replies_received',
        },
        {
          fields: ['time_off_request_id', 'is_processed'],
          name: 'idx_email_replies_user_processed',
        },
      ],
    }
  );

  // Class methods
  EmailReply.findUnprocessedByUser = async function (userId) {
    const { TimeOffRequest } = require('./index');
    return await this.findAll({
      where: { isProcessed: false },
      include: [
        {
          model: TimeOffRequest,
          where: { userId: userId },
          required: true,
        },
      ],
      order: [['receivedAt', 'DESC']],
    });
  };

  EmailReply.getCountForUser = async function (userId, processed = false) {
    const { TimeOffRequest } = require('./index');
    return await this.count({
      where: { isProcessed: processed },
      include: [
        {
          model: TimeOffRequest,
          where: { userId: userId },
          required: true,
        },
      ],
    });
  };

  // Instance methods
  EmailReply.prototype.markAsProcessed = async function (userId) {
    await this.update({
      isProcessed: true,
      processedAt: new Date(),
      processedBy: userId,
    });
  };

  return EmailReply;
}

module.exports = defineEmailReply;