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
  datapipe_api_key: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  datapipe_secret: {
    type: DataTypes.TEXT,
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