// routes/profile.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

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

// GET /profile
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'created_at', 'prolificApiToken', 'prolificWorkspaceId']
    });
    // Don't expose the full token, just indicate if it's linked
    const response = {
      ...user.toJSON(),
      prolificApiToken: user.prolificApiToken ? '****' : null,
      isProlificLinked: !!user.prolificApiToken
    };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to validate Prolific API token
const validateProlificToken = async (token) => {
  try {
    const response = await fetch('https://api.prolific.co/api/v1/users/me/', {
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return { valid: false, error: 'Invalid Prolific API token' };
    }
    
    const userData = await response.json();
    return { valid: true, userData };
  } catch (error) {
    return { valid: false, error: 'Failed to validate token with Prolific' };
  }
};

// PUT /profile/link-prolific - Link Prolific account
router.put('/link-prolific', auth, async (req, res) => {
  const { prolificApiToken } = req.body;
  
  if (!prolificApiToken) {
    return res.status(400).json({ error: 'Prolific API token is required' });
  }
  
  try {
    // Validate token with Prolific
    const validation = await validateProlificToken(prolificApiToken);
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Update user with Prolific token and workspace info
    const user = await User.findByPk(req.user.id);
    await user.update({
      prolificApiToken: prolificApiToken,
      prolificWorkspaceId: validation.userData.workspace_id || null
    });
    
    res.json({ 
      message: 'Prolific account linked successfully',
      prolificUser: {
        id: validation.userData.id,
        email: validation.userData.email,
        workspace_id: validation.userData.workspace_id
      }
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /profile/unlink-prolific - Unlink Prolific account
router.delete('/unlink-prolific', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    await user.update({
      prolificApiToken: null,
      prolificWorkspaceId: null
    });
    
    res.json({ message: 'Prolific account unlinked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
