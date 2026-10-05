#!/usr/bin/env node
/**
 * GUARDRAIL — E2E DATA HYGIENE (FASE 16-17)
 * ============================================================================
 * Detecta contaminación de Supabase por residuos E2E al finalizar la suite:
 *
 *   BEFORE E2E → E2E residual count = 0 (o ≤ umbral preexistente tolerado)
 *   RUN E2E
 *   AFTER  E2E → E2E residual count = 0 → PASS
 *               > 0                → CI = FAIL ("E2E DATA CONTAMINATION DETECTED")
 *
 * También se ejecuta standalone ANTES de la suite (modo --before) como límite
 * de seguridad FAIL FAST: si el proyecto ya está contaminado por encima del
 * límite acotado, la corrida se aborta antes de empeorar el estado.
 *
 * Uso:
 *   node e2e/scripts/data-hygiene-guard.cjs            → modo AFTER (default)
 *   node e2e/scripts/data-hygiene-guard.cjs --before   → modo BEFORE (fail fast)
 *
 * Exit codes: 0 = PASS · 1 = CONTAMINACIÓN (post-run o pre-run sobre límite)
 * ============================================================================
 */
const path = require('path');

// Carga .env (misma convención que playwright.config.ts)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REF = (SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || '';

/** Límite acotado (FASE 17): derivado de la suite real — tras un teardown
 *  correcto el residuo es 0; el límite tolera una corrida concurrente de otro
 *  runner (pilotos A/B + plantel) pero NUNCA cientos. */
const MAX_RESIDUAL_STORES = Number(process.env.E2E_GUARD_MAX_STORES || 12);
const MAX_RESIDUAL_USERS = Number(process.env.E2E_GUARD_MAX_USERS || 12);

const STORE_OR = [
  'name.ilike.E2E80*',
  'name.ilike."E2E *"',
  'name.ilike."E2E-*"',
  'name.ilike.E2E2-*',
  'name.ilike."ESEC TEST*"',
  'name.ilike."FASE-D TEST*"',
  'name.ilike."AUDIT *"',
  'name.ilike."HOT *"',
  'name.ilike.REM-F4*',
  'name.ilike."Updated Name E2E"',
  'name.ilike."Test Store*"',
  'name.ilike.TEST-*',
].join(',');

const USER_OR = [
  'email.ilike.e2e-*',
  'email.ilike.e2e80-*',
  'email.ilike.e2e2-*',
  'email.ilike.hot-test-*',
  'email.ilike.hot-regular@*',
  'email.ilike.f06dr-*',
  'email.ilike.audit-ph3-*',
  'email.ilike.esec-*',
  'email.ilike.gate-f406d-*',
].join(',');

async function count(table, orExpr) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[data-hygiene-guard] Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&or=(${orExpr})`, {
    method: 'HEAD',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  if (!res.ok) {
    const alt = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&or=(${orExpr})`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!alt.ok) throw new Error(`count ${table} falló: HTTP ${alt.status}`);
    return (await alt.json()).length;
  }
  const cr = res.headers.get('content-range') || '';
  const total = Number(cr.split('/')[1] || '0');
  return Number.isFinite(total) ? total : 0;
}

(async () => {
  const mode = process.argv.includes('--before') ? 'BEFORE' : 'AFTER';
  const stores = await count('stores', STORE_OR);
  const users = await count('profiles', USER_OR);
  console.log(`[data-hygiene-guard:${mode}] residuos E2E — stores=${stores} users=${users} (límites: ${MAX_RESIDUAL_STORES}/${MAX_RESIDUAL_USERS})`);

  if (mode === 'BEFORE') {
    if (stores > MAX_RESIDUAL_STORES || users > MAX_RESIDUAL_USERS) {
      console.error('E2E DATA CONTAMINATION DETECTED — residuo preexistente sobre el límite acotado. Ejecutar limpieza (docs/audits/E2E-DATA-HYGIENE.md) antes de correr la suite.');
      process.exit(1);
    }
    process.exit(0);
  }

  // Modo AFTER: el criterio de una corrida con teardown correcto es NET ZERO
  if (stores > 0 || users > 0) {
    console.error('E2E DATA CONTAMINATION DETECTED — la corrida dejó residuos (stores=' + stores + ' users=' + users + '). CI = FAIL. Ver docs/audits/E2E-DATA-HYGIENE.md § Solución.');
    process.exit(1);
  }
  console.log('[data-hygiene-guard:AFTER] PASS — net delta = 0');
  process.exit(0);
})().catch((e) => {
  console.error('[data-hygiene-guard] ERROR:', e.message);
  process.exit(2);
});
