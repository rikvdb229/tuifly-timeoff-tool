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

// Self-referencing association for admin approval
User.belongsTo(User, {
  as: 'ApprovedBy',
  foreignKey: 'adminApprovedBy',
  constraints: false,
});
User.hasMany(User, {
  as: 'ApprovedUsers',
  foreignKey: 'adminApprovedBy',
  constraints: false,
});

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
        subjectTemplate: '{3LTR_CODE} - CREW REQUEST - {YEAR} - {MONTH_NAME}',
        bodyTemplate:
          'Dear,\n\n{REQUEST_LINES}\n\n{CUSTOM_MESSAGE}\n\nBrgds,\n{EMPLOYEE_SIGNATURE}',
        isActive: true,
      },
      {
        type: 'REMINDER',
        subjectTemplate:
          '{3LTR_CODE} - CREW REQUEST REMINDER - {YEAR} - {MONTH_NAME}',
        bodyTemplate:
          'Dear,\n\nThis is a reminder for:\n\n{REQUEST_LINES}\n\n{CUSTOM_MESSAGE}\n\nBrgds,\n{EMPLOYEE_SIGNATURE}',
        isActive: true,
      },
    ]);
    console.log('✅ Global email templates created');
  }
}

// User management functions
async function createUser(userData) {
  try {
    // Use the new setupAdminUser method to handle admin privileges
    const user = await User.setupAdminUser(userData);

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

    // 🚨 FIXED: Only log user creation, don't send email yet
    if (user.isAdmin) {
      console.log(`✅ Admin user created: ${user.email}`);
    } else {
      console.log(
        `👤 New user created: ${user.email} - waiting for onboarding completion`
      );
    }

    return user;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

async function getUserByGoogleId(googleId) {
  return await User.findByGoogleId(googleId);
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

// 🚨 FIXED: Add email notification after onboarding completion
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
      emailPreference: onboardingData.emailPreference || 'manual', // ✅ ADD: Email preference
      onboardedAt: new Date(),
    });

    // Send admin notification AFTER onboarding completion
    if (!user.isAdmin) {
      console.log(
        `📧 User completed onboarding: ${user.email} - Email preference: ${onboardingData.emailPreference || 'manual'}`
      );
    }

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

// Admin management functions
async function approveUser(adminId, userIdToApprove) {
  try {
    const admin = await User.findByPk(adminId);
    if (!admin || !admin.isAdmin) {
      throw new Error('Only admins can approve users');
    }

    const userToApprove = await User.findByPk(userIdToApprove);
    if (!userToApprove) {
      throw new Error('User not found');
    }

    if (userToApprove.adminApproved) {
      throw new Error('User is already approved');
    }

    await userToApprove.approveUser(adminId);

    console.log(
      `✅ User approved: ${userToApprove.email} by admin ${admin.email}`
    );

    // Send approval notification email to user
    const emailNotificationService = require('../services/emailNotificationService');
    await emailNotificationService.initialize();
    await emailNotificationService.notifyUserApproval(userToApprove, admin);

    return userToApprove;
  } catch (error) {
    console.error('Error approving user:', error);
    throw error;
  }
}

async function makeUserAdmin(adminId, userIdToPromote) {
  try {
    const admin = await User.findByPk(adminId);
    if (!admin || !admin.isAdmin) {
      throw new Error('Only admins can promote users to admin');
    }

    const userToPromote = await User.findByPk(userIdToPromote);
    if (!userToPromote) {
      throw new Error('User not found');
    }

    if (userToPromote.isAdmin) {
      throw new Error('User is already an admin');
    }

    await userToPromote.makeAdmin(adminId);

    console.log(
      `✅ User promoted to admin: ${userToPromote.email} by admin ${admin.email}`
    );

    return userToPromote;
  } catch (error) {
    console.error('Error promoting user to admin:', error);
    throw error;
  }
}

async function getPendingApprovals() {
  try {
    return await User.getPendingApprovals();
  } catch (error) {
    console.error('Error getting pending approvals:', error);
    throw error;
  }
}

async function getAllUsers() {
  try {
    return await User.findAll({
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'ApprovedBy',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

// 🚨 MOVED: Notify admins when a user completes onboarding (not when account is created)
async function notifyAdminsOfNewUser(newUser) {
  try {
    const admins = await User.getAdmins();

    if (admins.length === 0) {
      console.log('ℹ️ No admins found to notify about new user registration');
      return;
    }

    console.log(
      `📧 Notifying admins about completed onboarding: ${newUser.email}`
    );

    // Send email notification to admin
    const emailNotificationService = require('../services/emailNotificationService');
    await emailNotificationService.initialize();
    await emailNotificationService.notifyAdminOfNewUser(newUser);

    return true;
  } catch (error) {
    console.error('Error notifying admins:', error);
    // Don't throw error - this is non-critical
    return false;
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
  // Admin functions
  approveUser,
  makeUserAdmin,
  getPendingApprovals,
  getAllUsers,
  notifyAdminsOfNewUser,
};
