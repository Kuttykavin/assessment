const db = require('../config/database');

async function createNotification(userId, type, title, message, link = null) {
  try {
    await db.query(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, type, title, message, link]);
  } catch (error) {
    console.error('Create notification error:', error);
  }
}

module.exports = { createNotification };
