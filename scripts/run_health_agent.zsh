#!/bin/zsh
echo "Iniciando AI System Health Agent..."
npx playwright test e2e/system_health_agent.spec.ts --project=chromium --reporter=list
