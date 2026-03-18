#!/bin/bash
set -e

# 1. Prisma
if command -v bun &> /dev/null; then
  bun x prisma generate
else
  npx prisma generate
fi

# 2. Python dependencies (optional but helpful for AI pipeline)
if command -v pip &> /dev/null; then
  if [ -f "requirements.txt" ]; then
    pip install --break-system-packages -r requirements.txt || pip install -r requirements.txt || true
  fi
fi
