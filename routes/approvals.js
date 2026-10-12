const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');

// Get approvals (filtered by role)
router.get('/', auth, async (req, res) => {
  try {
    const { status, approval_type, page = 1, limit = 50 } = req.query;

    let query = `
      SELECT a.*, 
             so.order_number, so.description,
             requester.first_name as requester_first, requester.last_name as requester_last,
             approver.first_name as approver_first, approver.last_name as approver_last
      FROM approvals a
      LEFT JOIN service_orders so ON a.service_order_id = so.id
      LEFT JOIN users requester ON a.requested_by = requester.id
      LEFT JOIN users approver ON a.approver_id = approver.id
      WHERE 1=1
    `;
    
    const params = [];

    // Filter by status
    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    // Filter by approval type
    if (approval_type) {
      query += ' AND a.approval_type = ?';
      params.push(approval_type);
    }

    // Role-based filtering
    if (req.user.role === 'technician' || req.user.role === 'supervisor') {
      query += ' AND (a.requested_by = ? OR a.approver_id = ?)';
      params.push(req.user.id, req.user.id);
    } else if (req.user.role === 'manager') {
      query += ' AND a.approver_id = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY a.request_date DESC';

    // Pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [approvals] = await db.query(query, params);

    res.json({ success: true, data: approvals });
  } catch (error) {
    console.error('Get approvals error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create approval request
router.post('/', auth, [
  body('service_order_id').isInt(),
  body('approval_type').isIn(['cost', 'exception', 'change', 'completion']),
  body('approver_id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { service_order_id, approval_type, approver_id, comments, amount } = req.body;

    const [result] = await db.query(`
      INSERT INTO approvals (service_order_id, approval_type, requested_by, approver_id, comments, amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [service_order_id, approval_type, req.user.id, approver_id, comments, amount]);

    // Create notification for approver
    await createNotification(
      approver_id,
      'approval',
      'New Approval Request',
      `Approval requested for service order`,
      `/approvals/${result.insertId}`
    );

    // Emit real-time notification
    const io = req.app.get('io');
    io.emit(`notification:${approver_id}`, {
      type: 'approval',
      message: 'New approval request received'
    });

    res.status(201).json({ 
      success: true, 
      message: 'Approval request created successfully',
      approvalId: result.insertId
    });
  } catch (error) {
    console.error('Create approval error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Respond to approval (approve/reject)
router.put('/:id/respond', auth, [
  body('status').isIn(['approved', 'rejected']),
  body('comments').optional()
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comments, rejection_reason } = req.body;

    // Get approval details
    const [approvals] = await db.query('SELECT * FROM approvals WHERE id = ?', [id]);
    
    if (approvals.length === 0) {
      return res.status(404).json({ success: false, message: 'Approval not found' });
    }

    const approval = approvals[0];

    // Check if user is the approver
    if (approval.approver_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to respond to this approval' });
    }

    // Update approval
    await db.query(`
      UPDATE approvals 
      SET status = ?, response_date = NOW(), comments = ?, rejection_reason = ?
      WHERE id = ?
    `, [status, comments, rejection_reason, id]);

    // Notify requester
    await createNotification(
      approval.requested_by,
      'status_change',
      `Approval ${status}`,
      `Your approval request has been ${status}`,
      `/approvals/${id}`
    );

    res.json({ success: true, message: `Approval ${status} successfully` });
  } catch (error) {
    console.error('Respond to approval error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
