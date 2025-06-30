// models/User.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true
  },
  passwordHash: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'password_hash'
  },
  prolificApiToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'prolific_api_token'
  },
  prolificWorkspaceId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'prolific_workspace_id'
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = User;