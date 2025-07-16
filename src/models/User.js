// src/models/User.js
const { DataTypes } = require('sequelize');

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

  return User;
}

module.exports = defineUser;
