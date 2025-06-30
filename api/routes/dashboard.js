// routes/dashboard.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const Experiment = require('../models/experiment');
const ExperimentData = require('../models/experimentData');
const User = require('../models/user');

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

// GET /dashboard/overview - Get dashboard overview statistics
router.get('/overview', auth, async (req, res) => {
  try {
    // Get experiment stats
    const totalExperiments = await Experiment.count({
      where: { user_id: req.user.id }
    });

    const liveExperiments = await Experiment.count({
      where: { user_id: req.user.id, live: true }
    });

    const experimentsWithData = await Experiment.count({
      where: { user_id: req.user.id },
      include: [{
        model: ExperimentData,
        as: 'data',
        required: true,
        attributes: [],
        duplicating: false
      }],
      distinct: true
    });

    // Get participant stats
    const totalParticipants = await ExperimentData.count({
      include: [{
        model: Experiment,
        where: { user_id: req.user.id },
        attributes: []
      }]
    });

    const participantsThisWeek = await ExperimentData.count({
      where: {
        created_at: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      include: [{
        model: Experiment,
        where: { user_id: req.user.id },
        attributes: []
      }]
    });

    // Get sync stats
    const syncedToOSF = await ExperimentData.count({
      where: { synced_to_osf: true },
      include: [{
        model: Experiment,
        where: { user_id: req.user.id },
        attributes: []
      }]
    });

    const pendingSync = await ExperimentData.count({
      where: { synced_to_osf: false },
      include: [{
        model: Experiment,
        where: { user_id: req.user.id },
        attributes: []
      }]
    });

    // Get recent activity
    const recentExperiments = await Experiment.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: 5,
      attributes: ['id', 'title', 'live', 'created_at'],
      include: [{
        model: ExperimentData,
        as: 'data',
        attributes: ['id']
      }]
    });

    const recentActivity = recentExperiments.map(exp => ({
      id: exp.id,
      title: exp.title,
      live: exp.live,
      created_at: exp.created_at,
      participant_count: exp.data ? exp.data.length : 0
    }));

    res.json({
      statistics: {
        experiments: {
          total: totalExperiments,
          live: liveExperiments,
          with_data: experimentsWithData
        },
        participants: {
          total: totalParticipants,
          this_week: participantsThisWeek
        },
        data_sync: {
          synced: syncedToOSF,
          pending: pendingSync
        }
      },
      recent_activity: recentActivity
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /dashboard/experiments - Get detailed experiment statistics
router.get('/experiments', auth, async (req, res) => {
  try {
    const experiments = await Experiment.findAll({
      where: { user_id: req.user.id },
      include: [{
        model: ExperimentData,
        as: 'data',
        attributes: ['id', 'synced_to_osf', 'created_at']
      }],
      order: [['created_at', 'DESC']]
    });

    const experimentStats = experiments.map(exp => {
      const totalParticipants = exp.data ? exp.data.length : 0;
      const syncedCount = exp.data ? exp.data.filter(d => d.synced_to_osf).length : 0;
      const lastParticipant = exp.data && exp.data.length > 0 
        ? Math.max(...exp.data.map(d => new Date(d.created_at).getTime()))
        : null;

      return {
        id: exp.id,
        title: exp.title,
        live: exp.live,
        created_at: exp.created_at,
        statistics: {
          total_participants: totalParticipants,
          synced_participants: syncedCount,
          pending_sync: totalParticipants - syncedCount,
          last_participant: lastParticipant ? new Date(lastParticipant) : null
        },
        configuration: {
          has_files: !!exp.experiment_files_path,
          has_prolific: !!exp.prolific_study_id,
          has_datapipe: !!exp.datapipe_experiment_id
        }
      };
    });

    res.json({
      total: experimentStats.length,
      experiments: experimentStats
    });
  } catch (error) {
    console.error('Dashboard experiments error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /dashboard/activity - Get activity timeline
router.get('/activity', auth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get daily participant counts
    const participantData = await ExperimentData.findAll({
      attributes: [
        [ExperimentData.sequelize.fn('DATE', ExperimentData.sequelize.col('ExperimentData.created_at')), 'date'],
        [ExperimentData.sequelize.fn('COUNT', ExperimentData.sequelize.col('ExperimentData.id')), 'count']
      ],
      where: {
        created_at: { [Op.gte]: startDate }
      },
      include: [{
        model: Experiment,
        where: { user_id: req.user.id },
        attributes: []
      }],
      group: [ExperimentData.sequelize.fn('DATE', ExperimentData.sequelize.col('ExperimentData.created_at'))],
      raw: true
    });

    // Get experiment creation timeline
    const experimentData = await Experiment.findAll({
      attributes: [
        [Experiment.sequelize.fn('DATE', Experiment.sequelize.col('created_at')), 'date'],
        [Experiment.sequelize.fn('COUNT', Experiment.sequelize.col('id')), 'count']
      ],
      where: {
        user_id: req.user.id,
        created_at: { [Op.gte]: startDate }
      },
      group: [Experiment.sequelize.fn('DATE', Experiment.sequelize.col('created_at'))],
      raw: true
    });

    res.json({
      time_range: {
        start: startDate,
        end: new Date(),
        days: days
      },
      daily_participants: participantData,
      daily_experiments: experimentData
    });
  } catch (error) {
    console.error('Dashboard activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /dashboard/storage - Get storage usage statistics
router.get('/storage', auth, async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || './uploads');
    
    // Get directory size recursively
    async function getDirectorySize(dir) {
      let size = 0;
      let fileCount = 0;
      
      try {
        const files = await fs.readdir(dir, { withFileTypes: true });
        
        for (const file of files) {
          const filePath = path.join(dir, file.name);
          
          if (file.isDirectory()) {
            const subDirInfo = await getDirectorySize(filePath);
            size += subDirInfo.size;
            fileCount += subDirInfo.fileCount;
          } else {
            const stats = await fs.stat(filePath);
            size += stats.size;
            fileCount++;
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
      }
      
      return { size, fileCount };
    }

    // Get user's experiments with file paths
    const experiments = await Experiment.findAll({
      where: { 
        user_id: req.user.id,
        experiment_files_path: { [Op.ne]: null }
      },
      attributes: ['id', 'title', 'experiment_files_path']
    });

    let totalSize = 0;
    let totalFiles = 0;
    const experimentStorage = [];

    for (const exp of experiments) {
      const expPath = path.join(uploadDir, 'experiments', exp.id);
      try {
        const { size, fileCount } = await getDirectorySize(expPath);
        totalSize += size;
        totalFiles += fileCount;
        
        // Separate data folder stats
        const dataPath = path.join(expPath, 'data');
        let dataSize = 0;
        let dataFileCount = 0;
        
        try {
          const dataStats = await getDirectorySize(dataPath);
          dataSize = dataStats.size;
          dataFileCount = dataStats.fileCount;
        } catch (e) {
          // Data folder might not exist
        }
        
        experimentStorage.push({
          experiment_id: exp.id,
          experiment_title: exp.title,
          total_size_bytes: size,
          total_size_mb: (size / (1024 * 1024)).toFixed(2),
          total_file_count: fileCount,
          experiment_files: {
            size_bytes: size - dataSize,
            size_mb: ((size - dataSize) / (1024 * 1024)).toFixed(2),
            file_count: fileCount - dataFileCount
          },
          data_files: {
            size_bytes: dataSize,
            size_mb: (dataSize / (1024 * 1024)).toFixed(2),
            file_count: dataFileCount
          }
        });
      } catch (error) {
        // Directory might not exist
        console.error(`Error getting size for experiment ${exp.id}:`, error);
      }
    }

    // Get database storage for experiment data
    const dataStorageQuery = await ExperimentData.findAll({
      attributes: [
        'experiment_id',
        [ExperimentData.sequelize.fn('COUNT', ExperimentData.sequelize.col('ExperimentData.id')), 'data_count'],
        [ExperimentData.sequelize.fn('SUM', ExperimentData.sequelize.fn('LENGTH', ExperimentData.sequelize.cast(ExperimentData.sequelize.col('ExperimentData.data'), 'text'))), 'data_size']
      ],
      include: [{
        model: Experiment,
        where: { user_id: req.user.id },
        attributes: ['title']
      }],
      group: ['ExperimentData.experiment_id', 'Experiment.id', 'Experiment.title'],
      raw: true
    });

    // Calculate total database storage
    let totalDbSize = 0;
    const dbStorage = dataStorageQuery.map(row => {
      const size = parseInt(row.data_size) || 0;
      totalDbSize += size;
      return {
        experiment_id: row.experiment_id,
        experiment_title: row['Experiment.title'],
        data_count: parseInt(row.data_count),
        db_size_bytes: size,
        db_size_mb: (size / (1024 * 1024)).toFixed(2)
      };
    });

    res.json({
      file_storage: {
        bytes: totalSize,
        mb: (totalSize / (1024 * 1024)).toFixed(2),
        gb: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
        file_count: totalFiles
      },
      database_storage: {
        bytes: totalDbSize,
        mb: (totalDbSize / (1024 * 1024)).toFixed(2),
        data_points: dbStorage.reduce((sum, exp) => sum + exp.data_count, 0)
      },
      total_storage: {
        bytes: totalSize + totalDbSize,
        mb: ((totalSize + totalDbSize) / (1024 * 1024)).toFixed(2),
        gb: ((totalSize + totalDbSize) / (1024 * 1024 * 1024)).toFixed(2)
      },
      experiments: experimentStorage,
      database_data: dbStorage,
      data_location: {
        files: process.env.UPLOAD_DIR || './uploads',
        database: 'PostgreSQL database (experiment_data table)'
      }
    });
  } catch (error) {
    console.error('Dashboard storage error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;