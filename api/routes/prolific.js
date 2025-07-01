// routes/prolific.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Experiment = require('../models/experiment');
const User = require('../models/user');
const prolificService = require('../services/prolific');

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

// POST /experiments/:id/prolific/create - Create a Prolific study
router.post('/:id/prolific/create', 
  auth,
  body('name').notEmpty().withMessage('Study name is required'),
  body('description').notEmpty().withMessage('Study description is required'),
  body('estimated_completion_time').isInt({ min: 1 }).withMessage('Estimated completion time in minutes is required'),
  body('reward').isInt({ min: 0 }).withMessage('Reward in pence is required'),
  body('total_available_places').isInt({ min: 1 }).withMessage('Number of participants is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Get experiment
      const experiment = await Experiment.findOne({
        where: { id: req.params.id, user_id: req.user.id }
      });

      if (!experiment) {
        return res.status(404).json({ error: 'Experiment not found' });
      }

      if (!experiment.live) {
        return res.status(400).json({ error: 'Experiment must be live before posting to Prolific' });
      }

      // Get user's Prolific token
      const user = await User.findByPk(req.user.id);
      if (!user.prolificApiToken) {
        return res.status(400).json({ error: 'Prolific account not linked. Please link your Prolific account first.' });
      }

      // Build study URL from environment variable
      const baseUrl = process.env.PUBLIC_URL || 'https://host-test-production.up.railway.app';
      
      // Create the experiment URL
      const experimentUrl = `${baseUrl}/run/${experiment.id}`;
      
      // Prolific requires these URL parameters to be included
      const studyUrl = `${experimentUrl}?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`;
      
      // Create Prolific study
      const studyData = {
        name: req.body.name,
        description: req.body.description,
        external_study_url: studyUrl,
        prolific_id_option: 'url_parameters', // Pass PROLIFIC_PID as URL parameter
        estimated_completion_time: req.body.estimated_completion_time,
        reward: req.body.reward,
        total_available_places: req.body.total_available_places,
        completion_code: experiment.completion_code,
        completion_option: 'code',
        device_compatibility: req.body.device_compatibility || ['desktop', 'tablet', 'mobile'],
        peripheral_requirements: req.body.peripheral_requirements || [],
        // Add eligibility requirements if provided
        eligibility_requirements: req.body.eligibility_requirements || []
      };

      console.log('Creating Prolific study with data:', JSON.stringify(studyData, null, 2));
      const prolificStudy = await prolificService.createStudy(user.prolificApiToken, studyData);

      // Update experiment with Prolific study ID
      await experiment.update({
        prolific_study_id: prolificStudy.id,
        prolific_status: 'draft'
      });

      res.json({
        message: 'Prolific study created successfully',
        prolific_study_id: prolificStudy.id,
        status: prolificStudy.status,
        study_url: studyUrl,
        completion_code: experiment.completion_code,
        prolific_dashboard_url: `https://app.prolific.com/researcher/workspaces/${user.prolificWorkspaceId}/studies/${prolificStudy.id}`
      });
    } catch (error) {
      // Check for specific Prolific errors
      if (error.message.includes('finance section')) {
        res.status(400).json({ 
          error: 'Prolific account setup incomplete',
          message: 'Please complete your Prolific account setup: Add your billing address in the Finance section at https://app.prolific.com',
          prolific_study_id: experiment.prolific_study_id,
          status: 'draft'
        });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
);

// POST /experiments/:id/prolific/publish - Publish study (make it live)
router.post('/:id/prolific/publish', auth, async (req, res) => {
  try {
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    if (!experiment.prolific_study_id) {
      return res.status(400).json({ error: 'No Prolific study created for this experiment' });
    }

    // Get user's Prolific token
    const user = await User.findByPk(req.user.id);
    if (!user.prolificApiToken) {
      return res.status(400).json({ error: 'Prolific account not linked' });
    }

    // Publish the study
    await prolificService.publishStudy(user.prolificApiToken, experiment.prolific_study_id);

    // Update experiment status
    await experiment.update({ prolific_status: 'published' });

    res.json({
      message: 'Study published successfully on Prolific',
      prolific_study_id: experiment.prolific_study_id,
      status: 'published'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /experiments/:id/prolific/status - Get Prolific study status
router.get('/:id/prolific/status', auth, async (req, res) => {
  try {
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    if (!experiment.prolific_study_id) {
      return res.json({
        prolific_enabled: false,
        message: 'No Prolific study created for this experiment'
      });
    }

    // Get user's Prolific token
    const user = await User.findByPk(req.user.id);
    if (!user.prolificApiToken) {
      return res.status(400).json({ error: 'Prolific account not linked' });
    }

    // Get study details from Prolific
    const study = await prolificService.getStudy(user.prolificApiToken, experiment.prolific_study_id);

    res.json({
      prolific_enabled: true,
      prolific_study_id: study.id,
      status: study.status,
      name: study.name,
      total_available_places: study.total_available_places,
      places_taken: study.places_taken,
      submission_count: study.submission_count,
      reward: study.reward,
      average_completion_time: study.average_completion_time,
      created_at: study.created_at,
      started_at: study.started_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /experiments/:id/prolific/stop - Stop a Prolific study
router.post('/:id/prolific/stop', auth, async (req, res) => {
  try {
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    if (!experiment.prolific_study_id) {
      return res.status(400).json({ error: 'No Prolific study created for this experiment' });
    }

    // Get user's Prolific token
    const user = await User.findByPk(req.user.id);
    if (!user.prolificApiToken) {
      return res.status(400).json({ error: 'Prolific account not linked' });
    }

    // Stop the study
    await prolificService.stopStudy(user.prolificApiToken, experiment.prolific_study_id);

    // Update experiment status
    await experiment.update({ prolific_status: 'completed' });

    res.json({
      message: 'Study stopped successfully',
      prolific_study_id: experiment.prolific_study_id,
      status: 'stopped'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;