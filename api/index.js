// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
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
// Profile - includes Prolific account linking
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
