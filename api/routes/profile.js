const express = require('express');
const router = express.Router();

// Profile routes
router.get('/', (req, res) => {
  res.json({ message: 'Get profile' });
});

router.put('/', (req, res) => {
  res.json({ message: 'Update profile' });
});

router.delete('/', (req, res) => {
  res.json({ message: 'Delete profile' });
});

module.exports = router;