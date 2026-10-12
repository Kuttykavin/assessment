const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { getRecommendedAction } = require('../utils/recommendations');

// Get all exceptions
router.get('/', auth, async (req, res) => {
  try {
    const { status, severity, exception_type, assigned_to, page = 1, limit = 50 } = req.query;

    let query = `
      SELECT e.*, 
             so.order_number, so.customer_name, so.company_code, so.region,
             u.first_name, u.last_name, u.email
      FROM exceptions e
      LEFT JOIN service_orders so ON e.service_order_id = so.id
      LEFT JOIN users u ON e.assigned_to = u.id
      WHERE 1=1
    `;
    
    const params = [];

    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }
    if (severity) {
      query += ' AND e.severity = ?';
      params.push(severity);
    }
    if (exception_type) {
      query += ' AND e.exception_type = ?';
      params.push(exception_type);
    }
    if (assigned_to) {
      query += ' AND e.assigned_to = ?';
      params.push(assigned_to);
    }

    // Role-based filtering
    if (req.user.role === 'technician') {
      query += ' AND e.assigned_to = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY e.severity DESC, e.detected_date DESC';

    // Pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [exceptions] = await db.query(query, params);

    res.json({ success: true, data: exceptions });
  } catch (error) {
    console.error('Get exceptions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single exception
router.get('/:id', auth, async (req, res) => {
  try {
    const [exceptions] = await db.query(`
      SELECT e.*, 
             so.order_number, so.customer_name, so.company_code, so.region, so.description as order_description,
             u.first_name, u.last_name, u.email
      FROM exceptions e
      LEFT JOIN service_orders so ON e.service_order_id = so.id
      LEFT JOIN users u ON e.assigned_to = u.id
      WHERE e.id = ?
    `, [req.params.id]);

    if (exceptions.length === 0) {
      return res.status(404).json({ success: false, message: 'Exception not found' });
    }

    res.json({ success: true, data: exceptions[0] });
  } catch (error) {
    console.error('Get exception error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create exception
router.post('/', auth, [
  body('service_order_id').isInt(),
  body('exception_type').isIn(['missing_data', 'validation_error', 'approval_delay', 'aging', 'compliance', 'document_issue', 'cost_overrun']),
  body('severity').isIn(['low', 'medium', 'high', 'critical']),
  body('title').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { service_order_id, exception_type, severity, title, description, assigned_to } = req.body;

    // Get recommended action
    const recommendedAction = await getRecommendedAction(exception_type, service_order_id);

    const [result] = await db.query(`
      INSERT INTO exceptions (service_order_id, exception_type, severity, title, description, assigned_to, recommended_action)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [service_order_id, exception_type, severity, title, description, assigned_to, recommendedAction]);

    // Update service order status to exception
    await db.query('UPDATE service_orders SET status = ? WHERE id = ?', ['exception', service_order_id]);

    // Create notification
    if (assigned_to) {
      await createNotification(
        assigned_to,
        'exception',
        'New Exception Assigned',
        `Exception: ${title}`,
        `/exceptions/${result.insertId}`
      );
    }

    res.status(201).json({ 
      success: true, 
      message: 'Exception created successfully',
      exceptionId: result.insertId,
      recommendedAction
    });
  } catch (error) {
    console.error('Create exception error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update exception
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assigned_to, resolution_notes } = req.body;

    const updateFields = [];
    const values = [];

    if (status) {
      updateFields.push('status = ?');
      values.push(status);

      if (status === 'resolved' || status === 'closed') {
        updateFields.push('resolved_date = NOW()');
      }
      if (status === 'assigned') {
        updateFields.push('assigned_date = NOW()');
      }
    }

    if (assigned_to !== undefined) {
      updateFields.push('assigned_to = ?');
      values.push(assigned_to);
    }

    if (resolution_notes) {
      updateFields.push('resolution_notes = ?');
      values.push(resolution_notes);
    }

    values.push(id);

    await db.query(
      `UPDATE exceptions SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ success: true, message: 'Exception updated successfully' });
  } catch (error) {
    console.error('Update exception error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get exception analytics
router.get('/analytics/summary', auth, authorize('supervisor', 'manager', 'admin'), async (req, res) => {
  try {
    // Exception count by type
    const [byType] = await db.query(`
      SELECT exception_type, COUNT(*) as count
      FROM exceptions
      WHERE detected_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY exception_type
    `);

    // Exception count by severity
    const [bySeverity] = await db.query(`
      SELECT severity, COUNT(*) as count
      FROM exceptions
      WHERE detected_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY severity
    `);

    // Average resolution time
    const [avgResolution] = await db.query(`
      SELECT AVG(TIMESTAMPDIFF(HOUR, detected_date, resolved_date)) as avg_hours
      FROM exceptions
      WHERE resolved_date IS NOT NULL
    `);

    // Top root causes
    const [rootCauses] = await db.query(`
      SELECT exception_type, COUNT(*) as count
      FROM exceptions
      WHERE detected_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY exception_type
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        byType,
        bySeverity,
        avgResolutionHours: avgResolution[0].avg_hours,
        rootCauses
      }
    });
  } catch (error) {
    console.error('Exception analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
