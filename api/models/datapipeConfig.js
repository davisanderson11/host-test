// models/DatapipeConfig.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./user');

const DatapipeConfig = sequelize.define('DatapipeConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  osf_token: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  default_project_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  default_component_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  auto_sync: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'datapipe_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

DatapipeConfig.belongsTo(User, { foreignKey: 'user_id' });
User.hasOne(DatapipeConfig, { foreignKey: 'user_id', as: 'datapipeConfig' });

module.exports = DatapipeConfig;