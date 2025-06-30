const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const { upload, UPLOAD_DIR } = require('../config/upload');
const Experiment = require('../models/experiment');

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

// Upload files for an experiment
router.post('/:id/upload', auth, upload.array('files'), async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Update experiment with files path
    await experiment.update({
      experiment_files_path: path.join('experiments', req.params.id)
    });

    // Return uploaded files info
    const uploadedFiles = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      path: file.path.replace(/\\/g, '/')
    }));

    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
      experimentId: req.params.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List files for an experiment
router.get('/:id/files', auth, async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    const experimentDir = path.join(UPLOAD_DIR, 'experiments', req.params.id);
    
    try {
      const files = await fs.readdir(experimentDir);
      const fileStats = await Promise.all(
        files.map(async (filename) => {
          const filePath = path.join(experimentDir, filename);
          const stats = await fs.stat(filePath);
          return {
            filename,
            size: stats.size,
            uploaded: stats.mtime
          };
        })
      );
      
      res.json({ files: fileStats });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json({ files: [] });
      } else {
        throw error;
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific file
router.delete('/:id/files/:filename', auth, async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Sanitize filename to prevent directory traversal
    const filename = path.basename(req.params.filename);
    const filePath = path.join(UPLOAD_DIR, 'experiments', req.params.id, filename);
    
    try {
      await fs.unlink(filePath);
      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found' });
      } else {
        throw error;
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;