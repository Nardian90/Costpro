#!/bin/sh
set -e
echo "Bundling standalone build..."
mkdir -p .next/standalone/.next/static
mkdir -p .next/standalone/public
mkdir -p .next/standalone/knowledge
mkdir -p .next/standalone/docs
mkdir -p .next/standalone/ai_context

if [ -d .next/static ]; then
  echo "Copying .next/static..."
  cp -r .next/static/* .next/standalone/.next/static/
fi

if [ -d public ]; then
  echo "Copying public..."
  cp -r public/* .next/standalone/public/
fi

if [ -d knowledge ]; then
  echo "Copying knowledge..."
  cp -r knowledge/* .next/standalone/knowledge/
fi

if [ -d docs ]; then
  echo "Copying docs..."
  cp -r docs/* .next/standalone/docs/
fi

if [ -d ai_context ]; then
  echo "Copying ai_context..."
  cp -r ai_context/* .next/standalone/ai_context/
fi
echo "Bundling complete."
