// db.js
const { Pool } = require('pg');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Expose both raw query and Sequelize instance for compatibility
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  sequelize
};