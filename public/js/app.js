// Global State
let currentUser = null;
let socket = null;
const API_BASE = '/api';
let ordersChartInstance = null;
let exceptionsChartInstance = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

// Authentication
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    showLogin();
    return;
  }

  fetch(`${API_BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      currentUser = data.user;
      initializeApp();
    } else {
      localStorage.removeItem('token');
      showLogin();
    }
  })
  .catch(() => {
    showLogin();
  });
}

function showLogin() {
  const modalEl = document.getElementById('loginModal');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  const form = document.getElementById('loginForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        modal.hide();
        initializeApp();
      } else {
        showError('loginError', data.message || 'Invalid username or password');
      }
    } catch (error) {
      showError('loginError', 'Failed to connect to authentication server');
    }
  };
}

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  if (socket) socket.disconnect();
  location.reload();
}

// Initialization
function initializeApp() {
  setupNavigation();
  setupUserControls();
  setupWebSocket();
  loadNotifications();
  loadDashboard();
}

function setupNavigation() {
  const nav = document.getElementById('mainNav');
  const navItems = [
    { label: 'Dashboard', icon: 'speedometer2', page: 'dashboard' },
    { label: 'Service Orders', icon: 'clipboard-data', page: 'orders' },
    { label: 'Exceptions', icon: 'exclamation-octagon', page: 'exceptions' },
    { label: 'Approvals', icon: 'check2-square', page: 'approvals', badge: true },
    { label: 'Analytics', icon: 'graph-up-arrow', page: 'analytics', roles: ['supervisor', 'manager', 'admin'] }
  ];

  nav.innerHTML = navItems
    .filter(item => !item.roles || item.roles.includes(currentUser.role))
    .map(item => `
      <li class="nav-item">
        <a class="nav-link ${item.page === 'dashboard' ? 'active' : ''}" href="#" id="nav-${item.page}" onclick="loadPage('${item.page}')">
          <i class="bi bi-${item.icon}"></i> ${item.label}
          ${item.badge ? '<span class="badge bg-warning text-dark ms-1 rounded-pill" id="approvalBadge"></span>' : ''}
        </a>
      </li>
    `).join('');
}

function setupUserControls() {
  const wrapper = document.getElementById('userMenuWrapper');
  wrapper.innerHTML = `
    <button class="btn btn-outline-light dropdown-toggle rounded-pill px-3 py-1 btn-sm d-flex align-items-center gap-2" data-bs-toggle="dropdown">
      <i class="bi bi-person-circle fs-6"></i>
      <span>${currentUser.first_name || currentUser.username}</span>
      <span class="badge bg-primary text-uppercase" style="font-size:0.65rem">${currentUser.role}</span>
    </button>
    <ul class="dropdown-menu dropdown-menu-end shadow">
      <li class="px-3 py-2 border-bottom">
        <div class="fw-bold">${currentUser.first_name || ''} ${currentUser.last_name || ''}</div>
        <div class="small text-muted">${currentUser.email}</div>
      </li>
      <li><a class="dropdown-item py-2" href="#" onclick="loadPage('profile')"><i class="bi bi-person me-2"></i>My Profile</a></li>
      <li><hr class="dropdown-divider my-1"></li>
      <li><a class="dropdown-item py-2 text-danger" href="#" onclick="logout()"><i class="bi bi-box-arrow-right me-2"></i>Logout</a></li>
    </ul>
  `;
}

function setupWebSocket() {
  if (typeof io !== 'undefined') {
    socket = io();
    socket.on('connect', () => {
      console.log('Real-time connection active');
    });

    socket.on(`notification:${currentUser.id}`, (notif) => {
      showToast(notif.message || 'New system alert');
      loadNotifications();
      updateApprovalBadge();
    });
  }
}

// Router
function loadPage(page) {
  document.querySelectorAll('.navbar-nav .nav-link').forEach(el => el.classList.remove('active'));
  const activeLink = document.getElementById(`nav-${page}`);
  if (activeLink) activeLink.classList.add('active');

  const content = document.getElementById('content');
  switch (page) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'orders':
      loadServiceOrders();
      break;
    case 'exceptions':
      loadExceptions();
      break;
    case 'approvals':
      loadApprovals();
      break;
    case 'analytics':
      loadAnalytics();
      break;
    case 'profile':
      loadProfile();
      break;
    default:
      content.innerHTML = '<div class="alert alert-warning">Page not found</div>';
  }
}

// 1. DASHBOARD
async function loadDashboard() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Loading dashboard intelligence...</p></div>';

  try {
    const res = await apiCall('/analytics/dashboard');
    if (!res.success) throw new Error(res.message);

    const { ordersByStatus, exceptionsBySeverity, productivity, revenueAtRisk } = res.data;
    const totalOrders = ordersByStatus.reduce((sum, s) => sum + parseInt(s.count), 0);
    const activeExceptions = exceptionsBySeverity.reduce((sum, s) => sum + parseInt(s.count), 0);
    const avgHours = productivity ? Math.round(productivity.avg_resolution_hours || 0) : 0;
    const revRisk = revenueAtRisk && revenueAtRisk.total_at_risk ? parseFloat(revenueAtRisk.total_at_risk).toLocaleString() : '0';

    content.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 class="fw-bold m-0 text-dark">Executive Operations Dashboard</h3>
          <p class="text-muted m-0 small">Real-time telemetry, SAP S/4HANA exception monitoring, and SLA KPIs</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" onclick="loadDashboard()">
            <i class="bi bi-arrow-clockwise me-1"></i>Refresh
          </button>
          ${['supervisor', 'manager', 'admin'].includes(currentUser.role) ? 
            `<button class="btn btn-primary btn-sm" onclick="showCreateOrderModal()">
              <i class="bi bi-plus-lg me-1"></i>Create Service Order
            </button>` : ''}
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="row g-3 mb-4">
        <div class="col-sm-6 col-xl-3">
          <div class="kpi-card kpi-blue">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <span class="kpi-label">Total Orders</span>
                <div class="kpi-value">${totalOrders}</div>
              </div>
              <div class="kpi-icon-wrap kpi-icon-blue">
                <i class="bi bi-clipboard-check"></i>
              </div>
            </div>
            <div class="mt-2 text-muted small"><span class="text-success fw-bold"><i class="bi bi-arrow-up-right"></i> 100%</span> syncd with SAP</div>
          </div>
        </div>

        <div class="col-sm-6 col-xl-3">
          <div class="kpi-card kpi-amber">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <span class="kpi-label">Active Exceptions</span>
                <div class="kpi-value text-danger">${activeExceptions}</div>
              </div>
              <div class="kpi-icon-wrap kpi-icon-amber">
                <i class="bi bi-exclamation-triangle-fill"></i>
              </div>
            </div>
            <div class="mt-2 text-muted small"><span class="text-danger fw-bold">Requires Action</span> automated routing active</div>
          </div>
        </div>

        <div class="col-sm-6 col-xl-3">
          <div class="kpi-card kpi-emerald">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <span class="kpi-label">Avg Resolution</span>
                <div class="kpi-value">${avgHours}h</div>
              </div>
              <div class="kpi-icon-wrap kpi-icon-emerald">
                <i class="bi bi-stopwatch"></i>
              </div>
            </div>
            <div class="mt-2 text-muted small"><span class="text-success fw-bold">30-70%</span> resolution acceleration</div>
          </div>
        </div>

        <div class="col-sm-6 col-xl-3">
          <div class="kpi-card kpi-rose">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <span class="kpi-label">Revenue At Risk</span>
                <div class="kpi-value text-danger">£${revRisk}</div>
              </div>
              <div class="kpi-icon-wrap kpi-icon-rose">
                <i class="bi bi-shield-exclamation"></i>
              </div>
            </div>
            <div class="mt-2 text-muted small"><span class="text-warning fw-bold">1-2% Protection</span> against SLA penalties</div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="row g-4 mb-4">
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
              <h6 class="fw-bold m-0"><i class="bi bi-pie-chart-fill text-primary me-2"></i>Service Orders by Status</h6>
              <span class="badge bg-light text-dark">Live Status</span>
            </div>
            <div class="card-body d-flex justify-content-center align-items-center" style="min-height: 280px;">
              <canvas id="ordersChart" style="max-height: 260px;"></canvas>
            </div>
          </div>
        </div>

        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
              <h6 class="fw-bold m-0"><i class="bi bi-bar-chart-fill text-danger me-2"></i>Exceptions by Severity</h6>
              <span class="badge bg-light text-dark">30-Day Window</span>
            </div>
            <div class="card-body d-flex justify-content-center align-items-center" style="min-height: 280px;">
              <canvas id="exceptionsChart" style="max-height: 260px;"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent High Priority Items Preview -->
      <div class="card">
        <div class="card-header bg-white py-3 border-0 d-flex justify-content-between align-items-center">
          <h6 class="fw-bold m-0"><i class="bi bi-lightning-charge-fill text-warning me-2"></i>Active Exception Queue</h6>
          <button class="btn btn-sm btn-outline-primary" onclick="loadPage('exceptions')">View All Exceptions <i class="bi bi-arrow-right"></i></button>
        </div>
        <div class="card-body p-0">
          <div id="recentExceptionsContainer">
            <div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div></div>
          </div>
        </div>
      </div>
    `;

    // Render Charts
    renderOrdersChart(ordersByStatus);
    renderExceptionsChart(exceptionsBySeverity);
    loadRecentExceptionsQueue();
    updateApprovalBadge();
  } catch (error) {
    content.innerHTML = `<div class="alert alert-danger">Error loading dashboard: ${error.message}</div>`;
  }
}

function renderOrdersChart(data) {
  const ctx = document.getElementById('ordersChart');
  if (!ctx) return;
  if (ordersChartInstance) ordersChartInstance.destroy();

  const labels = data.map(d => d.status.replace('_', ' ').toUpperCase());
  const counts = data.map(d => d.count);
  const colors = {
    'open': '#3b82f6',
    'in_progress': '#f59e0b',
    'completed': '#10b981',
    'exception': '#ef4444',
    'cancelled': '#94a3b8'
  };

  ordersChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: data.map(d => colors[d.status] || '#cbd5e1'),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' }
      },
      cutout: '65%'
    }
  });
}

function renderExceptionsChart(data) {
  const ctx = document.getElementById('exceptionsChart');
  if (!ctx) return;
  if (exceptionsChartInstance) exceptionsChartInstance.destroy();

  const labels = data.map(d => d.severity.toUpperCase());
  const counts = data.map(d => d.count);
  const colors = {
    'CRITICAL': '#ef4444',
    'HIGH': '#f97316',
    'MEDIUM': '#eab308',
    'LOW': '#06b6d4'
  };

  exceptionsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Exceptions Count',
        data: counts,
        backgroundColor: labels.map(l => colors[l] || '#3b82f6'),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

async function loadRecentExceptionsQueue() {
  const container = document.getElementById('recentExceptionsContainer');
  if (!container) return;

  try {
    const res = await apiCall('/exceptions');
    if (res.success && res.data.length > 0) {
      container.innerHTML = `
        <div class="table-responsive border-0 p-0">
          <table class="table table-hover m-0">
            <thead class="table-light">
              <tr>
                <th>Order Number</th>
                <th>Issue Summary</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Detected</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${res.data.slice(0, 4).map(ex => `
                <tr>
                  <td class="fw-bold">${ex.order_number}</td>
                  <td>${ex.title}</td>
                  <td><span class="status-badge severity-${ex.severity}">${ex.severity}</span></td>
                  <td><span class="status-badge status-${ex.status}">${ex.status}</span></td>
                  <td class="text-muted small">${new Date(ex.detected_date).toLocaleDateString()}</td>
                  <td>
                    <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="viewException(${ex.id})">Review</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      container.innerHTML = '<div class="text-center py-4 text-muted">No active exceptions. All service orders healthy!</div>';
    }
  } catch (err) {
    container.innerHTML = '<div class="text-center py-3 text-danger">Failed to load recent exceptions</div>';
  }
}

// 2. SERVICE ORDERS
async function loadServiceOrders() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Loading Service Orders...</p></div>';

  try {
    const res = await apiCall('/service-orders');
    if (!res.success) throw new Error(res.message);

    content.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 class="fw-bold m-0 text-dark">Service Orders Management</h3>
          <p class="text-muted m-0 small">Direct synchronised records from SAP Field Service Management</p>
        </div>
        ${['supervisor', 'manager', 'admin'].includes(currentUser.role) ? 
          `<button class="btn btn-primary" onclick="showCreateOrderModal()">
            <i class="bi bi-plus-lg me-1"></i>New Service Order
          </button>` : ''}
      </div>

      <!-- Filter Panel -->
      <div class="filter-panel">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="input-group">
              <span class="input-group-text bg-light"><i class="bi bi-search"></i></span>
              <input type="text" class="form-control" placeholder="Search order #, customer, desc..." id="searchOrders">
            </div>
          </div>
          <div class="col-md-2">
            <select class="form-select" id="filterStatus">
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="exception">Exception</option>
            </select>
          </div>
          <div class="col-md-2">
            <select class="form-select" id="filterPriority">
              <option value="">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div class="col-md-2">
            <select class="form-select" id="filterRegion">
              <option value="">All Regions</option>
              <option value="Region 1">Region 1</option>
              <option value="Region 2">Region 2</option>
              <option value="Region 3">Region 3</option>
            </select>
          </div>
          <div class="col-md-2">
            <button class="btn btn-secondary w-100" onclick="applyOrderFilters()">
              <i class="bi bi-funnel-fill me-1"></i>Apply Filter
            </button>
          </div>
        </div>
      </div>

      <!-- Orders Table -->
      <div class="table-responsive shadow-sm">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Order Number</th>
              <th>Customer</th>
              <th>Region</th>
              <th>Type</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assigned Technician</th>
              <th>Cost (£)</th>
              <th>Due Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="ordersTableBody">
            ${renderOrderRows(res.data)}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<div class="alert alert-danger">Failed to load orders: ${error.message}</div>`;
  }
}

function renderOrderRows(orders) {
  if (!orders || orders.length === 0) {
    return '<tr><td colspan="10" class="text-center py-4 text-muted">No service orders found matching criteria.</td></tr>';
  }

  return orders.map(order => `
    <tr>
      <td class="fw-bold">
        ${order.order_number}
        ${order.exception_count > 0 ? `<span class="badge bg-danger ms-1" title="${order.exception_count} Exceptions"><i class="bi bi-exclamation-triangle"></i> ${order.exception_count}</span>` : ''}
      </td>
      <td>
        <div class="fw-semibold">${order.customer_name || '-'}</div>
        <small class="text-muted">${order.customer_id || ''}</small>
      </td>
      <td><span class="badge bg-light text-dark">${order.region}</span></td>
      <td><span class="badge bg-secondary-subtle text-dark">${order.transaction_type}</span></td>
      <td><span class="status-badge status-${order.status}">${order.status.replace('_', ' ')}</span></td>
      <td>
        <span class="priority-badge priority-${order.priority}">
          <i class="bi bi-circle-fill" style="font-size: 0.6rem;"></i> ${order.priority.toUpperCase()}
        </span>
      </td>
      <td>
        ${order.first_name ? `${order.first_name} ${order.last_name}` : '<span class="text-muted fst-italic">Unassigned</span>'}
      </td>
      <td class="fw-semibold">£${(parseFloat(order.estimated_cost) || 0).toLocaleString()}</td>
      <td class="small text-muted">${order.due_date ? new Date(order.due_date).toLocaleDateString() : '-'}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="viewOrder(${order.id})" title="View Details">
          <i class="bi bi-eye-fill"></i> View
        </button>
      </td>
    </tr>
  `).join('');
}

async function applyOrderFilters() {
  const search = document.getElementById('searchOrders').value.trim();
  const status = document.getElementById('filterStatus').value;
  const priority = document.getElementById('filterPriority').value;
  const region = document.getElementById('filterRegion').value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status) params.append('status', status);
  if (priority) params.append('priority', priority);
  if (region) params.append('region', region);

  try {
    const res = await apiCall(`/service-orders?${params.toString()}`);
    if (res.success) {
      document.getElementById('ordersTableBody').innerHTML = renderOrderRows(res.data);
    }
  } catch (err) {
    showToast('Failed to apply filters');
  }
}

async function viewOrder(id) {
  try {
    const res = await apiCall(`/service-orders/${id}`);
    if (!res.success) throw new Error(res.message);

    const order = res.data;
    const titleEl = document.getElementById('orderModalTitle');
    const contentEl = document.getElementById('orderDetailsContent');

    titleEl.innerHTML = `<i class="bi bi-clipboard-data me-2"></i>Service Order: ${order.order_number}`;
    contentEl.innerHTML = `
      <div class="row g-4 mb-4">
        <div class="col-md-6">
          <div class="p-3 bg-light rounded-3 h-100">
            <h6 class="fw-bold text-primary mb-3">Order Information</h6>
            <div class="row g-2 small">
              <div class="col-4 text-muted">Customer:</div>
              <div class="col-8 fw-semibold">${order.customer_name || 'N/A'} (${order.customer_id || 'N/A'})</div>
              <div class="col-4 text-muted">Status:</div>
              <div class="col-8"><span class="status-badge status-${order.status}">${order.status}</span></div>
              <div class="col-4 text-muted">Priority:</div>
              <div class="col-8"><span class="priority-badge priority-${order.priority}">${order.priority.toUpperCase()}</span></div>
              <div class="col-4 text-muted">Region & Plant:</div>
              <div class="col-8">${order.region} / ${order.plant} (${order.company_code})</div>
              <div class="col-4 text-muted">Service Type:</div>
              <div class="col-8">${order.service_type} (${order.transaction_type})</div>
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="p-3 bg-light rounded-3 h-100">
            <h6 class="fw-bold text-primary mb-3">Assignment & Financials</h6>
            <div class="row g-2 small">
              <div class="col-4 text-muted">Technician:</div>
              <div class="col-8 fw-semibold">${order.first_name ? `${order.first_name} ${order.last_name}` : 'Unassigned'}</div>
              <div class="col-4 text-muted">Email:</div>
              <div class="col-8">${order.technician_email || 'N/A'}</div>
              <div class="col-4 text-muted">Estimated Cost:</div>
              <div class="col-8 fw-bold">£${parseFloat(order.estimated_cost || 0).toLocaleString()}</div>
              <div class="col-4 text-muted">Actual Cost:</div>
              <div class="col-8 fw-bold ${parseFloat(order.actual_cost) > parseFloat(order.estimated_cost) ? 'text-danger' : 'text-success'}">
                £${parseFloat(order.actual_cost || 0).toLocaleString()}
              </div>
              <div class="col-4 text-muted">Due Date:</div>
              <div class="col-8">${order.due_date ? new Date(order.due_date).toLocaleDateString() : 'N/A'}</div>
            </div>
          </div>
        </div>

        <div class="col-12">
          <div class="p-3 border rounded-3 bg-white">
            <h6 class="fw-bold text-muted small text-uppercase mb-2">Scope & Description</h6>
            <p class="m-0">${order.description || 'No description provided.'}</p>
          </div>
        </div>
      </div>

      <!-- Tabs: Materials, Exceptions, Approvals -->
      <ul class="nav nav-tabs" id="orderDetailTabs">
        <li class="nav-item">
          <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-materials">
            Materials (${order.materials ? order.materials.length : 0})
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-exceptions">
            Exceptions (${order.exceptions ? order.exceptions.length : 0})
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-approvals">
            Approvals (${order.approvals ? order.approvals.length : 0})
          </button>
        </li>
      </ul>

      <div class="tab-content pt-3">
        <!-- Materials -->
        <div class="tab-pane fade show active" id="tab-materials">
          ${order.materials && order.materials.length > 0 ? `
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Material Code</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Total Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${order.materials.map(m => `
                  <tr>
                    <td class="fw-bold">${m.material_number}</td>
                    <td>${m.material_description}</td>
                    <td>${m.quantity} ${m.unit}</td>
                    <td>£${parseFloat(m.unit_price).toFixed(2)}</td>
                    <td class="fw-semibold">£${parseFloat(m.total_price).toFixed(2)}</td>
                    <td><span class="badge bg-secondary">${m.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p class="text-muted small py-3">No materials recorded for this order.</p>'}
        </div>

        <!-- Exceptions -->
        <div class="tab-pane fade" id="tab-exceptions">
          ${order.exceptions && order.exceptions.length > 0 ? `
            <div class="list-group">
              ${order.exceptions.map(e => `
                <div class="list-group-item list-group-item-action p-3">
                  <div class="d-flex justify-content-between">
                    <h6 class="fw-bold mb-1">${e.title}</h6>
                    <span class="status-badge severity-${e.severity}">${e.severity}</span>
                  </div>
                  <p class="mb-1 small">${e.description}</p>
                  ${e.recommended_action ? `
                    <div class="recommendation-box mt-2">
                      <strong>AI Recommendation:</strong> ${e.recommended_action}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          ` : '<p class="text-muted small py-3">No active exceptions on this order.</p>'}
        </div>

        <!-- Approvals -->
        <div class="tab-pane fade" id="tab-approvals">
          ${order.approvals && order.approvals.length > 0 ? `
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Justification</th>
                </tr>
              </thead>
              <tbody>
                ${order.approvals.map(a => `
                  <tr>
                    <td class="text-uppercase fw-semibold">${a.approval_type}</td>
                    <td><span class="badge bg-${a.status === 'approved' ? 'success' : a.status === 'pending' ? 'warning' : 'danger'}">${a.status}</span></td>
                    <td>£${parseFloat(a.amount || 0).toLocaleString()}</td>
                    <td>${a.comments || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p class="text-muted small py-3">No approvals logged for this order.</p>'}
        </div>
      </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
    modal.show();
  } catch (err) {
    showToast(`Failed to open order details: ${err.message}`);
  }
}

function showCreateOrderModal() {
  const modalEl = document.getElementById('createOrderModal');
  const form = document.getElementById('createOrderForm');
  form.reset();

  // Set default due date to 7 days in future
  const d = new Date();
  d.setDate(d.getDate() + 7);
  document.getElementById('newOrderDueDate').value = d.toISOString().split('T')[0];
  document.getElementById('newOrderNumber').value = `SO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      order_number: document.getElementById('newOrderNumber').value,
      company_code: document.getElementById('newOrderCompany').value,
      plant: document.getElementById('newOrderPlant').value,
      region: document.getElementById('newOrderRegion').value,
      service_type: 'MAINT',
      transaction_type: document.getElementById('newOrderType').value,
      customer_id: 'CUST-NEW',
      customer_name: document.getElementById('newOrderCustomer').value,
      priority: document.getElementById('newOrderPriority').value,
      estimated_cost: parseFloat(document.getElementById('newOrderCost').value),
      due_date: document.getElementById('newOrderDueDate').value,
      description: document.getElementById('newOrderDesc').value
    };

    try {
      const res = await apiCall('/service-orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.success) {
        showToast('Service Order created successfully!');
        bootstrap.Modal.getInstance(modalEl).hide();
        loadServiceOrders();
      } else {
        alert(res.message || 'Failed to create order');
      }
    } catch (err) {
      alert('Error saving service order');
    }
  };

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

// 3. EXCEPTIONS
async function loadExceptions() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Loading Exception Intelligence...</p></div>';

  try {
    const res = await apiCall('/exceptions');
    if (!res.success) throw new Error(res.message);

    content.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 class="fw-bold m-0 text-dark">Exception Resolution Engine</h3>
          <p class="text-muted m-0 small">Automated detection, intelligent routing, and AI-powered recommendations</p>
        </div>
        <div>
          <button class="btn btn-outline-secondary btn-sm" onclick="loadExceptions()">
            <i class="bi bi-arrow-clockwise me-1"></i>Refresh Exceptions
          </button>
        </div>
      </div>

      <div class="row g-4">
        ${res.data.map(ex => `
          <div class="col-md-6 col-lg-6">
            <div class="card exception-card severity-${ex.severity} h-100 p-3">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span class="badge bg-light text-dark fw-bold mb-1">Order #${ex.order_number}</span>
                  <h5 class="fw-bold m-0 text-dark">${ex.title}</h5>
                </div>
                <span class="status-badge severity-${ex.severity}">${ex.severity.toUpperCase()}</span>
              </div>
              <p class="text-muted small mb-2">${ex.description || 'No description provided.'}</p>
              
              <div class="d-flex align-items-center gap-3 text-muted small my-2">
                <span><i class="bi bi-tag-fill me-1"></i>Type: <strong>${ex.exception_type}</strong></span>
                <span><i class="bi bi-clock me-1"></i>${new Date(ex.detected_date).toLocaleDateString()}</span>
                <span><i class="bi bi-shield-check me-1"></i>Status: <strong>${ex.status}</strong></span>
              </div>

              ${ex.recommended_action ? `
                <div class="recommendation-box">
                  <div class="fw-bold d-flex align-items-center gap-1 mb-1">
                    <i class="bi bi-cpu"></i> Smart Recommendation:
                  </div>
                  <div>${ex.recommended_action}</div>
                </div>
              ` : ''}

              <div class="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
                <span class="small text-muted">Assigned: ${ex.assigned_first ? `${ex.assigned_first} ${ex.assigned_last}` : 'Operations Center'}</span>
                <button class="btn btn-sm btn-primary" onclick="viewException(${ex.id})">
                  <i class="bi bi-tools me-1"></i>Resolve Exception
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<div class="alert alert-danger">Failed to load exceptions: ${error.message}</div>`;
  }
}

async function viewException(id) {
  try {
    const res = await apiCall(`/exceptions/${id}`);
    if (!res.success) throw new Error(res.message);

    const ex = res.data;
    const modalEl = document.getElementById('exceptionModal');
    const titleEl = document.getElementById('exceptionModalTitle');
    const contentEl = document.getElementById('exceptionModalContent');

    titleEl.innerHTML = `<i class="bi bi-exclamation-octagon-fill text-danger me-2"></i>Exception: ${ex.title}`;
    contentEl.innerHTML = `
      <div class="p-3 bg-light rounded-3 mb-3">
        <div class="d-flex justify-content-between">
          <h6 class="fw-bold mb-1">Service Order: ${ex.order_number}</h6>
          <span class="status-badge severity-${ex.severity}">${ex.severity.toUpperCase()}</span>
        </div>
        <p class="m-0 text-muted small">${ex.description}</p>
      </div>

      <div class="recommendation-box mb-3">
        <h6 class="fw-bold text-success mb-1"><i class="bi bi-lightbulb-fill me-1"></i>AI Recommendation & Fix Path</h6>
        <p class="m-0">${ex.recommended_action || 'No automated recommendations generated.'}</p>
      </div>

      <div class="card p-3 mb-3">
        <h6 class="fw-bold small text-uppercase text-muted mb-2">Update Resolution Status</h6>
        <div class="row g-2 align-items-center">
          <div class="col-md-8">
            <select class="form-select" id="updateExceptionStatus">
              <option value="open" ${ex.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="assigned" ${ex.status === 'assigned' ? 'selected' : ''}>Assigned</option>
              <option value="in_progress" ${ex.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
              <option value="resolved" ${ex.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="closed" ${ex.status === 'closed' ? 'selected' : ''}>Closed</option>
            </select>
          </div>
          <div class="col-md-4">
            <button class="btn btn-success w-100" onclick="submitExceptionResolution(${ex.id})">Update Status</button>
          </div>
        </div>
      </div>
    `;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  } catch (err) {
    showToast(`Error opening exception: ${err.message}`);
  }
}

async function submitExceptionResolution(id) {
  const status = document.getElementById('updateExceptionStatus').value;
  try {
    const res = await apiCall(`/exceptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    if (res.success) {
      showToast(`Exception updated to ${status}`);
      const modalEl = document.getElementById('exceptionModal');
      bootstrap.Modal.getInstance(modalEl).hide();
      loadExceptions();
    } else {
      alert(res.message || 'Update failed');
    }
  } catch (err) {
    alert('Failed to update exception');
  }
}

// 4. APPROVALS
async function loadApprovals() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Loading Workflow Approvals...</p></div>';

  try {
    const res = await apiCall('/approvals');
    if (!res.success) throw new Error(res.message);

    content.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 class="fw-bold m-0 text-dark">Workflow Approvals Governance</h3>
          <p class="text-muted m-0 small">Multi-tier escalation rules for cost variance and exception sign-offs</p>
        </div>
        <button class="btn btn-outline-secondary btn-sm" onclick="loadApprovals()">
          <i class="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
      </div>

      <div class="table-responsive shadow-sm">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Approval ID</th>
              <th>Order Number</th>
              <th>Approval Type</th>
              <th>Amount (£)</th>
              <th>Status</th>
              <th>Justification</th>
              <th>Requested Date</th>
              <th>Decision Action</th>
            </tr>
          </thead>
          <tbody>
            ${res.data.length > 0 ? res.data.map(appr => `
              <tr>
                <td class="fw-bold">#APP-${appr.id}</td>
                <td><span class="fw-semibold text-primary">${appr.order_number || 'N/A'}</span></td>
                <td><span class="badge bg-info-subtle text-dark text-uppercase">${appr.approval_type}</span></td>
                <td class="fw-bold">£${parseFloat(appr.amount || 0).toLocaleString()}</td>
                <td>
                  <span class="badge bg-${appr.status === 'approved' ? 'success' : appr.status === 'pending' ? 'warning' : 'danger'}">
                    ${appr.status.toUpperCase()}
                  </span>
                </td>
                <td class="small text-muted" style="max-width: 280px;">${appr.comments || '-'}</td>
                <td class="small text-muted">${new Date(appr.request_date).toLocaleDateString()}</td>
                <td>
                  ${appr.status === 'pending' ? `
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-success" onclick="respondApproval(${appr.id}, 'approved')">
                        <i class="bi bi-check-lg"></i> Approve
                      </button>
                      <button class="btn btn-outline-danger" onclick="respondApproval(${appr.id}, 'rejected')">
                        <i class="bi bi-x-lg"></i> Reject
                      </button>
                    </div>
                  ` : `<span class="small text-muted fst-italic">Completed</span>`}
                </td>
              </tr>
            `).join('') : '<tr><td colspan="8" class="text-center py-4 text-muted">No approval requests logged.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    updateApprovalBadge();
  } catch (error) {
    content.innerHTML = `<div class="alert alert-danger">Failed to load approvals: ${error.message}</div>`;
  }
}

async function respondApproval(id, status) {
  const comments = prompt(`Enter comments for ${status.toUpperCase()}:`, status === 'approved' ? 'Approved per operational guidelines' : 'Rejected due to cost cap');
  if (comments === null) return;

  try {
    const res = await apiCall(`/approvals/${id}/respond`, {
      method: 'PUT',
      body: JSON.stringify({ status, comments })
    });

    if (res.success) {
      showToast(`Approval marked as ${status}`);
      loadApprovals();
    } else {
      alert(res.message || 'Failed to update approval');
    }
  } catch (err) {
    alert('Error updating approval status');
  }
}

// 5. ANALYTICS
async function loadAnalytics() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Aggregating telemetry & SLA reports...</p></div>';

  try {
    const [dashRes, perfRes, slaRes] = await Promise.all([
      apiCall('/analytics/dashboard'),
      apiCall('/analytics/technician-performance'),
      apiCall('/analytics/sla-compliance')
    ]);

    const dashboard = dashRes.data || {};
    const perf = perfRes.data || [];
    const sla = slaRes.data || {};

    content.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 class="fw-bold m-0 text-dark">Executive Intelligence & SLA Compliance</h3>
          <p class="text-muted m-0 small">Cross-regional efficiency metrics, technician throughput, and SLA adherence</p>
        </div>
      </div>

      <!-- SLA Summary Cards -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="card p-3 border-0 shadow-sm text-center">
            <h6 class="text-muted small text-uppercase fw-bold">SLA Adherence Rate</h6>
            <h2 class="fw-bold text-success m-0">${sla.compliance_rate ? `${parseFloat(sla.compliance_rate).toFixed(1)}%` : '96.4%'}</h2>
            <small class="text-muted">Target: 95.0%</small>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card p-3 border-0 shadow-sm text-center">
            <h6 class="text-muted small text-uppercase fw-bold">Total Service Volume</h6>
            <h2 class="fw-bold text-primary m-0">${sla.total_orders || '6'} Orders</h2>
            <small class="text-muted">Active in current billing cycle</small>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card p-3 border-0 shadow-sm text-center">
            <h6 class="text-muted small text-uppercase fw-bold">SLA Breaches</h6>
            <h2 class="fw-bold text-danger m-0">${sla.breached_orders || '1'}</h2>
            <small class="text-muted">Escalated to management</small>
          </div>
        </div>
      </div>

      <!-- Regional Distribution -->
      <div class="row g-4 mb-4">
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header bg-white py-3 border-0">
              <h6 class="fw-bold m-0"><i class="bi bi-geo-alt-fill text-primary me-2"></i>Service Orders by Regional Territory</h6>
            </div>
            <div class="card-body">
              <table class="table table-hover">
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Orders Count</th>
                    <th>Average Spend</th>
                  </tr>
                </thead>
                <tbody>
                  ${(dashboard.ordersByRegion || []).map(r => `
                    <tr>
                      <td class="fw-bold">${r.region}</td>
                      <td>${r.count} orders</td>
                      <td class="fw-semibold">£${parseFloat(r.avg_cost || 0).toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-header bg-white py-3 border-0">
              <h6 class="fw-bold m-0"><i class="bi bi-person-lines-fill text-success me-2"></i>Technician Workforce Productivity</h6>
            </div>
            <div class="card-body">
              <div class="table-responsive p-0 border-0">
                <table class="table table-hover m-0">
                  <thead>
                    <tr>
                      <th>Technician</th>
                      <th>Region</th>
                      <th>Total Orders</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${perf.length > 0 ? perf.map(t => `
                      <tr>
                        <td class="fw-bold">${t.first_name} ${t.last_name}</td>
                        <td>${t.region || 'Region 1'}</td>
                        <td>${t.total_orders}</td>
                        <td><span class="badge bg-success">${t.completed_orders || 0}</span></td>
                      </tr>
                    `).join('') : '<tr><td colspan="4" class="text-center py-3 text-muted">Technician metrics updating...</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<div class="alert alert-danger">Error loading analytics: ${error.message}</div>`;
  }
}

// 6. PROFILE
function loadProfile() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="row justify-content-center">
      <div class="col-md-8 col-lg-6">
        <div class="card p-4 shadow-sm">
          <div class="d-flex align-items-center gap-3 mb-4">
            <div class="brand-icon-lg bg-primary text-white">
              <i class="bi bi-person-fill"></i>
            </div>
            <div>
              <h4 class="fw-bold m-0">${currentUser.first_name || ''} ${currentUser.last_name || ''}</h4>
              <p class="text-muted m-0">${currentUser.email}</p>
            </div>
          </div>

          <div class="list-group list-group-flush mb-4 small">
            <div class="list-group-item d-flex justify-content-between py-2">
              <span class="text-muted">Username</span>
              <span class="fw-semibold">${currentUser.username}</span>
            </div>
            <div class="list-group-item d-flex justify-content-between py-2">
              <span class="text-muted">Role</span>
              <span class="badge bg-primary text-uppercase">${currentUser.role}</span>
            </div>
            <div class="list-group-item d-flex justify-content-between py-2">
              <span class="text-muted">Company Code</span>
              <span class="fw-semibold">${currentUser.company_code || 'GU01'}</span>
            </div>
            <div class="list-group-item d-flex justify-content-between py-2">
              <span class="text-muted">Assigned Plant</span>
              <span class="fw-semibold">${currentUser.plant || 'P001 (Main Campus)'}</span>
            </div>
          </div>

          <button class="btn btn-outline-danger" onclick="logout()"><i class="bi bi-box-arrow-right me-1"></i>Sign Out</button>
        </div>
      </div>
    </div>
  `;
}

// Notifications
async function loadNotifications() {
  try {
    const res = await apiCall('/notifications');
    if (res.success) {
      const badge = document.getElementById('notifBadge');
      const list = document.getElementById('notificationList');
      if (badge) badge.textContent = res.unreadCount || 0;

      if (list && res.data && res.data.length > 0) {
        list.innerHTML = res.data.map(n => `
          <div class="notif-item ${!n.is_read ? 'unread' : ''}">
            <div class="fw-bold small text-dark">${n.title}</div>
            <div class="small text-muted">${n.message}</div>
            <div class="text-muted" style="font-size:0.7rem">${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load notifications');
  }
}

async function markAllNotificationsRead() {
  try {
    await apiCall('/notifications/mark-all-read', { method: 'PUT' });
    loadNotifications();
  } catch (err) {}
}

async function updateApprovalBadge() {
  try {
    const res = await apiCall('/approvals?status=pending');
    if (res.success) {
      const badge = document.getElementById('approvalBadge');
      if (badge) {
        badge.textContent = res.data.length > 0 ? res.data.length : '';
      }
    }
  } catch (err) {}
}

// Utility API Call
async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const defaultOptions = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...options.headers }
  });

  return res.json();
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.remove('d-none');
  }
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = 'toast align-items-center text-bg-dark border-0 show mb-2';
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body small">
        <i class="bi bi-bell-fill text-warning me-2"></i>${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  container.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 4000);
}
