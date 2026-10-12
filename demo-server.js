// Demo server - Works without MySQL database
// Quick way to see the application output

const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Mock data
const mockOrders = [
  { id: 1, order_number: 'SO-2026-001', customer_name: 'University Campus A', region: 'Region 1', transaction_type: 'IN01', status: 'in_progress', priority: 'high', first_name: 'John', last_name: 'Smith', due_date: '2026-09-15', exception_count: 2 },
  { id: 2, order_number: 'SO-2026-002', customer_name: 'University Campus B', region: 'Region 2', transaction_type: 'IN02', status: 'open', priority: 'medium', first_name: 'Jane', last_name: 'Doe', due_date: '2026-09-20', exception_count: 0 },
  { id: 3, order_number: 'SO-2026-003', customer_name: 'University Campus C', region: 'Region 3', transaction_type: 'IN01', status: 'exception', priority: 'critical', first_name: 'Mike', last_name: 'Johnson', due_date: '2026-09-10', exception_count: 5 },
  { id: 4, order_number: 'SO-2026-004', customer_name: 'Main Campus', region: 'Region 1', transaction_type: 'IN02', status: 'completed', priority: 'low', first_name: 'Sarah', last_name: 'Wilson', due_date: '2026-09-05', exception_count: 0 }
];

const mockExceptions = [
  { id: 1, service_order_id: 1, order_number: 'SO-2026-001', title: 'Missing Master Data', exception_type: 'missing_data', severity: 'critical', description: 'Customer material number not found in SAP', detected_date: new Date(), status: 'open' },
  { id: 2, service_order_id: 3, order_number: 'SO-2026-003', title: 'Approval Delay', exception_type: 'approval_delay', severity: 'high', description: 'Approval pending for 72 hours', detected_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), status: 'assigned' },
  { id: 3, service_order_id: 1, order_number: 'SO-2026-001', title: 'Document Missing', exception_type: 'document_issue', severity: 'medium', description: 'Purchase order document not attached', detected_date: new Date(), status: 'open' },
  { id: 4, service_order_id: 3, order_number: 'SO-2026-003', title: 'Cost Overrun', exception_type: 'cost_overrun', severity: 'high', description: 'Estimated cost exceeds budget by 25%', detected_date: new Date(), status: 'in_progress' }
];

const mockUser = {
  id: 1,
  username: 'demo',
  first_name: 'Demo',
  last_name: 'User',
  email: 'demo@greenford-utilities.com',
  role: 'admin'
};

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    token: 'demo-token-12345',
    user: mockUser
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({
    success: true,
    user: mockUser
  });
});

// Service orders endpoint
app.get('/api/service-orders', (req, res) => {
  res.json({
    success: true,
    data: mockOrders,
    pagination: { page: 1, limit: 50, total: 4, pages: 1 }
  });
});

// Exceptions endpoint
app.get('/api/exceptions', (req, res) => {
  res.json({
    success: true,
    data: mockExceptions
  });
});

// Analytics dashboard
app.get('/api/analytics/dashboard', (req, res) => {
  res.json({
    success: true,
    data: {
      ordersByStatus: [
        { status: 'open', count: 1 },
        { status: 'in_progress', count: 1 },
        { status: 'completed', count: 1 },
        { status: 'exception', count: 1 }
      ],
      exceptionsBySeverity: [
        { severity: 'critical', count: 1 },
        { severity: 'high', count: 2 },
        { severity: 'medium', count: 1 }
      ],
      agingExceptions: [
        { age_group: '0-7 days', count: 2 },
        { age_group: '8-14 days', count: 1 },
        { age_group: '30+ days', count: 1 }
      ],
      productivity: {
        avg_resolution_hours: 18.5,
        resolved_within_24h: 45,
        total_resolved: 78
      },
      revenueAtRisk: {
        total_at_risk: 67500,
        exception_orders: 1
      },
      ordersByRegion: [
        { region: 'Region 1', count: 2, avg_cost: 15000 },
        { region: 'Region 2', count: 1, avg_cost: 12000 },
        { region: 'Region 3', count: 1, avg_cost: 18000 }
      ],
      approvalCycleTime: [
        { approval_type: 'cost', avg_hours: 12 },
        { approval_type: 'exception', avg_hours: 8 }
      ]
    }
  });
});

// Approvals endpoint
app.get('/api/approvals', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        service_order_id: 3,
        order_number: 'SO-2026-003',
        approval_type: 'cost',
        status: 'pending',
        amount: 25000,
        requester_first: 'Mike',
        requester_last: 'Johnson',
        request_date: new Date()
      }
    ]
  });
});

// Notifications endpoint
app.get('/api/notifications', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        type: 'exception',
        title: 'New Exception',
        message: 'Critical exception detected on SO-2026-001',
        is_read: false,
        created_at: new Date()
      },
      {
        id: 2,
        type: 'approval',
        title: 'Approval Request',
        message: 'Cost approval needed for SO-2026-003',
        is_read: false,
        created_at: new Date()
      }
    ],
    unreadCount: 2
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 DEMO SERVER RUNNING - No Database Required!');
  console.log('='.repeat(60));
  console.log('\n📍 Open your browser:');
  console.log(`   http://localhost:${PORT}`);
  console.log('\n🔑 Login Credentials:');
  console.log('   Username: Any username (e.g., "demo")');
  console.log('   Password: Any password (e.g., "demo")');
  console.log('\n📊 Features Available:');
  console.log('   ✅ Dashboard with KPIs');
  console.log('   ✅ Service Orders List');
  console.log('   ✅ Exception Management');
  console.log('   ✅ Approvals View');
  console.log('   ✅ Analytics Dashboard');
  console.log('\n⚠️  Note: This is demo mode with mock data');
  console.log('   For full functionality, use MySQL version (see START_HERE.md)');
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Auto-open browser
  const open = require('child_process').exec;
  setTimeout(() => {
    open(`start http://localhost:${PORT}`);
  }, 1000);
});
