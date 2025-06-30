// routes/data.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Parser } = require('json2csv');
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

// GET /experiments/:id/data - Get all data for an experiment
router.get('/:id/data', auth, async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Get all data for this experiment
    const data = await ExperimentData.findAll({
      where: { experiment_id: experiment.id },
      order: [['created_at', 'DESC']]
    });

    // Format the response
    const formattedData = data.map(d => ({
      id: d.id,
      session_id: d.session_id,
      prolific_pid: d.prolific_pid,
      created_at: d.created_at,
      synced_to_osf: d.synced_to_osf,
      data: d.data
    }));

    res.json({
      experiment_id: experiment.id,
      experiment_title: experiment.title,
      total_participants: data.length,
      data: formattedData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /experiments/:id/data/export/json - Export data as JSON
router.get('/:id/data/export/json', auth, async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Get all data
    const data = await ExperimentData.findAll({
      where: { experiment_id: experiment.id },
      order: [['created_at', 'ASC']]
    });

    // Flatten the jsPsych data for export
    const exportData = [];
    data.forEach(participant => {
      const trials = participant.data;
      if (Array.isArray(trials)) {
        trials.forEach(trial => {
          exportData.push({
            participant_id: participant.id,
            session_id: participant.session_id,
            prolific_pid: participant.prolific_pid || 'NA',
            created_at: participant.created_at,
            ...trial
          });
        });
      }
    });

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${experiment.title.replace(/[^a-z0-9]/gi, '_')}_data.json"`);
    
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /experiments/:id/data/export/csv - Export data as CSV
router.get('/:id/data/export/csv', auth, async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Get all data
    const data = await ExperimentData.findAll({
      where: { experiment_id: experiment.id },
      order: [['created_at', 'ASC']]
    });

    // Flatten the jsPsych data for CSV export
    const csvData = [];
    data.forEach(participant => {
      const trials = participant.data;
      if (Array.isArray(trials)) {
        trials.forEach(trial => {
          csvData.push({
            participant_id: participant.id,
            session_id: participant.session_id,
            prolific_pid: participant.prolific_pid || 'NA',
            created_at: participant.created_at,
            ...trial
          });
        });
      }
    });

    if (csvData.length === 0) {
      return res.status(404).json({ error: 'No data to export' });
    }

    // Convert to CSV
    const json2csvParser = new Parser({ fields: Object.keys(csvData[0]) });
    const csv = json2csvParser.parse(csvData);

    // Set headers for download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${experiment.title.replace(/[^a-z0-9]/gi, '_')}_data.csv"`);
    
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /experiments/:id/data/:participantId - Get data for specific participant
router.get('/:id/data/:participantId', auth, async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Get participant data
    const participantData = await ExperimentData.findOne({
      where: { 
        id: req.params.participantId,
        experiment_id: experiment.id 
      }
    });

    if (!participantData) {
      return res.status(404).json({ error: 'Participant data not found' });
    }

    res.json({
      id: participantData.id,
      session_id: participantData.session_id,
      prolific_pid: participantData.prolific_pid,
      created_at: participantData.created_at,
      synced_to_osf: participantData.synced_to_osf,
      data: participantData.data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /experiments/:id/data/:participantId - Delete specific participant data (GDPR compliance)
router.delete('/:id/data/:participantId', auth, async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Delete participant data
    const deleted = await ExperimentData.destroy({
      where: { 
        id: req.params.participantId,
        experiment_id: experiment.id 
      }
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Participant data not found' });
    }

    res.json({ success: true, message: 'Participant data deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /experiments/:id/data/summary - Get summary statistics
router.get('/:id/data/summary', auth, async (req, res) => {
  try {
    // Verify experiment ownership
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Get all data
    const data = await ExperimentData.findAll({
      where: { experiment_id: experiment.id }
    });

    // Calculate summary statistics
    const summary = {
      experiment_id: experiment.id,
      experiment_title: experiment.title,
      total_participants: data.length,
      participants_with_prolific_id: data.filter(d => d.prolific_pid).length,
      first_participant: data.length > 0 ? data[data.length - 1].created_at : null,
      last_participant: data.length > 0 ? data[0].created_at : null,
      synced_to_osf: data.filter(d => d.synced_to_osf).length,
      not_synced: data.filter(d => !d.synced_to_osf).length
    };

    // Calculate average completion time if possible
    const completionTimes = [];
    data.forEach(participant => {
      if (Array.isArray(participant.data) && participant.data.length > 0) {
        const firstTrial = participant.data[0];
        const lastTrial = participant.data[participant.data.length - 1];
        if (firstTrial.time_elapsed && lastTrial.time_elapsed) {
          completionTimes.push(lastTrial.time_elapsed - firstTrial.time_elapsed);
        }
      }
    });

    if (completionTimes.length > 0) {
      summary.average_completion_time_ms = Math.round(
        completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      );
      summary.average_completion_time_minutes = Math.round(
        summary.average_completion_time_ms / 60000 * 10
      ) / 10;
    }

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;