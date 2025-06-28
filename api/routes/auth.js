// routes/auth.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
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
        { expiresIn: '1h' }
      );
      res.json({ token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
