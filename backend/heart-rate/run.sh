#!/bin/bash

# Mi Band BLE Backend Startup Script

echo "🚀 Starting Mi Band Heart Rate Monitor Backend..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install/upgrade dependencies
echo "📚 Installing dependencies..."
pip install -r requirements.txt

# Start the server
echo "🏃 Starting FastAPI server on http://localhost:8000"
echo "📱 Make sure your Mi Band is nearby and heart rate measurement is active"
echo "🔗 Frontend should connect to: http://localhost:8000/api"
echo ""
echo "Press Ctrl+C to stop the server"
echo "---"

python main.py