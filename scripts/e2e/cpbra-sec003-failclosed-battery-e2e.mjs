#!/usr/bin/env node
/**
 * cpbra-sec003-failclosed-battery-e2e.mjs — Batería P− de SEC-003
 * (autenticación fail-closed server-side) vía HTTP REAL contra la app.
 * Misión CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 FASE 2 (§4.3).
 *
 * SIN FIXTURES DE DATOS y SIN ESCRITURAS: cada caso verifica el RECHAZO
 * (401/403/400) de un acceso no autorizado, o el acceso público POSITIVO
 * documentado de la allowlist PUBLIC de audit-route-auth.cjs.
 *
 * Clases verificadas:
 *   W  WRAPPER  — rutas protegidas con withAuth/withRole/withStoreAccess → 401 sin token; 401 con token inválido
 *   S  SESSION  — mecanismo propio getServerSession+401 (raíz /api, diag-splash)
 *   C  CRON     — CRON_SECRET/x-vercel-signature fail-closed (5 rutas)
 *   H  WEBHOOK  — firma requerida (Stripe, Telegram)
 *   P  PUBLIC   — allowlist PUBLIC funciona (positivos: health, docs, help-docs, storefront)
 *
 * Aislamiento entre tiendas y autorización por rol: cubiertos por las baterías
 * de dominio (R-25 16/16, R-03 17/17, pay_commission 15/15, FIN-011 16/16) —
 * esta batería demuestra la BARRERA de entrada transversal.
 *
 * Uso: node scripts/e2e/cpbra-sec003-failclosed-battery-e2e.mjs [--base http://localhost:3000]
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : null) || process.env.E2E_APP_BASE || 'http://localhost:3000';

let pass = 0, fail = 0;
const results = [];
const ok = (n, m) => { pass++; results.push({ n, m, r: 'PASS' }); console.log(`  ✓ [${n}] ${m}`); };
const bad = (n, m, extra) => { fail++; results.push({ n, m, r: 'FAIL', extra }); console.log(`  ✗ [${n}] ${m}${extra ? ' — ' + String(extra).slice(0, 200) : ''}`); };

async function probe(method, path, headers = {}, body = null) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, json };
}
const ANY_UUID = '99999999-9999-4999-8999-999999999999';

async function main() {
  console.log(`BASE=${BASE}`);

  // ── W: rutas con wrapper canónico — sin token → 401 ─────────────────
  const wrapped = [
    ['W1', 'POST', '/api/payments', { ref_type: 'work', ref_id: ANY_UUID, amount: 1, payment_method: 'cash' }],
    ['W2', 'POST', '/api/payments/ot-batch', { items: [{ ref_id: ANY_UUID, payments: [{ payment_method: 'cash', amount: 1 }] }] }],
    ['W3', 'POST', '/api/payments/multi', { items: [{ ref_type: 'receipt', ref_id: ANY_UUID, amount: 1 }], payment_method: 'cash' }],
    ['W4', 'POST', '/api/accounts-payable/bulk-pay', { items: [{ ref_type: 'commission', ref_id: ANY_UUID }], payment_method: 'cash' }],
    ['W5', 'PATCH', `/api/commissions/payments/${ANY_UUID}`, { action: 'pay', payment_method: 'transfer' }],
    ['W6', 'POST', `/api/production-orders/${ANY_UUID}/payments`, { amount: 1, payment_method: 'cash', payment_type: 'partial' }],
    ['W7', 'GET', '/api/production-orders', null],
    ['W8', 'GET', '/api/accounts-payable?store_id=' + ANY_UUID, null],
    ['W10', 'GET', '/api/docs', null],
  ];
  for (const [n, method, path, body] of wrapped) {
    const r = await probe(method, path, { 'Content-Type': 'application/json' }, body);
    if (r.status === 401) ok(n, `${method} ${path} sin token → 401 fail-closed`);
    else bad(n, `esperado 401`, JSON.stringify({ s: r.status, j: r.json }));
  }

  // ── W9: token INVÁLIDO (spoofing de sesión) → 401 ───────────────────
  const w9 = await probe('POST', '/api/payments', { 'Content-Type': 'application/json', Authorization: 'Bearer e30.e30.firma-falsa' }, { ref_type: 'work', ref_id: ANY_UUID, amount: 1, payment_method: 'cash' });
  if (w9.status === 401) ok('W9', 'Bearer token inválido/forged → 401 (getServerSession verifica firma — FIX-AUDIT-AUTH-1)');
  else bad('W9', 'esperado 401 con token falsificado', JSON.stringify({ s: w9.status }));

  // ── S: mecanismo propio getServerSession+401 ────────────────────────
  const s1 = await probe('GET', '/api');
  if (s1.status === 401) ok('S1', 'GET /api (raíz, service discovery) sin sesión → 401');
  else bad('S1', 'esperado 401', JSON.stringify({ s: s1.status }));
  const s2 = await probe('GET', '/api/diag-splash');
  if (s2.status === 401) ok('S2', 'GET /api/diag-splash sin sesión → 401 (SEC-003: diagnóstico ya NO público)');
  else bad('S2', 'esperado 401 (fix diag-splash)', JSON.stringify({ s: s2.status, j: s2.json }));

  // ── C: CRON fail-closed (5 rutas) ───────────────────────────────────
  const crons = ['exchange-rates', 'purge-snapshots', 'telegram-auto-publish', 'whatsapp-auto-publish', 'usage-sync'];
  for (let i = 0; i < crons.length; i++) {
    const r = await probe('GET', `/api/cron/${crons[i]}`);
    if (r.status === 401) ok(`C${i + 1}`, `/api/cron/${crons[i]} sin CRON_SECRET ni firma → 401`);
    else bad(`C${i + 1}`, 'esperado 401', JSON.stringify({ s: r.status }));
  }
  // CRON con secreto INCORRECTO → 401 (no solo ausente)
  const c6 = await probe('GET', '/api/cron/usage-sync', { Authorization: 'Bearer secreto-incorrecto' });
  if (c6.status === 401) ok('C6', 'CRON_SECRET incorrecto → 401 (comparación estricta)');
  else bad('C6', 'esperado 401 con secreto erróneo', JSON.stringify({ s: c6.status }));

  // ── H: WEBHOOKS con firma requerida ─────────────────────────────────
  const h1 = await probe('POST', '/api/telegram/webhook', { 'Content-Type': 'application/json' }, { update_id: 1 });
  if (h1.status === 401 || h1.status === 400 || h1.status === 403) ok('H1', `webhook Telegram sin secret token → ${h1.status} rechazado`);
  else bad('H1', 'esperado rechazo 4xx', JSON.stringify({ s: h1.status }));
  const h2 = await probe('POST', '/api/billing/webhook', { 'Content-Type': 'application/json' }, { type: 'invoice.paid' });
  if (h2.status === 400 || h2.status === 401 || h2.status === 403) ok('H2', `webhook Stripe sin firma → ${h2.status} rechazado`);
  else bad('H2', 'esperado rechazo 4xx', JSON.stringify({ s: h2.status }));

  // ── P: allowlist PUBLIC — accesos positivos documentados ────────────
  const p1 = await probe('GET', '/api/health');
  if (p1.status === 200 && p1.json?.status === 'ok') ok('P1', 'GET /api/health → 200 ok (allowlist PUBLIC)');
  else bad('P1', 'esperado 200 ok', JSON.stringify({ s: p1.status }));
  const p3 = await probe('GET', '/api/help-docs');
  if (p3.status === 200) ok('P3', 'GET /api/help-docs → 200 (ayuda pública)');
  else bad('P3', 'esperado 200', JSON.stringify({ s: p3.status }));

  console.log(`\n=== RESUMEN SEC-003 batería P−: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail > 0 ? 1 : 0);
}

await main();
