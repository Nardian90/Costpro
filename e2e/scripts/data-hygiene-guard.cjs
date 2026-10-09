#!/usr/bin/env node
/**
 * GUARDRAIL — E2E DATA HYGIENE (FASE 16-17 + E2E-DATA-LIFECYCLE)
 * ============================================================================
 * Detecta contaminación de Supabase por residuos E2E al finalizar la suite:
 *
 *   BEFORE E2E → protegidos presentes + residuo E2E = 0 (o ≤ umbral tolerado)
 *   RUN E2E
 *   AFTER  E2E → E2E residual count = 0 → PASS
 *               > 0                → CI = FAIL ("E2E DATA CONTAMINATION DETECTED")
 *
 * También se ejecuta standalone ANTES de la suite (modo --before) como límite
 * de seguridad FAIL FAST: si el proyecto ya está contaminado por encima del
 * límite acotado, la corrida se aborta antes de empeorar el estado.
 *
 * E2E-DATA-LIFECYCLE (gobernanza por UUID):
 *   - Los recursos protegidos del config (e2e/config/protected-resources.json)
 *     NO cuentan como residuo: los pilotos persistentes 'E2E PILOT A/B
 *     CostPro' matchean el patrón 'E2E *' y provocarían un falso CI=FAIL.
 *   - En modo BEFORE se verifica la IDENTIDAD de los protegidos: si falta una
 *     tienda protegida, algún run anterior violó la protección → abort con
 *     instrucciones de remediación (los pilotos son re-provisionables con el
 *     script oficial; las tiendas de negocio NO).
 *
 * Uso:
 *   node e2e/scripts/data-hygiene-guard.cjs            → modo AFTER (default)
 *   node e2e/scripts/data-hygiene-guard.cjs --before   → modo BEFORE (fail fast)
 *
 * Exit codes: 0 = PASS · 1 = CONTAMINACIÓN/PROTEGIDO AUSENTE · 2 = ERROR
 * ============================================================================
 */
const path = require('path');
const fs = require('fs');

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

// ── Config de gobernanza (fuente única de verdad, espejo de protected-resources.ts)
function loadProtectedConfig() {
  const candidates = [
    path.resolve(__dirname, '..', 'config', 'protected-resources.json'),
    path.resolve(process.cwd(), 'e2e', 'config', 'protected-resources.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* siguiente */ }
  }
  return null;
}

const PROTECTED_CONFIG = loadProtectedConfig();
const PROTECTED_STORE_IDS = PROTECTED_CONFIG
  ? PROTECTED_CONFIG.protectedStores.map((s) => s.id)
  : ['d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', '5e6fe821-5465-48b1-b3f1-3aa3182edc38'];
const PROTECTED_STORE_NAMES = PROTECTED_CONFIG
  ? Array.from(new Set([...PROTECTED_CONFIG.protectedStores.map((s) => s.name), ...(PROTECTED_CONFIG.protectedStoreNamesExact || [])]))
  : ['TIENDA CENTRAL COSTPRO', 'Puerto Padre VITALLCONS', 'ENERVIDA-VITALLCONS'];
const PROTECTED_USER_EMAILS = PROTECTED_CONFIG
  ? PROTECTED_CONFIG.protectedUsers.map((u) => u.email.toLowerCase())
  : [];

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

// Exclusiones de protegidos (los pilotos persistentes matchean 'E2E *')
const STORE_EXCLUDE = [
  `id=not.in.(${PROTECTED_STORE_IDS.join(',')})`,
  `name=not.in.(${PROTECTED_STORE_NAMES.map((n) => `"${n}"`).join(',')})`,
  'is_archived=eq.false',
].join('&');
const USER_EXCLUDE = PROTECTED_USER_EMAILS.length
  ? `&email=not.in.(${PROTECTED_USER_EMAILS.map((e) => `"${e}"`).join(',')})`
  : '';

async function count(table, orExpr, excludeExpr) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[data-hygiene-guard] Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const query = `select=id&or=(${orExpr})${excludeExpr ? `&${excludeExpr}` : ''}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'HEAD',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  if (!res.ok) {
    const alt = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!alt.ok) throw new Error(`count ${table} falló: HTTP ${alt.status}`);
    return (await alt.json()).length;
  }
  const cr = res.headers.get('content-range') || '';
  const total = Number(cr.split('/')[1] || '0');
  return Number.isFinite(total) ? total : 0;
}

/** Identidad de los protegidos: EXISTEN y no archivadas (solo modo BEFORE). */
async function verifyProtectedIdentity() {
  const problems = [];
  for (const id of PROTECTED_STORE_IDS) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/stores?select=id,name,is_archived&id=eq.${id}&limit=1`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      if (!res.ok) { problems.push(`${id} (verificación HTTP ${res.status})`); continue; }
      const rows = await res.json();
      if (!rows[0]) problems.push(`${id} AUSENTE`);
      else if (rows[0].is_archived) problems.push(`"${rows[0].name}" (${id}) ARCHIVADA`);
    } catch (e) {
      problems.push(`${id} (error: ${e.message})`);
    }
  }
  return problems;
}

(async () => {
  const mode = process.argv.includes('--before') ? 'BEFORE' : 'AFTER';
  const source = PROTECTED_CONFIG ? 'config' : 'fallback';
  const stores = await count('stores', STORE_OR, STORE_EXCLUDE);
  const users = await count('profiles', USER_OR, USER_EXCLUDE.replace(/^&/, ''));
  console.log(`[data-hygiene-guard:${mode}] residuos E2E — stores=${stores} users=${users} (límites: ${MAX_RESIDUAL_STORES}/${MAX_RESIDUAL_USERS}) | protegidos: ${PROTECTED_STORE_IDS.length} tiendas por ${source}`);

  if (mode === 'BEFORE') {
    // 1. Identidad de protegidos (fail-fast si un run anterior los violó)
    const identity = await verifyProtectedIdentity();
    if (identity.length > 0) {
      console.error(`E2E PROTECTED RESOURCES VIOLATED — faltan o están archivadas: ${identity.join('; ')}`);
      console.error('Remediación: re-provisionar pilotos con `node e2e/scripts/provision-pilot-env.cjs` y actualizar e2e/config/protected-resources.json (ver docs/audits/E2E-RESOURCE-LIFECYCLE-REMEDIATION.md).');
      process.exit(1);
    }
    // 2. Residuo preexistente sobre el límite
    if (stores > MAX_RESIDUAL_STORES || users > MAX_RESIDUAL_USERS) {
      console.error('E2E DATA CONTAMINATION DETECTED — residuo preexistente sobre el límite acotado. Ejecutar limpieza (docs/audits/E2E-DATA-HYGIENE.md) antes de correr la suite.');
      process.exit(1);
    }
    console.log('[data-hygiene-guard:BEFORE] PASS — protegidos presentes y residuo bajo el límite');
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
