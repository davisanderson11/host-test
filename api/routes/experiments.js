// routes/experiments.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const Experiment = require('../models/experiment');

const router = express.Router();

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

// POST /experiments
router.post(
  '/',
  auth,
  body('title').isString().notEmpty(),
  body('description').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const exp = await Experiment.create({
        user_id: req.user.id,
        title: req.body.title,
        description: req.body.description || null
      });
      res.status(201).json(exp);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /experiments
router.get('/', auth, async (req, res) => {
  try {
    const exps = await Experiment.findAll({ where: { user_id: req.user.id } });
    res.json(exps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /experiments/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const exp = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    if (!exp) return res.status(404).json({ error: 'Experiment not found' });
    res.json(exp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /experiments/:id
router.put(
  '/:id',
  auth,
  body('title').optional().isString(),
  body('description').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const exp = await Experiment.findOne({
        where: { id: req.params.id, user_id: req.user.id }
      });
      if (!exp) return res.status(404).json({ error: 'Experiment not found' });
      await exp.update(req.body);
      res.json(exp);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /experiments/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await Experiment.destroy({
      where: { id: req.params.id, user_id: req.user.id }
    });
    if (!deleted) return res.status(404).json({ error: 'Experiment not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle experiment live status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const experiment = await Experiment.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });
    
    // Generate completion code if going live for the first time
    if (!experiment.live && !experiment.completion_code) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      await experiment.update({ 
        live: true, 
        completion_code: code 
      });
    } else {
      await experiment.update({ live: !experiment.live });
    }
    
    res.json({ 
      id: experiment.id,
      live: experiment.live,
      completion_code: experiment.completion_code,
      public_url: `${process.env.PUBLIC_URL}/run/${experiment.id}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
