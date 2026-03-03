#!/bin/bash
echo "============================================================"
echo "  EngineeringDocs2LLM Converter"
echo "============================================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 not found. Install from https://python.org"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
pip3 install -r requirements.txt --quiet 2>/dev/null || pip install -r requirements.txt --quiet
echo ""

# Start server
echo "Starting server..."
echo "Open your browser to: http://localhost:5000"
echo "Press Ctrl+C to stop."
echo ""
python3 server.py
