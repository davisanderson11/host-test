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
app.post('/auth/signin', require('./routes/auth').signin)

// Profile
app.get ('/profile', require('./routes/profile').get)
app.patch('/profile', require('./routes/profile').update)

// Experiments
const experimentsRouter = require('./routes/experiments')
app.use('/experiments', experimentsRouter)

// ...etc.

const PORT = process.env.PORT||3000
app.listen(PORT, ()=> console.log(`API listening on ${PORT}`))
