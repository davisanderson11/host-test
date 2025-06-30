// routes/experiments.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Experiment = require('../models/experiment');

const router = express.Router();

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

module.exports = router;
