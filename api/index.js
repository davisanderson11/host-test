// index.js
require('dotenv').config(); 
const express = require('express');
const cors    = require('cors');
const db = require('./config/db');
const app     = express();

app.use(cors())
app.use(express.json())

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
const authRouter = require('./routes/auth')
app.use('/auth', authRouter);

// Profile
const profileRouter = require('./routes/profile')
app.use('/profile', profileRouter)

// Experiments
const experimentsRouter = require('./routes/experiments')
app.use('/experiments', experimentsRouter)

// ...etc.

const PORT = process.env.PORT||3000
app.listen(PORT, ()=> console.log(`API listening on ${PORT}`))
