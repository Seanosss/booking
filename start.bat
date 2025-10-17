@echo off
echo ========================================
echo 🎯 Rental Booking System - Quick Start
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed. Please install Node.js first:
    echo    Visit: https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js is installed
node --version
echo.

:: Navigate to backend directory
cd backend

:: Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    echo ✓ Dependencies installed
) else (
    echo ✓ Dependencies already installed
)

echo.
echo 🚀 Starting backend server...
echo.
echo Backend API will be available at: http://localhost:3000
echo.
echo 📝 Next steps:
echo    1. Keep this window open ^(server is running^)
echo    2. Open 'frontend/index.html' in your browser to test
echo    3. Open 'admin/index.html' to access admin panel
echo.
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

:: Start the server
npm start
