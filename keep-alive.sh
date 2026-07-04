#!/bin/bash
cd /home/z/my-project
cp .env .next/standalone/.env 2>/dev/null
export NODE_OPTIONS="--max-old-space-size=2048"
while true; do
  node .next/standalone/server.js -p 3000 2>>/tmp/costpro-keepalive.log
  echo "[$(date)] Server died, restarting in 3s..." >> /tmp/costpro-keepalive.log
  sleep 3
done
