// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const path = require('path');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const experimentsRouter = require('./routes/experiments');
const uploadRouter = require('./routes/upload');
const publicRouter = require('./routes/public');

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
// File uploads
app.use('/experiments', uploadRouter);

// Public routes (no auth required)
app.use('/', publicRouter);

// Serve uploaded files (for public experiment access)
app.use('/run/:id/assets', (req, res, next) => {
  const experimentId = req.params.id;
  const uploadPath = path.join(__dirname, process.env.UPLOAD_DIR || './uploads', 'experiments', experimentId);
  express.static(uploadPath)(req, res, next);
});

// Sync DB then start server
const sequelizeInstance = db.sequelize;
sequelizeInstance.sync({ alter: true })
  .then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`API listening on ${PORT}`));
  })
  .catch(err => console.error('DB sync error:', err));
