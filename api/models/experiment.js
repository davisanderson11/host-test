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
  },
  experiment_files_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  prolific_study_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  prolific_status: {
    type: DataTypes.ENUM('draft', 'published', 'completed'),
    defaultValue: 'draft'
  },
  completion_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  datapipe_project_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  datapipe_component_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  datapipe_experiment_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  auto_delete_days: {
    type: DataTypes.INTEGER,
    defaultValue: 30
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
