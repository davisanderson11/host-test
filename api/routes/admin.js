// routes/admin.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const User = require('../models/user');
const Experiment = require('../models/experiment');
const ExperimentData = require('../models/experimentData');
const path = require('path');
const fs = require('fs').promises;

// Admin auth middleware
const adminAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(payload.id);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.user = payload;
    req.isAdmin = true;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /admin/users - List all users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'created_at', 'isAdmin', 'prolificApiToken'],
      order: [['created_at', 'DESC']]
    });
    
    res.json({
      total: users.length,
      users: users.map(u => ({
        ...u.toJSON(),
        isProlificLinked: !!u.prolificApiToken
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /admin/users/:id/admin - Grant/revoke admin access
router.put('/users/:id/admin', adminAuth, async (req, res) => {
  try {
    const { isAdmin } = req.body;
    
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot modify your own admin status' });
    }
    
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await user.update({ isAdmin: !!isAdmin });
    
    res.json({
      message: `Admin access ${isAdmin ? 'granted' : 'revoked'}`,
      user: {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/experiments - List all experiments (all users)
router.get('/experiments', adminAuth, async (req, res) => {
  try {
    const experiments = await Experiment.findAll({
      include: [{
        model: User,
        as: 'owner',
        attributes: ['id', 'email']
      }],
      order: [['created_at', 'DESC']]
    });
    
    // Get participant counts
    const experimentData = await Promise.all(
      experiments.map(async (exp) => {
        const participantCount = await ExperimentData.count({
          where: { experiment_id: exp.id }
        });
        
        return {
          ...exp.toJSON(),
          participant_count: participantCount
        };
      })
    );
    
    res.json({
      total: experiments.length,
      experiments: experimentData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /admin/experiments/:id - Delete any experiment
router.delete('/experiments/:id', adminAuth, async (req, res) => {
  try {
    const experiment = await Experiment.findByPk(req.params.id);
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    // Delete all experiment data
    await ExperimentData.destroy({
      where: { experiment_id: experiment.id }
    });
    
    // Delete experiment files
    const expPath = path.join(__dirname, '..', process.env.UPLOAD_DIR || './uploads', 'experiments', experiment.id);
    try {
      await fs.rm(expPath, { recursive: true, force: true });
    } catch (e) {
      console.error('Error deleting experiment files:', e);
    }
    
    // Delete experiment
    const title = experiment.title;
    await experiment.destroy();
    
    res.json({
      message: `Experiment "${title}" and all associated data deleted`,
      experiment_id: req.params.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /admin/users/:id - Delete any user and their data
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own admin account' });
    }
    
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get all user's experiments
    const experiments = await Experiment.findAll({ where: { user_id: user.id } });
    
    // Delete all experiment data and files
    for (const exp of experiments) {
      await ExperimentData.destroy({ where: { experiment_id: exp.id } });
      
      const expPath = path.join(__dirname, '..', process.env.UPLOAD_DIR || './uploads', 'experiments', exp.id);
      try {
        await fs.rm(expPath, { recursive: true, force: true });
      } catch (e) {
        console.error('Error deleting experiment files:', e);
      }
    }
    
    // Delete all experiments
    await Experiment.destroy({ where: { user_id: user.id } });
    
    // Delete user
    const email = user.email;
    await user.destroy();
    
    res.json({
      message: `User ${email} and all associated data deleted`,
      deleted: {
        experiments: experiments.length,
        user_id: req.params.id
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/stats - Platform statistics
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.count();
    const totalExperiments = await Experiment.count();
    const liveExperiments = await Experiment.count({ where: { live: true } });
    const totalParticipants = await ExperimentData.count();
    const prolificLinkedUsers = await User.count({
      where: { prolificApiToken: { [Op.ne]: null } }
    });
    
    // Get recent activity
    const recentUsers = await User.count({
      where: {
        created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    });
    
    const recentParticipants = await ExperimentData.count({
      where: {
        created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    });
    
    res.json({
      platform_stats: {
        total_users: totalUsers,
        total_experiments: totalExperiments,
        live_experiments: liveExperiments,
        total_participants: totalParticipants,
        prolific_linked_users: prolificLinkedUsers
      },
      recent_activity: {
        new_users_this_week: recentUsers,
        new_participants_this_week: recentParticipants
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;