// src/models/UserSetting.js
const { DataTypes } = require('sequelize');

function defineUserSetting(sequelize) {
  const UserSetting = sequelize.define(
    'UserSetting',
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
      settingKey: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [
            [
              'theme',
              'notifications',
              'timezone',
              'language',
              'autoSave',
              'emailFrequency',
            ],
          ],
        },
      },
      settingValue: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      settingType: {
        type: DataTypes.ENUM('string', 'boolean', 'number', 'json'),
        defaultValue: 'string',
      },
    },
    {
      tableName: 'user_settings',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['userId', 'settingKey'],
        },
      ],
    }
  );

  // Instance methods
  UserSetting.prototype.getParsedValue = function () {
    switch (this.settingType) {
      case 'boolean':
        return this.settingValue === 'true';
      case 'number':
        return parseFloat(this.settingValue);
      case 'json':
        try {
          return JSON.parse(this.settingValue);
        } catch (e) {
          return this.settingValue;
        }
      default:
        return this.settingValue;
    }
  };

  // Class methods
  UserSetting.getUserSettings = async function (userId) {
    const settings = await this.findAll({ where: { userId } });
    const settingsObject = {};

    settings.forEach((setting) => {
      settingsObject[setting.settingKey] = setting.getParsedValue();
    });

    return settingsObject;
  };

  UserSetting.updateUserSetting = async function (
    userId,
    settingKey,
    settingValue,
    settingType = 'string'
  ) {
    const [setting, created] = await this.findOrCreate({
      where: { userId, settingKey },
      defaults: {
        settingValue: String(settingValue),
        settingType,
      },
    });

    if (!created) {
      await setting.update({
        settingValue: String(settingValue),
        settingType,
      });
    }

    return setting;
  };

  UserSetting.getDefaultSettings = function () {
    return {
      theme: 'light',
      notifications: true,
      timezone: 'Europe/Brussels',
      language: 'en',
      autoSave: true,
      emailFrequency: 'immediate',
    };
  };

  return UserSetting;
}

module.exports = defineUserSetting;
