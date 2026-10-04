#!/usr/bin/env node
/**
 * FASE H1 — Orquestador de la suite QA de create_sale_v2.
 *
 * Uso:
 *   node scripts/qa-h1/run-all.cjs            # fixtures + todas las suites
 *   node scripts/qa-h1/run-all.cjs --no-fixtures
 *
 * Salida: audit-evidence/FASE-H1/results/*.json + resumen consolidado
 * (exit code refleja solo errores de ejecución, NO el estado PASS/FAIL de los
 * tests — los FAIL actuales son evidencia esperada del estado pre-hardening).
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SUITES = [
  '10-h1-acl.cjs',
  '11-h2-order.cjs',
  '12-h3-seller.cjs',
  '13-h4-tax.cjs',
  '14-h5-rate.cjs',
  '15-h6-idempotency.cjs',
  '16-financial.cjs',
  '17-cross-store.cjs',
  '18-inventory.cjs',
  '20-collateral-taxcfg.cjs',
  '21-collateral-utt.cjs',
  '22-collateral-rates.cjs',
  '30-route-checkout.cjs',
  '31-route-sync.cjs',
  '40-v1-retirement.cjs',
  '41-anti-resurrection.cjs',
];

const noFixtures = process.argv.includes('--no-fixtures');

// 0) fixtures
if (!noFixtures) {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║ FIXTURES (service_role — preparación controlada)'.padEnd(79) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  const r = spawnSync('node', [path.join(__dirname, '00-fixtures.cjs')], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('❌ fixtures fallaron'); process.exit(1); }
}

const totals = { total: 0, pass: 0, fail: 0, blocked: 0, not_observable: 0 };
const t0 = Date.now();

for (const s of SUITES) {
  console.log('\n╔' + '═'.repeat(78) + '╗');
  console.log(`║ SUITE ${s}`.padEnd(79) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  const r = spawnSync('node', [path.join(__dirname, s)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`⚠ suite ${s} terminó con código ${r.status} (error de ejecución)`);
  }
}

// consolidar
const resultsDir = path.join(__dirname, '..', '..', 'audit-evidence', 'FASE-H1', 'results');
const all = [];
for (const f of fs.readdirSync(resultsDir)) {
  if (!f.endsWith('.json')) continue;
  const j = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8'));
  all.push(j);
  for (const k of Object.keys(totals)) if (k !== 'total') totals[k] += j.counts[k] || 0;
  totals.total += j.counts.total || 0;
}
totals.duration_ms = Date.now() - t0;

fs.writeFileSync(path.join(resultsDir, '_consolidated.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  baseline: '6cba0a1c1f1d0a63fb4e2e6703b87a6a4d52cb9f (main)',
  totals,
  suites: all.map(a => ({ id: a.suite_id, name: a.suite, counts: a.counts })),
}, null, 2));

console.log('\n╔' + '═'.repeat(78) + '╗');
console.log('║ RESUMEN CONSOLIDADO FASE H1'.padEnd(79) + '║');
console.log('╚' + '═'.repeat(78) + '╝');
console.log(`  TOTAL: ${totals.total} · PASS: ${totals.pass} · FAIL: ${totals.fail} · BLOCKED: ${totals.blocked} · NOT-OBSERVABLE: ${totals.not_observable}`);
console.log(`  Duración: ${(totals.duration_ms / 1000).toFixed(1)}s`);
console.log(`  Resultados: ${resultsDir}/_consolidated.json`);
console.log('\nNOTA: los FAIL actuales son EVIDENCIA del estado pre-hardening (TEST-FIRST).');
console.log('El implementador debe hacer pasar estos tests con el hardening H1–H6.');
