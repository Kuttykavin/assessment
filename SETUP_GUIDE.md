# Setup Guide - SAP FSM Application

## Prerequisites Installation

### 1. Install MySQL

**Option A: MySQL Installer (Recommended)**
1. Download MySQL Installer from: https://dev.mysql.com/downloads/installer/
2. Run the installer and select "MySQL Server" and "MySQL Workbench"
3. During installation, set root password (remember this!)
4. Choose default port 3306

**Option B: Using Chocolatey (Windows Package Manager)**
```powershell
choco install mysql
```

### 2. Verify MySQL Installation
```powershell
mysql --version
```

## Database Setup

### Option 1: Using MySQL Command Line
```powershell
# Login to MySQL
mysql -u root -p

# Create database (in MySQL prompt)
CREATE DATABASE sap_fsm;
exit;

# Import schema
mysql -u root -p sap_fsm < config/database.sql
```

### Option 2: Using MySQL Workbench (GUI)
1. Open MySQL Workbench
2. Connect to localhost
3. Click "File" > "Open SQL Script"
4. Select `config/database.sql`
5. Click Execute (lightning bolt icon)

## Configuration

### Update .env file
Edit the `.env` file with your MySQL password:
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=sap_fsm
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD_HERE
```

## Running the Application

### 1. Start the Server
```powershell
npm start
```

Or for development with auto-reload:
```powershell
npm run dev
```

### 2. Access the Application
Open your browser and go to:
```
http://localhost:3000
```

### 3. Default Login Credentials
- **Username**: admin
- **Password**: admin123

## Testing Without MySQL (Quick Demo)

If you want to test the structure without setting up MySQL:

### Option 1: View the Files
```powershell
# Open project in VS Code
code .

# Key files to review:
# - server.js (main server)
# - routes/serviceOrders.js (service order API)
# - routes/exceptions.js (exception management)
# - public/index.html (frontend)
# - public/js/app.js (frontend logic)
```

### Option 2: Use SQLite (Quick Alternative)
1. Install SQLite package:
```powershell
npm install sqlite3
```

2. I can convert the schema to SQLite if needed

## Troubleshooting

### Port Already in Use
```powershell
# Change port in .env file
PORT=3001
```

### MySQL Connection Error
- Verify MySQL is running: Check Services (services.msc)
- Check credentials in .env file
- Ensure database is created: `CREATE DATABASE sap_fsm;`

### Cannot Find Module Error
```powershell
npm install
```

## What to Test

Once running, test these features:

1. **Login**: Use admin/admin123
2. **Dashboard**: View KPIs and statistics
3. **Service Orders**: 
   - Click "Service Orders" in navigation
   - Create new order (if supervisor/manager/admin)
   - Filter orders by status, priority
4. **Exceptions**: 
   - View exception list
   - See severity indicators
5. **Analytics**: 
   - Dashboard with charts
   - Performance metrics
6. **Approvals**: 
   - View pending approvals
   - Approve/reject requests

## API Testing (Without Frontend)

Test APIs using PowerShell or Postman:

```powershell
# Login
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"admin123"}'

# Get service orders
$token = ($response.Content | ConvertFrom-Json).token
Invoke-WebRequest -Uri "http://localhost:3000/api/service-orders" `
  -Headers @{Authorization="Bearer $token"}
```

## Next Steps

1. Install MySQL
2. Create database
3. Update .env with password
4. Run `npm start`
5. Open http://localhost:3000
6. Login with admin/admin123

## Need Help?

Check these files:
- README.md - Full documentation
- config/database.sql - Database schema
- .env - Configuration
