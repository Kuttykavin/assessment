@echo off
echo ========================================
echo Setting up SAP FSM Database
echo ========================================
echo.
echo This will:
echo 1. Create database 'sap_fsm'
echo 2. Import all tables and data
echo.
echo When prompted, enter your MySQL root password
echo.
pause

echo Creating database...
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS sap_fsm;"

echo.
echo Importing schema and data...
mysql -u root -p sap_fsm < config\database.sql

echo.
echo ========================================
echo Database setup complete!
echo ========================================
echo.
echo Next: Update your .env file with MySQL password
echo Then run: npm start
echo.
pause
