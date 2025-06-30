// routes/datapipe.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Experiment = require('../models/experiment');
const ExperimentData = require('../models/experimentData');
const datapipeService = require('../services/datapipe');

// Auth middleware
const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// POST /experiments/:id/datapipe/config - Configure DataPipe for experiment and create on DataPipe
router.post('/:id/datapipe/config',
  auth,
  body('osf_project_id').isString().notEmpty().withMessage('OSF project ID is required'),
  body('osf_data_component_id').isString().notEmpty().withMessage('OSF data component ID is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const experiment = await Experiment.findOne({
        where: { id: req.params.id, user_id: req.user.id }
      });

      if (!experiment) {
        return res.status(404).json({ error: 'Experiment not found' });
      }

      // Update OSF IDs
      await experiment.update({
        datapipe_project_id: req.body.osf_project_id,
        datapipe_component_id: req.body.osf_data_component_id
      });

      // Create experiment on DataPipe if not already created
      if (!experiment.datapipe_experiment_id) {
        try {
          const datapipeResponse = await datapipeService.createExperiment({}, experiment);
          
          // Store the DataPipe experiment ID (handle different response formats)
          const datapipeId = datapipeResponse.experimentId || datapipeResponse.experiment_id || datapipeResponse.id;
          await experiment.update({
            datapipe_experiment_id: datapipeId
          });

          res.json({
            message: 'DataPipe configured and experiment created',
            experiment_id: experiment.id,
            osf_project_id: experiment.datapipe_project_id,
            osf_data_component_id: experiment.datapipe_component_id,
            datapipe_experiment_id: datapipeId,
            osf_project_url: `https://osf.io/${experiment.datapipe_project_id}/`
          });
        } catch (error) {
          res.status(500).json({ 
            error: `Failed to create experiment on DataPipe: ${error.message}` 
          });
        }
      } else {
        res.json({
          message: 'DataPipe already configured',
          experiment_id: experiment.id,
          osf_project_id: experiment.datapipe_project_id,
          osf_data_component_id: experiment.datapipe_component_id,
          datapipe_experiment_id: experiment.datapipe_experiment_id,
          osf_project_url: `https://osf.io/${experiment.datapipe_project_id}/`
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /experiments/:id/datapipe/sync - Sync experiment data to OSF
router.post('/:id/datapipe/sync', auth, async (req, res) => {
  try {
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    if (!experiment.datapipe_experiment_id) {
      return res.status(400).json({ 
        error: 'DataPipe not configured. Please configure DataPipe first.' 
      });
    }

    // Get unsync'd data
    const experimentData = await ExperimentData.findAll({
      where: { 
        experiment_id: experiment.id,
        synced_to_osf: false
      }
    });

    if (experimentData.length === 0) {
      return res.json({
        message: 'No new data to sync',
        synced: 0
      });
    }

    // Sync data
    const results = await datapipeService.syncExperimentData(
      experiment, 
      experimentData
    );

    res.json({
      message: 'Data sync completed',
      results: results,
      osf_project_url: `https://osf.io/${experiment.datapipe_project_id}/`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /experiments/:id/datapipe/status - Get sync status for experiment
router.get('/:id/datapipe/status', auth, async (req, res) => {
  try {
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Get sync status
    const totalData = await ExperimentData.count({
      where: { experiment_id: experiment.id }
    });

    const syncedData = await ExperimentData.count({
      where: { 
        experiment_id: experiment.id,
        synced_to_osf: true
      }
    });

    const lastSync = await ExperimentData.findOne({
      where: { 
        experiment_id: experiment.id,
        synced_to_osf: true
      },
      order: [['synced_at', 'DESC']]
    });

    res.json({
      experiment_id: experiment.id,
      datapipe_configured: !!(experiment.datapipe_experiment_id),
      datapipe_experiment_id: experiment.datapipe_experiment_id,
      osf_project_id: experiment.datapipe_project_id,
      osf_data_component_id: experiment.datapipe_component_id,
      total_data_points: totalData,
      synced_data_points: syncedData,
      unsynced_data_points: totalData - syncedData,
      last_sync: lastSync?.synced_at || null,
      osf_project_url: experiment.datapipe_project_id ? 
        `https://osf.io/${experiment.datapipe_project_id}/` : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;