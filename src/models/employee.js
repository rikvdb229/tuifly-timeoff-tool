const { DataTypes } = require('sequelize');

function defineEmployee(sequelize) {
  const Employee = sequelize.define(
    'Employee',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(3),
        allowNull: false,
        unique: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      approverEmail: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      signature: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      minAdvanceDays: {
        type: DataTypes.INTEGER,
        defaultValue: 14,
      },
      maxAdvanceDays: {
        type: DataTypes.INTEGER,
        defaultValue: 180,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: 'employees',
      timestamps: true,
    }
  );

  return Employee;
}
