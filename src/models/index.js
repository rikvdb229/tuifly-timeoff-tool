// FILE: src/models/index.js
const { sequelize } = require('../../config/database');
const defineEmployee = require('./Employee');
const defineTimeOffRequest = require('./TimeOffRequest');
const defineEmailTemplate = require('./EmailTemplate');

// Initialize models
const Employee = defineEmployee(sequelize);
const TimeOffRequest = defineTimeOffRequest(sequelize);
const EmailTemplate = defineEmailTemplate(sequelize);

// Define associations
Employee.hasMany(TimeOffRequest, { foreignKey: 'employeeId' });
TimeOffRequest.belongsTo(Employee, { foreignKey: 'employeeId' });

// Sync database and seed initial data
async function initializeDatabase() {
  try {
    await sequelize.sync({ force: false });
    console.log('✅ Database synchronized');

    await seedInitialData();
    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function seedInitialData() {
  // Check if employee exists
  const employeeCount = await Employee.count();
  if (employeeCount === 0) {
    const employee = await Employee.create({
      name: process.env.EMPLOYEE_NAME || 'Rik',
      code: process.env.EMPLOYEE_CODE || 'RVB',
      email: process.env.GMAIL_USER || 'rik@example.com',
      approverEmail:
        process.env.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be',
      signature: process.env.EMPLOYEE_NAME || 'Rik',
      minAdvanceDays: parseInt(process.env.MIN_ADVANCE_DAYS) || 14,
      maxAdvanceDays: parseInt(process.env.MAX_ADVANCE_DAYS) || 180,
    });
    console.log('✅ Initial employee data created:', employee.name);
  }

  // Check if email template exists
  const templateCount = await EmailTemplate.count();
  if (templateCount === 0) {
    await EmailTemplate.create({
      type: 'REQUEST',
      subjectTemplate: '{3LTR_CODE} CREW REQUEST - {YEAR} - {MONTH_NAME}',
      bodyTemplate: 'Dear,\n\n{REQUEST_LINES}\n\nBrgds,\n{EMPLOYEE_NAME}',
    });
    console.log('✅ Initial email template created');
  }
}

module.exports = {
  sequelize,
  Employee,
  TimeOffRequest,
  EmailTemplate,
  initializeDatabase,
};
