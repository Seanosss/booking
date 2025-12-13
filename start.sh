#!/bin/bash

echo "🎯 Rental Booking System - Quick Start"
echo "======================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js is installed: $(node --version)"
echo ""

# Navigate to backend directory
cd backend || exit

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✓ Dependencies installed"
else
    echo "✓ Dependencies already installed"
fi

echo ""
echo "🚀 Starting backend server..."
echo ""
echo "Backend API will be available at: http://localhost:3000"
echo ""
echo "📝 Next steps:"
echo "   1. Keep this terminal open (server is running)"
echo "   2. Open 'frontend/index.html' in your browser to test"
echo "   3. Open 'admin/index.html' to access admin panel"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "======================================"
echo ""

# Start the server
npm start
