#!/bin/sh
# postinstall.sh - POSIX compliant postinstall script for CostPro

# Exit on error for critical parts
set -e

echo "Starting postinstall tasks..."

# 1. Prisma Client Generation - DISABLED (Moved to Supabase)
echo "Prisma generation disabled - project migrated to Supabase."

# 2. Python Dependencies (Optional)
# Don't exit on error for Python dependencies as they are not critical for the web build
set +e
if command -v pip > /dev/null 2>&1; then
    if [ -f "requirements.txt" ]; then
        echo "Installing Python dependencies from requirements.txt..."
        # Try different install methods for maximum compatibility
        pip install --break-system-packages -r requirements.txt > /dev/null 2>&1 || \
        pip install -r requirements.txt > /dev/null 2>&1 || \
        echo "Warning: Python dependencies failed to install, but continuing..."
    fi
else
    echo "pip not found, skipping Python dependencies."
fi

echo "Postinstall tasks completed successfully."
