#!/usr/bin/env node
/**
 * r2-exec-assemble-evidence.cjs — REM-R2-READ-EXEC
 * Consolida la evidencia de ejecución en audit-evidence/R2-SECDEF-READ-SURFACE/
 */
const fs = require('fs');
const path = require('path');

const S = '/home/z/my-project/scripts';
const E = '/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE';

const verifyFiles = fs.readdirSync(S).filter(f => /^r2-exec-verify-\d+\.json$/.test(f)).sort();
const batches = verifyFiles.map(f => JSON.parse(fs.readFileSync(path.join(S, f), 'utf8')));

// mapear por migration
const byMig = {};
for (const b of batches) byMig[b.migration.split('/').pop()] = b;

const zeroTouch = {
  pre: JSON.parse(fs.readFileSync(path.join(S, 'r2-exec-zero-touch-pre.json'), 'utf8')),
  post: JSON.parse(fs.readFileSync(path.join(S, 'r2-exec-zero-touch-post.json'), 'utf8')),
};
// solo los 2 protegidos para la evidencia
const prot = rows => rows.filter(r => /VITALLCONS/.test(r.store));
zeroTouch.pre.rows = prot(zeroTouch.pre.rows);
zeroTouch.post.rows = prot(zeroTouch.post.rows);

// PRE state = captura congelada de prep (drift-check de ejecución demostró byte-igualdad
// PRE==congelada con drift=0 antes de tocar producción; el archivo de trabajo fue renombrado a POST)
const frozen = JSON.parse(fs.readFileSync(
  '/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE/03_prep-live-capture.json', 'utf8'));
const preSubset = { funcs: {}, exec_grants_detail: {} };
for (const f of ['get_cash_closures', 'get_transfers', 'get_store_analytics_advanced', 'get_sales_since_last_closure',
  'get_paginated_products', 'get_products_for_reception', 'get_product_stock_ledger_paginated',
  'get_daily_expenses_aggregated', 'get_low_stock_count', 'has_store_access']) {
  preSubset.funcs[f] = frozen.funcs[f];
  if (frozen.exec_grants_detail[f]) preSubset.exec_grants_detail[f] = frozen.exec_grants_detail[f];
}
preSubset.note = 'byte-identical to runtime PRE capture (drift check = 0 before deployment)';

const evidence = {
  _meta: {
    document: 'REM-R2-READ-EXEC — evidencia consolidada de ejecución (consolidated execution evidence)',
    generated_at: new Date().toISOString(),
    project_ref: 'wthkddeleylijmonclxg',
    phases: ['R2-A 20260916000005', 'R2-B 20260916000006', 'R2-C 20260916000007'],
    method: 'Management API SQL (mismo canal que R1) + verificación por lote (byte/meta/guard/dinámico) + staging PG17 efímero + zero-touch bitwise',
  },
  pre_capture: preSubset,
  post_capture: JSON.parse(fs.readFileSync(path.join(S, 'r2-exec-post-live.json'), 'utf8')),
  staging: JSON.parse(fs.readFileSync(path.join(S, 'r2-guard-staging-results.json'), 'utf8')),
  batches: byMig,
  zero_touch: evidence_zero(),
};
function evidence_zero() { return zeroTouch; }

fs.writeFileSync(path.join(E, '04_exec-consolidated.json'), JSON.stringify(evidence, null, 1));

// copia del staging ya está; resumen de verificación por lote
const batchSummary = Object.entries(byMig).map(([mig, b]) => {
  const ok = b.checks.filter(c => c.ok).length;
  const fail = b.checks.filter(c => !c.ok);
  return { migration: mig, checks_total: b.checks.length, ok, fail: fail.length, failed_ids: fail.map(f => `${f.id}: ${f.detail}`) };
});
fs.writeFileSync(path.join(E, '04_exec-batch-verification.json'), JSON.stringify(batchSummary, null, 1));
console.log('evidencia consolidada →', path.join(E, '04_exec-consolidated.json'));
console.log(JSON.stringify(batchSummary, null, 1));
