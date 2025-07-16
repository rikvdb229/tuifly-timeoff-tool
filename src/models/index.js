// src/models/index.js
const { sequelize } = require('../../config/database');
const defineUser = require('./User');
const defineTimeOffRequest = require('./TimeOffRequest');
const defineEmailTemplate = require('./EmailTemplate');
const defineUserSetting = require('./UserSetting');

// Initialize models
const User = defineUser(sequelize);
const TimeOffRequest = defineTimeOffRequest(sequelize);
const EmailTemplate = defineEmailTemplate(sequelize);
const UserSetting = defineUserSetting(sequelize);

// Define associations
User.hasMany(TimeOffRequest, { foreignKey: 'userId', onDelete: 'CASCADE' });
TimeOffRequest.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(UserSetting, { foreignKey: 'userId', onDelete: 'CASCADE' });
UserSetting.belongsTo(User, { foreignKey: 'userId' });

// Initialize database and seed data
async function initializeDatabase() {
  try {
    await sequelize.sync({ force: false });
    console.log('✅ Database synchronized');

    await seedGlobalData();
    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function seedGlobalData() {
  // Check if email templates exist
  const templateCount = await EmailTemplate.count();
  if (templateCount === 0) {
    await EmailTemplate.bulkCreate([
      {
        type: 'REQUEST',
        subjectTemplate: '{3LTR_CODE} CREW REQUEST - {YEAR} - {MONTH_NAME}',
        bodyTemplate: 'Dear,\n\n{REQUEST_LINES}\n\nBrgds,\n{EMPLOYEE_NAME}',
        isActive: true,
      },
      {
        type: 'REMINDER',
        subjectTemplate:
          '{3LTR_CODE} CREW REQUEST REMINDER - {YEAR} - {MONTH_NAME}',
        bodyTemplate:
          'Dear,\n\nThis is a reminder for:\n\n{REQUEST_LINES}\n\nBrgds,\n{EMPLOYEE_NAME}',
        isActive: true,
      },
    ]);
    console.log('✅ Global email templates created');
  }
}

// User management functions
async function createUser(userData) {
  try {
    const user = await User.create(userData);

    // Create default user settings
    await UserSetting.bulkCreate([
      { userId: user.id, settingKey: 'theme', settingValue: 'light' },
      { userId: user.id, settingKey: 'notifications', settingValue: 'true' },
      {
        userId: user.id,
        settingKey: 'timezone',
        settingValue: 'Europe/Brussels',
      },
      { userId: user.id, settingKey: 'language', settingValue: 'en' },
    ]);

    return user;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

async function getUserByGoogleId(googleId) {
  return await User.findOne({ where: { googleId } });
}

async function getUserById(id) {
  return await User.findByPk(id, {
    include: [
      {
        model: UserSetting,
        as: 'UserSettings',
      },
    ],
  });
}

async function updateUserOnboarding(userId, onboardingData) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await user.update({
      name: onboardingData.name,
      code: onboardingData.code,
      signature: onboardingData.signature,
      onboardedAt: new Date(),
    });

    return user;
  } catch (error) {
    console.error('Error updating user onboarding:', error);
    throw error;
  }
}

async function deleteUserAccount(userId) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Delete all associated data (cascading)
    await user.destroy();

    return true;
  } catch (error) {
    console.error('Error deleting user account:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  User,
  TimeOffRequest,
  EmailTemplate,
  UserSetting,
  initializeDatabase,
  createUser,
  getUserByGoogleId,
  getUserById,
  updateUserOnboarding,
  deleteUserAccount,
};
