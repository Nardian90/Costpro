#!/usr/bin/env node
/**
 * FASE H1 — Generador de CREATE-SALE-V2-QA-TEST-MATRIX.md
 * a partir de los resultados consolidados (results/*.json).
 */
const fs = require('fs');
const path = require('path');

const RESULTS = path.join(__dirname, '..', '..', 'audit-evidence', 'FASE-H1', 'results');
const OUT = path.join(__dirname, '..', '..', 'audit-evidence', 'FASE-H1', 'CREATE-SALE-V2-QA-TEST-MATRIX.md');

const SUITE_ORDER = [
  '10-h1-acl', '11-h2-order', '12-h3-seller', '13-h4-tax', '14-h5-rate', '15-h6-idempotency',
  '16-financial', '17-cross-store', '18-inventory',
  '20-collateral-taxcfg', '21-collateral-utt', '22-collateral-rates',
  '30-route-checkout', '31-route-sync', '40-v1-retirement', '41-anti-resurrection',
];

const METHOD = {
  '10-h1-acl': 'RPC REST directo (anon)',
  '11-h2-order': 'RPC REST (anon + JWT) + inspección DB',
  '12-h3-seller': 'RPC REST (JWT actores) + inspección DB + static',
  '13-h4-tax': 'RPC REST (JWT USER_A) + inspección DB + pg_get_functiondef',
  '14-h5-rate': 'RPC REST (JWT) + PostgREST PATCH/POST fuentes + SQL',
  '15-h6-idempotency': 'RPC REST (JWT, Promise.all) + inspección DB',
  '16-financial': 'RPC REST (JWT) + inspección DB',
  '17-cross-store': 'RPC REST (JWT A/B) + PostgREST RLS + SQL',
  '18-inventory': 'RPC REST (JWT) + inspección inventory/stock_movements',
  '20-collateral-taxcfg': 'PostgREST (JWT) sobre tax_configurations + SQL',
  '21-collateral-utt': 'RPC REST (JWT clerk/encargado) + SQL triggers',
  '22-collateral-rates': 'PostgREST (JWT/anon) sobre fuentes de tasa',
  '30-route-checkout': 'HTTP POST localhost:3000/api/pos/checkout (JWT + Origin) + static',
  '31-route-sync': 'HTTP POST localhost:3000/api/sync/batch (JWT) + sync_log + static',
  '40-v1-retirement': 'SQL pg_proc/pg_depend + censo estático src/tests/e2e/migraciones',
  '41-anti-resurrection': 'Censo estático src/scripts/migraciones/security-contract + SQL ACL LIVE',
};

const ICON = { PASS: '✅', FAIL: '❌', BLOCKED: '⛔', 'NOT-OBSERVABLE': '👁️' };

(async () => {
  const suites = {};
  for (const f of fs.readdirSync(RESULTS)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf8'));
    suites[j.suite_id] = j;
  }

  let md = [];
  md.push('# CREATE-SALE-V2-QA-TEST-MATRIX — Matriz de contratos → tests');
  md.push('');
  md.push('> FASE H1 (QA TEST-FIRST) · Generada automáticamente desde `audit-evidence/FASE-H1/results/*.json`');
  md.push('> Baseline: `main@6cba0a1c1` · LIVE Supabase `wthkddeleylijmonclxg` · 2026-10-04');
  md.push('');
  const c = JSON.parse(fs.readFileSync(path.join(RESULTS, '_consolidated.json'), 'utf8'));
  md.push(`**TOTAL: ${c.totals.total} · ✅ PASS: ${c.totals.pass} · ❌ FAIL: ${c.totals.fail} · ⛔ BLOCKED: ${c.totals.blocked} · 👁️ NOT-OBSERVABLE: ${c.totals.not_observable}**`);
  md.push('');
  md.push('Los **FAIL** son evidencia del estado pre-hardening (TEST-FIRST): cada uno es un comportamiento que H1–H6 debe corregir.');
  md.push('');
  md.push('**ENMIENDA H0-R-FINAL (2026-10-04)**: `T-H5-005`/`T-H5-006` (ex-BLOCKED — BUSINESS DECISION) fueron dotados de contrato determinista por las decisiones aprobadas **D-EXR-01** (staleness = 45 días, FAIL CLOSED) y **D-EXR-02** (desviación cliente↔servidor NO es control de autorización) y **re-ejecutados** contra LIVE → `FAIL — IMPLEMENTATION` (evidencia runtime en `results/14-h5-rate.json`). Los 4 BLOCKED restantes (`T-H3-004`, `T-TC-001`, `T-UTT-001`, `T-UTT-006`) tienen contrato definido en `audit-evidence/FASE-H0-R/CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md` (§4/§5/§9; clasificados `FAIL — IMPLEMENTATION` en su §18) — su código de test permanece congelado como evidencia H1. El baseline de la ejecución H1 original (101 · 50 PASS · 44 FAIL · 6 BLOCKED · 1 NOT-OBSERVABLE) está en `CREATE-SALE-V2-QA-BASELINE.md`.');
  md.push('');
  md.push('| # | TEST ID | SPEC CONTRACT | TEST FILE | EJECUCIÓN | EXPECTED | CURRENT | STATUS |');
  md.push('|---|---------|---------------|-----------|-----------|----------|---------|--------|');

  let n = 0;
  for (const sid of SUITE_ORDER) {
    const j = suites[sid];
    if (!j) continue;
    for (const r of j.results) {
      n++;
      const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 220);
      md.push(`| ${n} | \`${r.id}\` | ${esc(r.spec)} | \`scripts/qa-h1/${sid}.cjs\` | ${METHOD[sid]} | ${esc(r.expected)} | ${esc(r.current)} | ${ICON[r.status]} ${r.status} |`);
    }
  }
  md.push('');
  fs.writeFileSync(OUT, md.join('\n'));
  console.log(`✅ matriz escrita: ${OUT} (${n} tests)`);
})();
