#!/bin/bash

# Doc-Buddy Runner Script
# This script runs the pre-built Electron app

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Error: node_modules not found."
    echo ""
    echo "Please install production dependencies first:"
    echo "  npm install --production"
    echo ""
    exit 1
fi

# Check if dist-electron exists
if [ ! -d "dist-electron" ]; then
    echo "Error: dist-electron not found."
    echo ""
    echo "Built files are missing. Please pull the latest from git:"
    echo "  git pull"
    echo ""
    exit 1
fi

# Run the app using npm start
echo "Starting Doc-Buddy..."
npm start
