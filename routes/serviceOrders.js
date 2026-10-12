const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { auth, authorize } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');

// Get all service orders with filters
router.get('/', auth, async (req, res) => {
  try {
    const { 
      status, 
      priority, 
      company_code, 
      plant, 
      region, 
      service_type, 
      transaction_type,
      assigned_technician_id,
      from_date,
      to_date,
      search,
      page = 1,
      limit = 50
    } = req.query;

    let query = `
      SELECT so.*, 
             u.first_name, u.last_name, u.email as technician_email,
             COUNT(DISTINCT e.id) as exception_count,
             COUNT(DISTINCT a.id) as pending_approvals
      FROM service_orders so
      LEFT JOIN users u ON so.assigned_technician_id = u.id
      LEFT JOIN exceptions e ON so.id = e.service_order_id AND e.status != 'closed'
      LEFT JOIN approvals a ON so.id = a.service_order_id AND a.status = 'pending'
      WHERE 1=1
    `;
    
    const params = [];

    // Apply filters
    if (status) {
      query += ' AND so.status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND so.priority = ?';
      params.push(priority);
    }
    if (company_code) {
      query += ' AND so.company_code = ?';
      params.push(company_code);
    }
    if (plant) {
      query += ' AND so.plant = ?';
      params.push(plant);
    }
    if (region) {
      query += ' AND so.region = ?';
      params.push(region);
    }
    if (service_type) {
      query += ' AND so.service_type = ?';
      params.push(service_type);
    }
    if (transaction_type) {
      query += ' AND so.transaction_type = ?';
      params.push(transaction_type);
    }
    if (assigned_technician_id) {
      query += ' AND so.assigned_technician_id = ?';
      params.push(assigned_technician_id);
    }
    if (from_date) {
      query += ' AND so.created_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND so.created_date <= ?';
      params.push(to_date);
    }
    if (search) {
      query += ' AND (so.order_number LIKE ? OR so.customer_name LIKE ? OR so.description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Role-based filtering
    if (req.user.role === 'technician') {
      query += ' AND so.assigned_technician_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'supervisor' && req.user.region) {
      query += ' AND so.region = ?';
      params.push(req.user.region);
    }

    query += ' GROUP BY so.id ORDER BY so.created_date DESC';

    // Pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [orders] = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(DISTINCT so.id) as total FROM service_orders so WHERE 1=1';
    const countParams = params.slice(0, -2); // Remove limit and offset
    
    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    res.json({ 
      success: true, 
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get service orders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single service order
router.get('/:id', auth, async (req, res) => {
  try {
    const [orders] = await db.query(`
      SELECT so.*, 
             u.first_name, u.last_name, u.email as technician_email, u.phone as technician_phone
      FROM service_orders so
      LEFT JOIN users u ON so.assigned_technician_id = u.id
      WHERE so.id = ?
    `, [req.params.id]);

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Service order not found' });
    }

    // Get material items
    const [materials] = await db.query('SELECT * FROM material_items WHERE service_order_id = ?', [req.params.id]);
    
    // Get exceptions
    const [exceptions] = await db.query('SELECT * FROM exceptions WHERE service_order_id = ?', [req.params.id]);
    
    // Get approvals
    const [approvals] = await db.query(`
      SELECT a.*, u.first_name, u.last_name, u.email
      FROM approvals a
      LEFT JOIN users u ON a.approver_id = u.id
      WHERE a.service_order_id = ?
    `, [req.params.id]);
    
    // Get documents
    const [documents] = await db.query(`
      SELECT d.*, u.first_name, u.last_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.service_order_id = ?
    `, [req.params.id]);

    const order = {
      ...orders[0],
      materials,
      exceptions,
      approvals,
      documents
    };

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Get service order error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create service order
router.post('/', auth, authorize('supervisor', 'manager', 'admin'), [
  body('company_code').notEmpty(),
  body('plant').notEmpty(),
  body('region').notEmpty(),
  body('service_type').notEmpty(),
  body('transaction_type').isIn(['IN01', 'IN02'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      company_code, plant, region, service_type, transaction_type,
      priority, customer_id, customer_name, partner_id, partner_name,
      assigned_technician_id, description, notes, estimated_cost, due_date
    } = req.body;

    // Generate order number
    const orderNumber = `SO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const [result] = await db.query(`
      INSERT INTO service_orders (
        order_number, company_code, plant, region, service_type, transaction_type,
        priority, customer_id, customer_name, partner_id, partner_name,
        assigned_technician_id, description, notes, estimated_cost, due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      orderNumber, company_code, plant, region, service_type, transaction_type,
      priority || 'medium', customer_id, customer_name, partner_id, partner_name,
      assigned_technician_id, description, notes, estimated_cost, due_date
    ]);

    // Create notification for assigned technician
    if (assigned_technician_id) {
      await createNotification(
        assigned_technician_id,
        'assignment',
        'New Service Order Assigned',
        `You have been assigned to service order ${orderNumber}`,
        `/service-orders/${result.insertId}`
      );

      // Emit real-time notification
      const io = req.app.get('io');
      io.emit(`notification:${assigned_technician_id}`, {
        type: 'assignment',
        message: `New service order ${orderNumber} assigned to you`
      });
    }

    res.status(201).json({ 
      success: true, 
      message: 'Service order created successfully',
      orderId: result.insertId,
      orderNumber
    });
  } catch (error) {
    console.error('Create service order error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update service order
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = [];
    const values = [];

    const allowedFields = [
      'status', 'priority', 'assigned_technician_id', 'description', 
      'notes', 'estimated_cost', 'actual_cost', 'due_date', 'completed_date'
    ];

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
      `UPDATE service_orders SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ success: true, message: 'Service order updated successfully' });
  } catch (error) {
    console.error('Update service order error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete service order
router.delete('/:id', auth, authorize('manager', 'admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM service_orders WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Service order deleted successfully' });
  } catch (error) {
    console.error('Delete service order error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
