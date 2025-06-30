// routes/auth.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const router = express.Router();

// Signup
router.post(
  '/signup',
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const hash = await bcrypt.hash(req.body.password, 10);
      const user = await User.create({
        email: req.body.email,
        passwordHash: hash
      });
      res.status(201).json({ id: user.id, email: user.email });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Login
router.post(
  '/login',
  body('email').isEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const user = await User.findOne({ where: { email: req.body.email } });
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const match = await bcrypt.compare(req.body.password, user.passwordHash);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.json({ token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Delete account
router.delete('/account', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findByPk(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Delete all user's experiments and data first
    const Experiment = require('../models/experiment');
    const ExperimentData = require('../models/experimentData');
    
    // Get all user's experiments
    const experiments = await Experiment.findAll({ where: { user_id: user.id } });
    
    // Delete all experiment data for each experiment
    for (const exp of experiments) {
      await ExperimentData.destroy({ where: { experiment_id: exp.id } });
    }
    
    // Delete all experiments
    await Experiment.destroy({ where: { user_id: user.id } });
    
    // Finally delete the user
    await user.destroy();
    
    res.json({ message: 'Account and all associated data deleted successfully' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
