const { DataTypes } = require('sequelize');

function defineTimeOffRequest(sequelize) {
  const TimeOffRequest = sequelize.define(
    'TimeOffRequest',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
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
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id',
        },
      },
    },
    {
      tableName: 'time_off_requests',
      timestamps: true,
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
    }
  );

  return TimeOffRequest;
}

module.exports = defineTimeOffRequest;
