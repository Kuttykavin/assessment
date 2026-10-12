const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Get all users
router.get('/', auth, authorize('supervisor', 'manager', 'admin'), async (req, res) => {
  try {
    const { role, region, is_active } = req.query;

    let query = 'SELECT id, username, email, first_name, last_name, role, company_code, plant, region, phone, is_active, last_login FROM users WHERE 1=1';
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    if (region) {
      query += ' AND region = ?';
      params.push(region);
    }
    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active === 'true');
    }

    query += ' ORDER BY first_name, last_name';

    const [users] = await db.query(query, params);

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single user
router.get('/:id', auth, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, username, email, first_name, last_name, role, company_code, plant, region, phone, is_active, last_login FROM users WHERE id = ?',
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: users[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user
router.put('/:id', auth, authorize('manager', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = [];
    const values = [];

    const allowedFields = ['email', 'first_name', 'last_name', 'role', 'company_code', 'plant', 'region', 'phone', 'is_active'];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);

    await db.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete user
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
