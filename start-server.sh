#!/bin/bash
# Persistent server start script for Costpro
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=2048"

# Kill any existing server
pkill -f "server.js" 2>/dev/null || true
sleep 2

# Copy env to standalone dir
cp .env .next/standalone/.env 2>/dev/null || true

# Start server in a loop
while true; do
  echo "[$(date)] Starting Costpro server..."
  node .next/standalone/server.js -p 3000
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 5s..."
  sleep 5
done
