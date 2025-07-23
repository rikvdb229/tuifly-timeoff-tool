// src/models/User.js
const { DataTypes } = require('sequelize');
const {
  encryptToken,
  decryptToken,
  isTokenEncrypted,
} = require('../utils/crypto');

/**
 * Defines the User model for the database
 * @param {Object} sequelize - Sequelize instance
 * @returns {Object} User model with all associations and methods
 */
function defineUser(sequelize) {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      googleId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Google OAuth ID',
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Full name (set during onboarding)',
      },
      code: {
        type: DataTypes.STRING(3),
        allowNull: true,
        unique: true,
        comment: '3-letter pilot code (set during onboarding)',
      },
      signature: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Email signature (set during onboarding)',
      },
      onboardedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When user completed onboarding',
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Last login timestamp',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether user account is active',
      },
      profilePicture: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Google profile picture URL',
      },
      locale: {
        type: DataTypes.STRING(5),
        defaultValue: 'en',
        comment: 'User locale preference',
      },
      // NEW ADMIN & APPROVAL FIELDS
      isAdmin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether user has admin privileges',
      },
      adminApproved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether user has been approved by an admin',
      },
      adminApprovedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When user was approved by admin',
      },
      adminApprovedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        comment: 'ID of admin who approved this user',
      },
      // NEW GMAIL API FIELDS
      gmailAccessToken: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Encrypted Gmail access token',
      },
      gmailRefreshToken: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Encrypted Gmail refresh token',
      },
      gmailTokenExpiry: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When Gmail access token expires',
      },
      gmailScopeGranted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether user granted Gmail send permission',
      },
      emailPreference: {
        type: DataTypes.ENUM('automatic', 'manual'),
        defaultValue: 'manual',
        allowNull: false,
        comment:
          'User preference for email handling: automatic (Gmail API) or manual (copy/paste)',
      },
    },
    {
      tableName: 'users',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['googleId'],
        },
        {
          unique: true,
          fields: ['email'],
        },
        {
          unique: true,
          fields: ['code'],
          where: {
            code: {
              [sequelize.Sequelize.Op.ne]: null,
            },
          },
        },
        {
          fields: ['isAdmin'],
        },
        {
          fields: ['adminApproved'],
        },
      ],
    }
  );

  // Instance methods
  User.prototype.isOnboarded = function () {
    return (
      this.onboardedAt !== null && this.name && this.code && this.signature
    );
  };

  User.prototype.getDisplayName = function () {
    return this.name || this.email.split('@')[0];
  };

  // NEW ADMIN METHODS
  User.prototype.isApprovedAdmin = function () {
    return this.isAdmin && this.adminApproved;
  };

  User.prototype.canUseApp = function () {
    // User can use app if they are admin or have been approved by admin
    return this.isAdmin || this.adminApproved;
  };

  User.prototype.needsAdminApproval = function () {
    return !this.isAdmin && !this.adminApproved;
  };

  User.prototype.canSendEmails = function () {
    return (
      this.canUseApp() &&
      this.emailPreference === 'automatic' &&
      this.gmailScopeGranted &&
      this.isOnboarded()
    );
  };
  // ➕ ADD these new methods AFTER the existing canSendEmails method:
  User.prototype.usesManualEmail = function () {
    return this.emailPreference === 'manual';
  };

  User.prototype.usesAutomaticEmail = function () {
    return this.emailPreference === 'automatic' && this.gmailScopeGranted;
  };

  User.prototype.setEmailPreference = async function (preference) {
    if (!['automatic', 'manual'].includes(preference)) {
      throw new Error(
        'Invalid email preference. Must be "automatic" or "manual"'
      );
    }

    return await this.update({
      emailPreference: preference,
    });
  };

  User.prototype.hasValidGmailToken = function () {
    if (!this.gmailAccessToken || !this.gmailTokenExpiry) {
      return false;
    }
    return new Date() < this.gmailTokenExpiry;
  };

  User.prototype.approveUser = async function (approvingAdminId) {
    return await this.update({
      adminApproved: true,
      adminApprovedAt: new Date(),
      adminApprovedBy: approvingAdminId,
    });
  };

  User.prototype.makeAdmin = async function (approvingAdminId) {
    return await this.update({
      isAdmin: true,
      adminApproved: true,
      adminApprovedAt: new Date(),
      adminApprovedBy: approvingAdminId,
    });
  };

  User.prototype.updateGmailTokens = async function (tokens) {
    const updates = {
      gmailScopeGranted: true,
    };

    if (tokens.access_token) {
      updates.gmailAccessToken = encryptToken(tokens.access_token);
    }

    if (tokens.refresh_token) {
      updates.gmailRefreshToken = encryptToken(tokens.refresh_token);
    }

    if (tokens.expiry_date) {
      updates.gmailTokenExpiry = new Date(tokens.expiry_date);
    }

    return await this.update(updates);
  };

  // Methods to get decrypted tokens
  User.prototype.getDecryptedGmailAccessToken = function () {
    if (!this.gmailAccessToken) {return null;}
    try {
      return isTokenEncrypted(this.gmailAccessToken)
        ? decryptToken(this.gmailAccessToken)
        : this.gmailAccessToken; // Handle legacy unencrypted tokens
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Failed to decrypt Gmail access token:', error);
      return null;
    }
  };

  User.prototype.getDecryptedGmailRefreshToken = function () {
    if (!this.gmailRefreshToken) {return null;}
    try {
      return isTokenEncrypted(this.gmailRefreshToken)
        ? decryptToken(this.gmailRefreshToken)
        : this.gmailRefreshToken; // Handle legacy unencrypted tokens
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Failed to decrypt Gmail refresh token:', error);
      return null;
    }
  };

  User.prototype.toSafeObject = function () {
    const user = this.toJSON();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      code: user.code,
      signature: user.signature,
      isOnboarded: this.isOnboarded(),
      profilePicture: user.profilePicture,
      locale: user.locale,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      isAdmin: user.isAdmin,
      adminApproved: user.adminApproved,
      canUseApp: this.canUseApp(),
      needsAdminApproval: this.needsAdminApproval(),
      canSendEmails: this.canSendEmails(),
      gmailScopeGranted: user.gmailScopeGranted,
      emailPreference: user.emailPreference,
      usesManualEmail: this.usesManualEmail(),
      usesAutomaticEmail: this.usesAutomaticEmail(),
    };
  };

  // Class methods
  User.findByGoogleId = async function (googleId) {
    return await this.findOne({ where: { googleId } });
  };

  User.findByEmail = async function (email) {
    return await this.findOne({ where: { email } });
  };

  User.findByCode = async function (code) {
    return await this.findOne({ where: { code } });
  };

  User.getOnboardedUsers = async function () {
    return await this.findAll({
      where: {
        onboardedAt: {
          [sequelize.Sequelize.Op.ne]: null,
        },
      },
      order: [['createdAt', 'DESC']],
    });
  };

  // NEW ADMIN METHODS
  User.getAdmins = async function () {
    return await this.findAll({
      where: { isAdmin: true },
      order: [['createdAt', 'ASC']],
    });
  };

  User.getPendingApprovals = async function () {
    return await this.findAll({
      where: {
        isAdmin: false,
        adminApproved: false,
        onboardedAt: { [sequelize.Sequelize.Op.ne]: null }, // Only show onboarded users
      },
      order: [['createdAt', 'ASC']],
    });
  };

  User.getApprovedUsers = async function () {
    return await this.findAll({
      where: {
        [sequelize.Sequelize.Op.or]: [
          { isAdmin: true },
          { adminApproved: true },
        ],
      },
      order: [['createdAt', 'DESC']],
    });
  };

  User.isEmailAdmin = function (email) {
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase());
    return adminEmails.includes(email.toLowerCase());
  };

  User.setupAdminUser = async function (userData) {
    // Check if this email should be admin
    const isAdminEmail = this.isEmailAdmin(userData.email);

    const user = await this.create({
      ...userData,
      isAdmin: isAdminEmail,
      adminApproved: isAdminEmail, // Admins auto-approve themselves
      adminApprovedAt: isAdminEmail ? new Date() : null,
    });

    return user;
  };

  return User;
}

module.exports = defineUser;
