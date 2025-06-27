// index.js
const express = require('express')
const cors    = require('cors')
const app     = express()
const db = require('./config/db')

app.use(cors())
app.use(express.json())

// Auth
app.post('/auth/signin', require('./routes/auth').signin)

// Profile
app.get ('/profile', require('./routes/profile').get)
app.patch('/profile', require('./routes/profile').update)

// Experiments
app.get ('/experiments', require('./routes/experiments').list)
app.post('/experiments', require('./routes/experiments').create)

// ...etc.

const PORT = process.env.PORT||3000
app.listen(PORT, ()=> console.log(`API listening on ${PORT}`))
