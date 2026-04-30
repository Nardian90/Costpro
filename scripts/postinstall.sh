#!/bin/sh
# postinstall.sh - POSIX compliant postinstall script for CostPro

# Exit on error for critical parts
set -e

echo "Starting postinstall tasks..."

# 1. Prisma Client Generation
# Use local prisma if available, otherwise bun/npx
if [ -f "./node_modules/.bin/prisma" ]; then
    echo "Using local Prisma to generate client..."
    ./node_modules/.bin/prisma generate
elif command -v bun > /dev/null 2>&1; then
    echo "Using Bun to generate Prisma client..."
    bun x prisma generate
elif command -v npx > /dev/null 2>&1; then
    echo "Using npx to generate Prisma client..."
    npx prisma generate
else
    echo "Warning: Neither bun nor npx found. Skipping Prisma generation."
fi

# 2. Python Dependencies (Optional)
# Don't exit on error for Python dependencies as they are not critical for the web build
set +e
if command -v pip > /dev/null 2>&1; then
    if [ -f "requirements.txt" ]; then
        echo "Installing Python dependencies from requirements.txt..."
        # Try different install methods for maximum compatibility
        pip install --break-system-packages -r requirements.txt > /dev/null 2>&1 ||         pip install -r requirements.txt > /dev/null 2>&1 ||         echo "Warning: Python dependencies failed to install, but continuing..."
    fi
else
    echo "pip not found, skipping Python dependencies."
fi

echo "Postinstall tasks completed successfully."
