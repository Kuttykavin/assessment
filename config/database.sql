-- SAP FSM Database Schema
CREATE DATABASE IF NOT EXISTS sap_fsm;
USE sap_fsm;

-- Users Table
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role ENUM('technician', 'supervisor', 'manager', 'admin') DEFAULT 'technician',
  company_code VARCHAR(10),
  plant VARCHAR(10),
  region VARCHAR(50),
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  last_login DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Service Orders Table
CREATE TABLE service_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  company_code VARCHAR(10) NOT NULL,
  plant VARCHAR(10) NOT NULL,
  region VARCHAR(50) NOT NULL,
  service_type VARCHAR(50) NOT NULL,
  transaction_type ENUM('IN01', 'IN02') NOT NULL,
  status ENUM('open', 'in_progress', 'completed', 'exception', 'cancelled') DEFAULT 'open',
  priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  customer_id VARCHAR(50),
  customer_name VARCHAR(255),
  partner_id VARCHAR(50),
  partner_name VARCHAR(255),
  assigned_technician_id INT,
  description TEXT,
  notes TEXT,
  estimated_cost DECIMAL(15, 2),
  actual_cost DECIMAL(15, 2),
  created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  due_date DATETIME,
  completed_date DATETIME,
  sap_synced BOOLEAN DEFAULT false,
  sap_sync_date DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_technician_id) REFERENCES users(id),
  INDEX idx_order_number (order_number),
  INDEX idx_status (status),
  INDEX idx_company (company_code),
  INDEX idx_region (region),
  INDEX idx_assigned (assigned_technician_id)
);

-- Material Items Table
CREATE TABLE material_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_order_id INT NOT NULL,
  material_number VARCHAR(50) NOT NULL,
  material_description VARCHAR(255),
  quantity DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(10),
  unit_price DECIMAL(15, 2),
  total_price DECIMAL(15, 2),
  status ENUM('pending', 'approved', 'delivered', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE
);

-- Exceptions Table
CREATE TABLE exceptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_order_id INT NOT NULL,
  exception_type ENUM('missing_data', 'validation_error', 'approval_delay', 'aging', 'compliance', 'document_issue', 'cost_overrun') NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('open', 'assigned', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
  assigned_to INT,
  detected_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  assigned_date DATETIME,
  resolved_date DATETIME,
  resolution_notes TEXT,
  recommended_action TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  INDEX idx_status (status),
  INDEX idx_severity (severity),
  INDEX idx_type (exception_type)
);

-- Approvals Table
CREATE TABLE approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_order_id INT NOT NULL,
  approval_type ENUM('cost', 'exception', 'change', 'completion') NOT NULL,
  requested_by INT NOT NULL,
  approver_id INT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
  request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  response_date DATETIME,
  comments TEXT,
  rejection_reason TEXT,
  amount DECIMAL(15, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (approver_id) REFERENCES users(id),
  INDEX idx_status (status),
  INDEX idx_approver (approver_id)
);

-- Documents Table
CREATE TABLE documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_order_id INT NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  document_type VARCHAR(50),
  file_path VARCHAR(500) NOT NULL,
  file_size INT,
  mime_type VARCHAR(100),
  uploaded_by INT NOT NULL,
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Notifications Table
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('assignment', 'approval', 'exception', 'status_change', 'sla_breach', 'escalation') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read)
);

-- Audit Log Table
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT,
  old_value TEXT,
  new_value TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
);

-- Master Data: Company Codes
CREATE TABLE company_codes (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  region VARCHAR(50),
  is_active BOOLEAN DEFAULT true
);

-- Master Data: Plants
CREATE TABLE plants (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  company_code VARCHAR(10),
  region VARCHAR(50),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  FOREIGN KEY (company_code) REFERENCES company_codes(code)
);

-- Master Data: Service Types
CREATE TABLE service_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, email, password, first_name, last_name, role) VALUES
('admin', 'admin@greenford-utilities.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'System', 'Administrator', 'admin');

-- Insert sample company codes
INSERT INTO company_codes (code, name, region) VALUES
('GU01', 'Greenford Utilities Main', 'Region 1'),
('GU02', 'Greenford Utilities East', 'Region 2'),
('GU03', 'Greenford Utilities West', 'Region 3');

-- Insert sample plants
INSERT INTO plants (code, name, company_code, region) VALUES
('P001', 'Main Campus', 'GU01', 'Region 1'),
('P002', 'East Campus', 'GU02', 'Region 2'),
('P003', 'West Campus', 'GU03', 'Region 3');

-- Insert sample service types
INSERT INTO service_types (code, name, description) VALUES
('MAINT', 'Maintenance', 'Regular maintenance services'),
('REPAIR', 'Repair', 'Emergency repair services'),
('INSTALL', 'Installation', 'New installation services'),
('INSPECT', 'Inspection', 'Routine inspection services');
