// FILE: src/models/EmailTemplate.js
const { DataTypes } = require('sequelize');

function defineEmailTemplate(sequelize) {
  const EmailTemplate = sequelize.define(
    'EmailTemplate',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      subjectTemplate: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      bodyTemplate: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: 'email_templates',
      timestamps: true,
    }
  );

  return EmailTemplate;
}

module.exports = defineEmailTemplate;
