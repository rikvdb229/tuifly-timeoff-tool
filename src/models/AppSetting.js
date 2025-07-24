// src/models/AppSetting.js
const { DataTypes } = require('sequelize');

/**
 * Defines the AppSetting model for managing global application configuration
 * @param {Object} sequelize - Sequelize instance
 * @returns {Object} AppSetting model with all methods
 */
function defineAppSetting(sequelize) {
  const AppSetting = sequelize.define(
    'AppSetting',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      key: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Unique setting key identifier',
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Setting value (stored as JSON string for complex values)',
      },
      type: {
        type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
        defaultValue: 'string',
        comment: 'Data type of the setting value',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Human-readable description of this setting',
      },
      category: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Setting category for organization (e.g., email, calendar, admin)',
      },
      isEditable: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this setting can be modified through admin interface',
      },
      isRequired: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether this setting must have a value',
      },
      defaultValue: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Default value for this setting',
      },
      validationRules: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON string containing validation rules',
      },
      lastModifiedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'User ID of admin who last modified this setting',
        references: {
          model: 'users',
          key: 'id',
        },
      },
    },
    {
      indexes: [
        {
          unique: true,
          fields: ['key'],
        },
        {
          fields: ['category'],
        },
        {
          fields: ['isEditable'],
        },
      ],
    }
  );

  // Instance methods
  AppSetting.prototype.getParsedValue = function () {
    if (!this.value) {
      return this.getParsedDefaultValue();
    }

    try {
      switch (this.type) {
        case 'boolean':
          return this.value === 'true' || this.value === true;
        case 'number':
          return parseFloat(this.value);
        case 'json':
          return JSON.parse(this.value);
        default:
          return this.value;
      }
    } catch (error) {
      console.warn(`Failed to parse setting ${this.key}:`, error);
      return this.getParsedDefaultValue();
    }
  };

  AppSetting.prototype.getParsedDefaultValue = function () {
    if (!this.defaultValue) {
      return null;
    }

    try {
      switch (this.type) {
        case 'boolean':
          return this.defaultValue === 'true' || this.defaultValue === true;
        case 'number':
          return parseFloat(this.defaultValue);
        case 'json':
          return JSON.parse(this.defaultValue);
        default:
          return this.defaultValue;
      }
    } catch (error) {
      console.warn(`Failed to parse default value for setting ${this.key}:`, error);
      return null;
    }
  };

  AppSetting.prototype.setValue = async function (newValue, userId = null) {
    let valueToStore;

    switch (this.type) {
      case 'boolean':
        valueToStore = Boolean(newValue).toString();
        break;
      case 'number':
        valueToStore = parseFloat(newValue).toString();
        break;
      case 'json':
        valueToStore = JSON.stringify(newValue);
        break;
      default:
        valueToStore = String(newValue);
    }

    return await this.update({
      value: valueToStore,
      lastModifiedBy: userId,
    });
  };

  AppSetting.prototype.toSafeObject = function () {
    return {
      id: this.id,
      key: this.key,
      value: this.getParsedValue(),
      type: this.type,
      description: this.description,
      category: this.category,
      isEditable: this.isEditable,
      isRequired: this.isRequired,
      defaultValue: this.getParsedDefaultValue(),
      updatedAt: this.updatedAt,
    };
  };

  // Class methods
  AppSetting.get = async function (key, defaultValue = null) {
    const setting = await this.findOne({ where: { key } });
    if (!setting) {
      return defaultValue;
    }
    return setting.getParsedValue();
  };

  AppSetting.set = async function (key, value, userId = null) {
    const setting = await this.findOne({ where: { key } });
    if (!setting) {
      throw new Error(`Setting '${key}' not found`);
    }
    
    if (!setting.isEditable) {
      throw new Error(`Setting '${key}' is not editable`);
    }
    
    return await setting.setValue(value, userId);
  };

  AppSetting.getByCategory = async function (category) {
    const settings = await this.findAll({
      where: { category },
      order: [['key', 'ASC']],
    });
    
    const result = {};
    settings.forEach(setting => {
      result[setting.key] = setting.getParsedValue();
    });
    
    return result;
  };

  AppSetting.getAllEditable = async function () {
    return await this.findAll({
      where: { isEditable: true },
      order: [['category', 'ASC'], ['key', 'ASC']],
    });
  };

  AppSetting.ensureDefaults = async function () {
    const defaults = [
      {
        key: 'calendar.min_advance_days',
        value: '60',
        type: 'number',
        description: 'Minimum days in advance users can request time off',
        category: 'calendar',
        defaultValue: '60',
      },
      {
        key: 'calendar.max_advance_days',
        value: '120',
        type: 'number',
        description: 'Maximum days in advance users can request time off',
        category: 'calendar',
        defaultValue: '120',
      },
      {
        key: 'calendar.max_days_per_request',
        value: '4',
        type: 'number',
        description: 'Maximum consecutive days per time-off request',
        category: 'calendar',
        defaultValue: '4',
      },
      {
        key: 'email.notification_enabled',
        value: 'true',
        type: 'boolean',
        description: 'Enable email notifications for time-off requests',
        category: 'email',
        defaultValue: 'true',
      },
      {
        key: 'admin.auto_approve_requests',
        value: 'false',
        type: 'boolean',
        description: 'Automatically approve all time-off requests',
        category: 'admin',
        defaultValue: 'false',
      },
      {
        key: 'roster.use_custom_deadlines',
        value: 'true',
        type: 'boolean',
        description: 'Use custom roster deadlines instead of fixed advance days',
        category: 'roster',
        defaultValue: 'true',
      },
    ];

    for (const settingData of defaults) {
      const existing = await this.findOne({ where: { key: settingData.key } });
      if (!existing) {
        await this.create(settingData);
      }
    }
  };

  return AppSetting;
}

module.exports = defineAppSetting;