@echo off
echo ========================================
echo SAP FSM Complete Setup
echo ========================================
echo.

REM Add MySQL to PATH for this session
set PATH=%PATH%;C:\Program Files\MySQL\MySQL Server 8.0\bin

echo Testing MySQL connection...
mysql --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: MySQL not found in default location
    echo Please enter your MySQL password in the next steps manually
    echo.
    pause
)

echo.
echo Step 1: Creating database 'sap_fsm'
echo Enter your MySQL root password when prompted:
echo.
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS sap_fsm;"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Could not create database
    echo Please check your MySQL password and try again
    pause
    exit /b 1
)

echo.
echo Step 2: Importing database schema and data...
echo Enter your MySQL root password again:
echo.
mysql -u root -p sap_fsm < config\database.sql

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Could not import schema
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Database setup complete!
echo ========================================
echo.
echo Next steps:
echo 1. Edit .env file and add your MySQL password
echo 2. Run: npm start
echo 3. Open: http://localhost:3000
echo 4. Login: admin / admin123
echo.
echo Opening .env file for you to edit...
timeout /t 3
notepad .env

echo.
echo After updating .env file, press any key to start the server...
pause
npm start
