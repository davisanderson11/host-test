// models/Experiment.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./user');

const Experiment = sequelize.define('Experiment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  live: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'experiments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

Experiment.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });
User.hasMany(Experiment, { foreignKey: 'user_id', as: 'experiments' });

module.exports = Experiment;
