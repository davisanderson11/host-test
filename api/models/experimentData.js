// models/ExperimentData.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Experiment = require('./experiment');

const ExperimentData = sequelize.define('ExperimentData', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  experiment_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Experiment,
      key: 'id'
    }
  },
  prolific_pid: {
    type: DataTypes.STRING,
    allowNull: true
  },
  session_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  data: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  synced_to_osf: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  synced_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'experiment_data',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

ExperimentData.belongsTo(Experiment, { foreignKey: 'experiment_id' });
Experiment.hasMany(ExperimentData, { foreignKey: 'experiment_id', as: 'data' });

module.exports = ExperimentData;