// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const experimentsRouter = require('./routes/experiments');

const app = express();
app.use(cors());
app.use(express.json());

// Ping
app.get('/ping', async (_, res) => {
  try {
    const { rows } = await db.query('SELECT NOW() AS now');
    res.json({ ok: true, now: rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Auth
app.use('/auth', authRouter);
// Profile
app.use('/profile', profileRouter);
// Experiments
app.use('/experiments', experimentsRouter);

// Sync DB then start server
const sequelizeInstance = db.sequelize;
sequelizeInstance.sync({ alter: true })
  .then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`API listening on ${PORT}`));
  })
  .catch(err => console.error('DB sync error:', err));

// experiments.js (excerpt)
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Experiment = require('../models/experiment');

router.post('/',
  body('title').isString().notEmpty(),
  body('description').optional().isString(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const exp = await Experiment.create({
        title: req.body.title,
        description: req.body.description || null,
        user_id: req.user.id
      });
      res.status(201).json(exp);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
