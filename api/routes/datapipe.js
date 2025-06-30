// routes/datapipe.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const Experiment = require('../models/experiment');
const ExperimentData = require('../models/experimentData');
const DatapipeConfig = require('../models/datapipeConfig');
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

// Encrypt/decrypt functions for storing tokens
const algorithm = 'aes-256-gcm';
const getKey = () => {
  const secret = process.env.JWT_SECRET || 'default-secret';
  return crypto.createHash('sha256').update(String(secret)).digest();
};

const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
};

const decrypt = (text) => {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(algorithm, getKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// POST /datapipe/config - Configure DataPipe settings
router.post('/config', 
  auth,
  body('osf_token').isString().notEmpty(),
  body('default_project_id').optional().isString(),
  body('default_component_id').optional().isString(),
  body('auto_sync').optional().isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Validate OSF token first
      const validation = await datapipeService.validateToken(req.body.osf_token);
      if (!validation.valid) {
        return res.status(400).json({ error: `Invalid OSF token: ${validation.error}` });
      }

      // Find or create config
      let config = await DatapipeConfig.findOne({
        where: { user_id: req.user.id }
      });

      const configData = {
        osf_token: encrypt(req.body.osf_token),
        default_project_id: req.body.default_project_id,
        default_component_id: req.body.default_component_id,
        auto_sync: req.body.auto_sync || false
      };

      if (config) {
        await config.update(configData);
      } else {
        config = await DatapipeConfig.create({
          user_id: req.user.id,
          ...configData
        });
      }

      res.json({
        message: 'DataPipe configuration saved',
        osf_user: validation.user,
        config: {
          id: config.id,
          default_project_id: config.default_project_id,
          default_component_id: config.default_component_id,
          auto_sync: config.auto_sync
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /datapipe/config - Get DataPipe configuration
router.get('/config', auth, async (req, res) => {
  try {
    const config = await DatapipeConfig.findOne({
      where: { user_id: req.user.id }
    });

    if (!config) {
      return res.json({ configured: false });
    }

    // Validate the stored token is still valid
    const token = decrypt(config.osf_token);
    const validation = await datapipeService.validateToken(token);

    res.json({
      configured: true,
      valid_token: validation.valid,
      osf_user: validation.user,
      config: {
        default_project_id: config.default_project_id,
        default_component_id: config.default_component_id,
        auto_sync: config.auto_sync
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /experiments/:id/datapipe/config - Configure DataPipe for specific experiment
router.post('/:id/datapipe/config',
  auth,
  body('project_id').isString().notEmpty(),
  body('component_id').optional().isString(),
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

      await experiment.update({
        datapipe_project_id: req.body.project_id,
        datapipe_component_id: req.body.component_id
      });

      res.json({
        message: 'DataPipe configuration updated for experiment',
        experiment_id: experiment.id,
        project_id: experiment.datapipe_project_id,
        component_id: experiment.datapipe_component_id
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /experiments/:id/datapipe/sync - Sync experiment data to OSF
router.post('/:id/datapipe/sync', auth, async (req, res) => {
  try {
    // Get experiment
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Get DataPipe config
    const config = await DatapipeConfig.findOne({
      where: { user_id: req.user.id }
    });

    if (!config) {
      return res.status(400).json({ error: 'DataPipe not configured. Please configure your OSF token first.' });
    }

    // Use experiment-specific or default OSF project/component
    if (!experiment.datapipe_project_id && !config.default_project_id) {
      return res.status(400).json({ 
        error: 'No OSF project ID configured. Set one for this experiment or configure a default.' 
      });
    }

    // Set project/component IDs if not set
    if (!experiment.datapipe_project_id) {
      experiment.datapipe_project_id = config.default_project_id;
      experiment.datapipe_component_id = config.default_component_id;
      await experiment.save();
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

    // Decrypt token and sync
    const osfToken = decrypt(config.osf_token);
    const results = await datapipeService.syncExperimentData(
      osfToken, 
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
      datapipe_configured: !!(experiment.datapipe_project_id),
      project_id: experiment.datapipe_project_id,
      component_id: experiment.datapipe_component_id,
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

// DELETE /datapipe/config - Remove DataPipe configuration
router.delete('/config', auth, async (req, res) => {
  try {
    const deleted = await DatapipeConfig.destroy({
      where: { user_id: req.user.id }
    });

    if (!deleted) {
      return res.status(404).json({ error: 'No configuration found' });
    }

    res.json({ message: 'DataPipe configuration removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;