#!/usr/bin/env bash
# Manifiesto determinista de lotes E2E (FASE 8) — CostPro
# Agrupación por archivo completo (cohesión de módulo), orden alfabético,
# acumulando ~50 tests por lote. Total: 382 tests en 8 lotes.
#   BATCH 1: 52 | BATCH 2: 54 | BATCH 3: 50 | BATCH 4: 52
#   BATCH 5: 63 | BATCH 6: 50 | BATCH 7: 44 | BATCH 8: 17
set -uo pipefail
cd /home/z/my-project/Costpro

BATCH="${1:-}"
if [ -z "$BATCH" ]; then
  echo "Uso: $0 <1..8>"
  exit 2
fi

case "$BATCH" in
  1) SPECS="e2e/academy.spec.ts e2e/accessibility.spec.ts e2e/accounts-payable.spec.ts e2e/ai-chat.spec.ts e2e/api-routes.spec.ts e2e/auth.spec.ts" ;;
  2) SPECS="e2e/commissions-payments.spec.ts e2e/cost-engine.spec.ts e2e/cost-sheet-flow.spec.ts e2e/data-hygiene-probe.spec.ts e2e/fc-accessibility.spec.ts e2e/fc-automation.spec.ts e2e/flows/auth-session-ui.spec.ts" ;;
  3) SPECS="e2e/flows/cash-closure-flow.spec.ts e2e/flows/catalog-storefront.spec.ts e2e/flows/devolutions-flow.spec.ts e2e/flows/inventory-integrity.spec.ts e2e/flows/pos-checkout.spec.ts e2e/flows/production-orders-flow.spec.ts e2e/flows/purchase-orders-flow.spec.ts e2e/flows/reverse-sale-flow.spec.ts e2e/flows/roles-permissions.spec.ts" ;;
  4) SPECS="e2e/flows/transfers-flow.spec.ts e2e/health-api.spec.ts e2e/home-page.spec.ts e2e/import.spec.ts e2e/infra-probe.spec.ts e2e/inventory.spec.ts e2e/isolation-proof.spec.ts e2e/landing-page.spec.ts e2e/legal.spec.ts" ;;
  5) SPECS="e2e/mobile-viewport-audit.spec.ts e2e/multi-store-comprehensive.spec.ts" ;;
  6) SPECS="e2e/multi-tienda-docs.spec.ts e2e/rate-limit.spec.ts e2e/reports.spec.ts e2e/reverse-duplicate-ui.spec.ts e2e/security-headers.spec.ts e2e/security.spec.ts e2e/store-create-autoswitch.spec.ts" ;;
  7) SPECS="e2e/store-lifecycle.spec.ts e2e/store-reset.spec.ts e2e/store-switching.spec.ts e2e/stores-crud.spec.ts" ;;
  8) SPECS="e2e/sync-batch.spec.ts e2e/workers-create.spec.ts" ;;
  *) echo "Lote inválido: $BATCH"; exit 2 ;;
esac

echo "=================================================================="
echo "BATCH $BATCH — BEFORE data hygiene"
echo "=================================================================="
node e2e/scripts/data-hygiene-guard.cjs --before 2>&1 | sed '/dotenvx/d'
BEFORE_RC=${PIPESTATUS[0]}
if [ $BEFORE_RC -ne 0 ]; then
  echo "GUARDRAIL BEFORE FALLÓ (rc=$BEFORE_RC) — reintentando en 30s (FASE 15)"
  sleep 30
  node e2e/scripts/data-hygiene-guard.cjs --before 2>&1 | sed '/dotenvx/d'
  BEFORE_RC=${PIPESTATUS[0]}
fi
if [ $BEFORE_RC -ne 0 ]; then
  echo "GUARDRAIL BEFORE FALLÓ definitivamente — abortando lote (FASE 15)"
  exit 1
fi

echo "=================================================================="
echo "BATCH $BATCH — RUN: $SPECS"
echo "=================================================================="
START=$(date +%s)
npx playwright test $SPECS --reporter=line 2>&1 | tail -30
RC=${PIPESTATUS[0]}
END=$(date +%s)
echo "DURACIÓN: $((END-START))s (exit=$RC)"

echo "=================================================================="
echo "BATCH $BATCH — AFTER data hygiene"
echo "=================================================================="
node e2e/scripts/data-hygiene-guard.cjs 2>&1 | sed '/dotenvx/d'
AFTER_RC=${PIPESTATUS[0]}
exit $(( RC != 0 ? RC : AFTER_RC ))
