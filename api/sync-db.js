// sync-db.js
// Run this file to sync database schema changes
require('dotenv').config();
const { sequelize } = require('./config/db');

async function syncDatabase() {
  try {
    console.log('Syncing database schema...');
    
    // This will update the schema to match the models
    // alter: true will add new columns without dropping existing data
    await sequelize.sync({ alter: true });
    
    console.log('Database schema synced successfully!');
    console.log('New columns added:');
    console.log('- prolific_api_token (users table)');
    console.log('- prolific_workspace_id (users table)');
    
    process.exit(0);
  } catch (error) {
    console.error('Error syncing database:', error);
    process.exit(1);
  }
}

syncDatabase();