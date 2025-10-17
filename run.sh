#!/bin/bash

# Doc-Buddy Runner Script
# This script runs the pre-built Electron app without requiring npm install

# Check if Electron is available
if ! command -v electron &> /dev/null; then
    echo "Error: Electron is not installed globally."
    echo ""
    echo "To run this app, you need to install Electron globally:"
    echo "  npm install -g electron"
    echo ""
    echo "Or use the local electron binary:"
    echo "  ./node_modules/.bin/electron dist-electron/main/index.js"
    exit 1
fi

# Run the app
echo "Starting Doc-Buddy..."
electron dist-electron/main/index.js
