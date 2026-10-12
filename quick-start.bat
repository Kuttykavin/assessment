@echo off
echo ========================================
echo SAP FSM Quick Start Script
echo ========================================
echo.

echo Step 1: Creating database...
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS sap_fsm;"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Could not connect to MySQL
    echo Please check:
    echo 1. MySQL is installed
    echo 2. MySQL service is running
    echo 3. Password is correct
    pause
    exit /b 1
)

echo Step 2: Importing schema...
mysql -u root -p sap_fsm < config\database.sql
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Could not import database schema
    pause
    exit /b 1
)

echo.
echo ========================================
echo Database setup complete!
echo ========================================
echo.
echo Now starting the server...
echo.

start http://localhost:3000

npm start
