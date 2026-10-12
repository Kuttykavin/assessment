const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

// Dashboard KPIs
router.get('/dashboard', auth, authorize('supervisor', 'manager', 'admin'), async (req, res) => {
  try {
    const { from_date, to_date, region } = req.query;

    // Service orders by status
    let statusQuery = 'SELECT status, COUNT(*) as count FROM service_orders WHERE 1=1';
    const params = [];

    if (from_date) {
      statusQuery += ' AND created_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      statusQuery += ' AND created_date <= ?';
      params.push(to_date);
    }
    if (region) {
      statusQuery += ' AND region = ?';
      params.push(region);
    }
    
    statusQuery += ' GROUP BY status';
    const [ordersByStatus] = await db.query(statusQuery, params);

    // Exceptions by severity
    const [exceptionsBySeverity] = await db.query(`
      SELECT severity, COUNT(*) as count
      FROM exceptions
      WHERE detected_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY severity
    `);

    // Open exceptions aging
    const [agingExceptions] = await db.query(`
      SELECT 
        CASE 
          WHEN DATEDIFF(NOW(), detected_date) <= 7 THEN '0-7 days'
          WHEN DATEDIFF(NOW(), detected_date) <= 14 THEN '8-14 days'
          WHEN DATEDIFF(NOW(), detected_date) <= 30 THEN '15-30 days'
          ELSE '30+ days'
        END as age_group,
        COUNT(*) as count
      FROM exceptions
      WHERE status IN ('open', 'assigned', 'in_progress')
      GROUP BY age_group
    `);

    // Productivity metrics (Activity ID-203)
    const [productivityMetrics] = await db.query(`
      SELECT 
        AVG(TIMESTAMPDIFF(HOUR, detected_date, resolved_date)) as avg_resolution_hours,
        COUNT(CASE WHEN TIMESTAMPDIFF(HOUR, detected_date, resolved_date) <= 24 THEN 1 END) as resolved_within_24h,
        COUNT(*) as total_resolved
      FROM exceptions
      WHERE resolved_date IS NOT NULL 
        AND detected_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    // Revenue at risk calculation
    const [revenueRisk] = await db.query(`
      SELECT 
        SUM(estimated_cost) as total_at_risk,
        COUNT(*) as exception_orders
      FROM service_orders
      WHERE status = 'exception' AND estimated_cost IS NOT NULL
    `);

    // Service orders by region
    const [ordersByRegion] = await db.query(`
      SELECT region, COUNT(*) as count, AVG(actual_cost) as avg_cost
      FROM service_orders
      WHERE created_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY region
    `);

    // Approval cycle time
    const [approvalCycleTime] = await db.query(`
      SELECT 
        AVG(TIMESTAMPDIFF(HOUR, request_date, response_date)) as avg_hours,
        approval_type
      FROM approvals
      WHERE response_date IS NOT NULL
      GROUP BY approval_type
    `);

    res.json({
      success: true,
      data: {
        ordersByStatus,
        exceptionsBySeverity,
        agingExceptions,
        productivity: productivityMetrics[0],
        revenueAtRisk: revenueRisk[0],
        ordersByRegion,
        approvalCycleTime
      }
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Trend analysis
router.get('/trends', auth, authorize('manager', 'admin'), async (req, res) => {
  try {
    const { metric, period = 'weekly', region } = req.query;

    let dateFormat, dateGroup;
    if (period === 'daily') {
      dateFormat = '%Y-%m-%d';
      dateGroup = 'DATE(created_date)';
    } else if (period === 'monthly') {
      dateFormat = '%Y-%m';
      dateGroup = 'DATE_FORMAT(created_date, "%Y-%m")';
    } else {
      dateFormat = '%Y-%u';
      dateGroup = 'YEARWEEK(created_date)';
    }

    const params = [];
    let query = `
      SELECT 
        DATE_FORMAT(created_date, '${dateFormat}') as period,
        COUNT(*) as count,
        AVG(actual_cost) as avg_cost
      FROM service_orders
      WHERE created_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
    `;

    if (region) {
      query += ' AND region = ?';
      params.push(region);
    }

    query += ` GROUP BY ${dateGroup} ORDER BY period`;

    const [trends] = await db.query(query, params);

    res.json({ success: true, data: trends });
  } catch (error) {
    console.error('Trends analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Root cause analysis
router.get('/root-cause', auth, authorize('manager', 'admin'), async (req, res) => {
  try {
    const [rootCauses] = await db.query(`
      SELECT 
        e.exception_type,
        e.severity,
        COUNT(*) as occurrence_count,
        AVG(TIMESTAMPDIFF(HOUR, e.detected_date, e.resolved_date)) as avg_resolution_hours,
        so.service_type,
        so.region
      FROM exceptions e
      LEFT JOIN service_orders so ON e.service_order_id = so.id
      WHERE e.detected_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY e.exception_type, e.severity, so.service_type, so.region
      ORDER BY occurrence_count DESC
      LIMIT 20
    `);

    res.json({ success: true, data: rootCauses });
  } catch (error) {
    console.error('Root cause analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Technician performance
router.get('/technician-performance', auth, authorize('supervisor', 'manager', 'admin'), async (req, res) => {
  try {
    const [performance] = await db.query(`
      SELECT 
        u.id, u.first_name, u.last_name, u.region,
        COUNT(so.id) as total_orders,
        COUNT(CASE WHEN so.status = 'completed' THEN 1 END) as completed_orders,
        AVG(TIMESTAMPDIFF(DAY, so.created_date, so.completed_date)) as avg_completion_days,
        COUNT(CASE WHEN so.completed_date <= so.due_date THEN 1 END) as on_time_orders
      FROM users u
      LEFT JOIN service_orders so ON u.id = so.assigned_technician_id
      WHERE u.role = 'technician' AND u.is_active = true
        AND so.created_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY u.id, u.first_name, u.last_name, u.region
      ORDER BY completed_orders DESC
    `);

    res.json({ success: true, data: performance });
  } catch (error) {
    console.error('Technician performance error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// SLA compliance
router.get('/sla-compliance', auth, authorize('manager', 'admin'), async (req, res) => {
  try {
    const [slaCompliance] = await db.query(`
      SELECT 
        service_type,
        region,
        COUNT(*) as total_orders,
        COUNT(CASE WHEN completed_date <= due_date THEN 1 END) as on_time_orders,
        ROUND((COUNT(CASE WHEN completed_date <= due_date THEN 1 END) / COUNT(*)) * 100, 2) as compliance_rate
      FROM service_orders
      WHERE status = 'completed' 
        AND created_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY service_type, region
      ORDER BY compliance_rate DESC
    `);

    res.json({ success: true, data: slaCompliance });
  } catch (error) {
    console.error('SLA compliance error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Export report
router.get('/export/:reportType', auth, authorize('supervisor', 'manager', 'admin'), async (req, res) => {
  try {
    const { reportType } = req.params;
    const { from_date, to_date, region } = req.query;

    // Generate CSV data based on report type
    let data, columns;

    switch (reportType) {
      case 'service-orders':
        [data] = await db.query(`
          SELECT so.*, u.first_name, u.last_name 
          FROM service_orders so
          LEFT JOIN users u ON so.assigned_technician_id = u.id
          WHERE so.created_date BETWEEN ? AND ?
        `, [from_date || '2000-01-01', to_date || '2099-12-31']);
        break;
      
      case 'exceptions':
        [data] = await db.query(`
          SELECT e.*, so.order_number
          FROM exceptions e
          LEFT JOIN service_orders so ON e.service_order_id = so.id
          WHERE e.detected_date BETWEEN ? AND ?
        `, [from_date || '2000-01-01', to_date || '2099-12-31']);
        break;
      
      default:
        return res.status(400).json({ success: false, message: 'Invalid report type' });
    }

    res.json({ success: true, data, reportType });
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
