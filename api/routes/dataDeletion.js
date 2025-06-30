// routes/dataDeletion.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const Experiment = require('../models/experiment');
const ExperimentData = require('../models/experimentData');

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

// DELETE /experiments/:id/data/all - Delete all data for an experiment
router.delete('/:id/data/all', auth, async (req, res) => {
  try {
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    const deleteFiles = req.query.deleteFiles === 'true';
    let filesDeleted = 0;

    // Delete files if requested
    if (deleteFiles) {
      const dataDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || './uploads', 'experiments', experiment.id, 'data');
      try {
        const files = await fs.readdir(dataDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            await fs.unlink(path.join(dataDir, file));
            filesDeleted++;
          }
        }
      } catch (error) {
        console.error('Error deleting files:', error);
      }
    }

    // Delete all data from database
    const deletedCount = await ExperimentData.destroy({
      where: { experiment_id: experiment.id }
    });

    res.json({ 
      message: `All data deleted for experiment ${experiment.title}`,
      deleted_count: deletedCount,
      files_deleted: deleteFiles ? filesDeleted : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /experiments/:id/data/synced - Delete only synced data
router.delete('/:id/data/synced', auth, async (req, res) => {
  try {
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Delete only synced data
    const deletedCount = await ExperimentData.destroy({
      where: { 
        experiment_id: experiment.id,
        synced_to_osf: true
      }
    });

    res.json({ 
      message: `Synced data deleted for experiment ${experiment.title}`,
      deleted_count: deletedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /data/auto-delete - Delete old synced data based on auto_delete_days
router.post('/auto-delete', auth, async (req, res) => {
  try {
    // Get all experiments with auto-delete enabled
    const experiments = await Experiment.findAll({
      where: { 
        user_id: req.user.id,
        auto_delete_days: { [Op.gt]: 0 }
      }
    });

    let totalDeleted = 0;
    const results = [];

    for (const experiment of experiments) {
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - experiment.auto_delete_days);

      // Get data to delete
      const dataToDelete = await ExperimentData.findAll({
        where: {
          experiment_id: experiment.id,
          synced_to_osf: true,
          synced_at: { [Op.lt]: cutoffDate }
        }
      });

      if (dataToDelete.length > 0) {
        // Delete files first
        const dataDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || './uploads', 'experiments', experiment.id, 'data');
        let filesDeleted = 0;
        
        try {
          const files = await fs.readdir(dataDir);
          for (const data of dataToDelete) {
            // Look for files matching the session ID
            const matchingFiles = files.filter(f => f.startsWith(data.session_id));
            for (const file of matchingFiles) {
              try {
                await fs.unlink(path.join(dataDir, file));
                filesDeleted++;
              } catch (e) {
                console.error(`Failed to delete file ${file}:`, e);
              }
            }
          }
        } catch (error) {
          console.error(`Error accessing data directory for experiment ${experiment.id}:`, error);
        }

        // Delete from database
        const deletedCount = await ExperimentData.destroy({
          where: {
            experiment_id: experiment.id,
            synced_to_osf: true,
            synced_at: { [Op.lt]: cutoffDate }
          }
        });

        // Check if all data has been deleted
        const remainingData = await ExperimentData.count({
          where: { experiment_id: experiment.id }
        });

        // If no data remains, set experiment to not live
        if (remainingData === 0) {
          await experiment.update({ live: false });
        }

        results.push({
          experiment_id: experiment.id,
          experiment_title: experiment.title,
          deleted_count: deletedCount,
          files_deleted: filesDeleted,
          auto_delete_days: experiment.auto_delete_days,
          experiment_set_offline: remainingData === 0
        });
        totalDeleted += deletedCount;
      }
    }

    res.json({
      message: 'Auto-delete completed',
      total_deleted: totalDeleted,
      experiments: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /experiments/:id/auto-delete - Configure auto-delete settings
router.put('/:id/auto-delete', auth, async (req, res) => {
  try {
    const { auto_delete_days } = req.body;

    if (auto_delete_days !== undefined && (auto_delete_days < 0 || auto_delete_days > 365)) {
      return res.status(400).json({ 
        error: 'auto_delete_days must be between 0 and 365 (0 disables auto-delete)' 
      });
    }

    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    await experiment.update({ auto_delete_days });

    res.json({
      message: 'Auto-delete settings updated',
      experiment_id: experiment.id,
      auto_delete_days: experiment.auto_delete_days,
      auto_delete_enabled: experiment.auto_delete_days > 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;