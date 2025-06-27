// routes/experiments.js
const express = require('express');
const db = require('../config/db');
const router = express.Router();

// create experiment
router.post('/', async (req, res, next) => {
  const { title, description } = req.body;
  const ownerId = req.user.id;
  const result = await db.query(
    `insert into experiments(owner_id, title, description)
     values($1,$2,$3) returning *`,
    [ownerId, title, description]
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;
