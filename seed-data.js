const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seed() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'sap_fsm'
  });

  console.log('Connected to MySQL. Seeding data...');

  // 1. Password hash for admin123
  const passwordHash = await bcrypt.hash('admin123', 10);

  // 2. Ensure admin and demo users exist
  await connection.query(`
    INSERT INTO users (id, username, email, password, first_name, last_name, role, company_code, plant, region, is_active)
    VALUES 
      (1, 'admin', 'admin@greenford-utilities.com', ?, 'System', 'Administrator', 'admin', 'GU01', 'P001', 'Region 1', 1),
      (2, 'tech_john', 'john.smith@greenford-utilities.com', ?, 'John', 'Smith', 'technician', 'GU01', 'P001', 'Region 1', 1),
      (3, 'tech_jane', 'jane.doe@greenford-utilities.com', ?, 'Jane', 'Doe', 'technician', 'GU02', 'P002', 'Region 2', 1),
      (4, 'tech_mike', 'mike.j@greenford-utilities.com', ?, 'Mike', 'Johnson', 'technician', 'GU03', 'P003', 'Region 3', 1),
      (5, 'mgr_sarah', 'sarah.w@greenford-utilities.com', ?, 'Sarah', 'Wilson', 'manager', 'GU01', 'P001', 'Region 1', 1)
    ON DUPLICATE KEY UPDATE 
      password = VALUES(password),
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      role = VALUES(role),
      is_active = 1
  `, [passwordHash, passwordHash, passwordHash, passwordHash, passwordHash]);

  console.log('Users updated/created.');

  // 3. Clear and insert Service Orders
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('TRUNCATE TABLE material_items');
  await connection.query('TRUNCATE TABLE exceptions');
  await connection.query('TRUNCATE TABLE approvals');
  await connection.query('TRUNCATE TABLE notifications');
  await connection.query('TRUNCATE TABLE service_orders');
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  await connection.query(`
    INSERT INTO service_orders 
      (id, order_number, company_code, plant, region, service_type, transaction_type, status, priority, customer_id, customer_name, partner_id, partner_name, assigned_technician_id, description, estimated_cost, actual_cost, created_date, due_date, sap_synced)
    VALUES
      (1, 'SO-2026-001', 'GU01', 'P001', 'Region 1', 'MAINT', 'IN01', 'in_progress', 'high', 'CUST-101', 'North West Water Authority', 'PART-501', 'Siemens Energy Services', 2, 'High-voltage pump preventive maintenance and thermal scan', 12500.00, 11800.00, DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_ADD(NOW(), INTERVAL 3 DAY), 1),
      (2, 'SO-2026-002', 'GU02', 'P002', 'Region 2', 'INSPECT', 'IN02', 'open', 'medium', 'CUST-102', 'Metro Distribution Grid', 'PART-502', 'ABB Power Grids', 3, 'Quarterly switchgear telemetry inspection and battery replacement', 8200.00, 0.00, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 5 DAY), 1),
      (3, 'SO-2026-003', 'GU03', 'P003', 'Region 3', 'REPAIR', 'IN01', 'exception', 'critical', 'CUST-103', 'City Water Treatment Facility', 'PART-503', 'Schneider Electric', 4, 'Emergency valve actuator failure causing pressure drop in Sector 4', 45000.00, 52400.00, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 0),
      (4, 'SO-2026-004', 'GU01', 'P001', 'Region 1', 'INSTALL', 'IN02', 'completed', 'low', 'CUST-104', 'County Hospital Utility Plant', 'PART-504', 'Honeywell Industrial', 5, 'Installation of secondary flow monitoring transducers', 3400.00, 3250.00, DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY), 1),
      (5, 'SO-2026-005', 'GU02', 'P002', 'Region 2', 'REPAIR', 'IN01', 'exception', 'high', 'CUST-105', 'Apex Logistics Central Hub', 'PART-505', 'Danfoss Drives', 2, 'Variable speed compressor overheating fault with line vibration', 22500.00, 27800.00, DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY), 0),
      (6, 'SO-2026-006', 'GU03', 'P003', 'Region 3', 'MAINT', 'IN02', 'in_progress', 'medium', 'CUST-106', 'Riverside Estates Power Substation', 'PART-506', 'Schneider Electric', 3, 'Routine dielectric oil test and transformer bushing cleaning', 14800.00, 13900.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 6 DAY), 1)
  `);

  console.log('Service orders seeded.');

  // 4. Insert Material Items
  await connection.query(`
    INSERT INTO material_items (service_order_id, material_number, material_description, quantity, unit, unit_price, total_price, status)
    VALUES
      (1, 'MAT-PUMP-401', 'Hydraulic Impeller Seal Kit 400mm', 2.00, 'EA', 1250.00, 2500.00, 'approved'),
      (1, 'MAT-OIL-ISO68', 'Synthetic Turbine Lubricant 50L', 4.00, 'DRUM', 650.00, 2600.00, 'delivered'),
      (3, 'MAT-ACT-9901', 'Smart Actuator Modbus RTU 24VDC', 1.00, 'EA', 18500.00, 18500.00, 'pending'),
      (3, 'MAT-VALVE-DN150', 'Flanged Gate Valve High-Pressure DN150', 1.00, 'EA', 12200.00, 12200.00, 'pending'),
      (5, 'MAT-INV-55KW', 'Inverter Frequency Drive Module 55kW', 1.00, 'EA', 14500.00, 14500.00, 'pending'),
      (4, 'MAT-TRAN-FL02', 'Ultrasonic Flow Sensor 4-20mA', 2.00, 'EA', 850.00, 1700.00, 'delivered')
  `);

  console.log('Material items seeded.');

  // 5. Insert Exceptions
  await connection.query(`
    INSERT INTO exceptions (id, service_order_id, exception_type, severity, title, description, status, assigned_to, detected_date, recommended_action)
    VALUES
      (1, 3, 'missing_data', 'critical', 'Missing SAP S/4HANA Master Material Code', 'Material code MAT-ACT-9901 not synchronized with SAP Central Master Data. Order processing blocked.', 'open', 5, DATE_SUB(NOW(), INTERVAL 5 DAY), 'Trigger SAP BAPI_MATERIAL_GETALL sync or configure temporary alias code MAT-ACT-9900.'),
      (2, 5, 'cost_overrun', 'high', 'Cost Overrun Warning: Exceeds Budget by 28%', 'Replacement inverter module and urgent expedited freight pushed order cost from £22,500 to £27,800 (+23.5%).', 'assigned', 5, DATE_SUB(NOW(), INTERVAL 4 DAY), 'Submit Stage 2 Cost Variance Approval to Regional Operations Manager.'),
      (3, 1, 'approval_delay', 'medium', 'Permit-to-Work Clearance Delay (>72h)', 'Hot work permit awaiting secondary safety officer sign-off at North West Water Authority site.', 'in_progress', 2, DATE_SUB(NOW(), INTERVAL 3 DAY), 'Notify Field Supervisor for automatic compliance fast-track signoff.'),
      (4, 3, 'document_issue', 'high', 'Missing Contractor Safety Compliance Document', 'Subcontractor Schneider Electric has not uploaded certified ISO-45001 safety check report for valve overhaul.', 'open', 4, DATE_SUB(NOW(), INTERVAL 2 DAY), 'Block technician dispatch until document uploaded via mobile technician portal.')
  `);

  console.log('Exceptions seeded.');

  // 6. Insert Approvals
  await connection.query(`
    INSERT INTO approvals (id, service_order_id, approval_type, status, requested_by, approver_id, amount, comments, request_date)
    VALUES
      (1, 5, 'cost', 'pending', 2, 5, 27800.00, 'Emergency compressor drive replacement with express freight due to impending production halt at Apex Logistics.', DATE_SUB(NOW(), INTERVAL 2 DAY)),
      (2, 3, 'exception', 'pending', 4, 1, 45000.00, 'Critical high-pressure valve emergency bypass approval pending SAP master data release.', DATE_SUB(NOW(), INTERVAL 1 DAY)),
      (3, 4, 'completion', 'approved', 5, 1, 3400.00, 'Flow transducer replacement validated and calibrated against laboratory standards.', DATE_SUB(NOW(), INTERVAL 6 DAY))
  `);

  console.log('Approvals seeded.');

  // 7. Insert Notifications
  await connection.query(`
    INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
    VALUES
      (1, 'exception', 'Critical Exception Detected', 'Critical exception detected on SO-2026-003: Missing Master Data', '/orders/3', 0, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
      (1, 'approval', 'Pending Approval Request', 'Cost approval request for £27,800.00 submitted for SO-2026-005', '/approvals/1', 0, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
      (1, 'sla_breach', 'SLA Target Warning', 'Order SO-2026-003 is overdue by 24 hours. Immediate supervisor action needed.', '/orders/3', 0, DATE_SUB(NOW(), INTERVAL 1 HOUR))
  `);

  console.log('Notifications seeded.');
  await connection.end();
  console.log('Database seeding completed successfully!');
}

seed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
