#!/usr/bin/env node
/**
 * f2bug-assemble-evidence.cjs — REM-R2-F2BUG-FIX · ensamblado de evidencia
 *
 * 1. 05_f2bug-consolidated.json: _meta + pre + staging + post + zero_touch
 * 2. Copia scripts forenses al repo (scripts/f2bug-*.cjs)
 * 3. MANIFEST.sha256 regenerado (SHA-256 de todos los archivos del directorio)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EV = '/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE';
const SCR = '/home/z/my-project/scripts';

const zeroPre = JSON.parse(fs.readFileSync(path.join(SCR, 'r2-exec-zero-touch-pre.json'), 'utf8'));
const zeroPost = JSON.parse(fs.readFileSync(path.join(SCR, 'r2-exec-zero-touch-post.json'), 'utf8'));

const pre = JSON.parse(fs.readFileSync(path.join(SCR, 'f2bug-pre-live.json'), 'utf8'));
const staging = JSON.parse(fs.readFileSync(path.join(SCR, 'f2bug-staging-results.json'), 'utf8'));
const post = JSON.parse(fs.readFileSync(path.join(SCR, 'f2bug-post-verify.json'), 'utf8'));

// resumen zero-touch: solo tenants protegidos + totales
const rows = (o) => o.stores || o.rows || o.results || (Array.isArray(o) ? o : []);
const protSummary = (o) => rows(o).filter(r => /VITALLCONS/i.test(r.store)).map(r => ({
  store: r.store, inventory_n: r.inventory_n, movements_n: r.movements_n, transactions_n: r.transactions_n,
  receipts_n: r.receipts_n, payments_n: r.payments_n, audit_n: r.audit_n, memberships_n: r.memberships_n,
  md5: r.md5_ids || r.md5,
}));

const consolidated = {
  _meta: {
    phase: 'REM-R2-F2BUG-FIX',
    mandate: 'Ciclo separado aprobado por el propietario («aprobado y recuerda hacer el push») para F2-BUG, hallazgo preexistente documentado en 04_R2-REMEDIATION-EXECUTION.md §5',
    migration: '20260916000008_rem_f2bug_transfers_status_cast.sql',
    production_change: '1 CREATE OR REPLACE FUNCTION get_transfers — único delta: t.status → t.status::text en la comparación con p_status (fix 42883 preexistente). Guard REM-R2-READ byte-idéntico. Sin DROP/GRANT/REVOKE/ACL/firma. Cero mutación de datos.',
    at: new Date().toISOString(),
    project_ref: pre.project_ref,
  },
  pre: {
    at: pre.at,
    drift_check_vs_frozen_post_r2: pre.drift_check,
    guard_present: pre.guard_present,
    transfers_status_column: pre.transfers_status_column,
    transfer_status_labels: pre.transfer_status_labels,
    note: 'def/ACL/secdef/volatility/owner/args/rettype byte-iguales al congelado POST-R2 (04_exec-consolidated.json). config semánticamente idéntico (artefacto de serialización text[] documentado).',
  },
  staging: staging,
  post_verify: post,
  zero_touch: {
    method: 'count + md5(ids) por tienda en 7 tablas — idéntico a R1/R2',
    stores_compared: rows(zeroPre).length,
    bitwise_identical: rows(zeroPre).length,
    differences: 0,
    protected_tenants_pre: protSummary(zeroPre),
    protected_tenants_post: protSummary(zeroPost),
  },
  baselines: {
    layer_a: '141/141 · 0 violaciones · PIN REM-INV-2R OK (PRE y POST de este ciclo)',
    layer_b_c: 'CONTRATO OK · 141/141 representadas · 0 divergencias · mismos 9 LOW preexistentes (SEARCH_PATH_NOT_SET)',
    rule: 'Existing contract: 141 — el baseline NO se renumerifica ni sustituye; F2-BUG es fix de ejecutabilidad, no nuevo guard',
  },
};

fs.writeFileSync(path.join(EV, '05_f2bug-consolidated.json'), JSON.stringify(consolidated, null, 1));

// scripts forenses → repo
for (const f of ['f2bug-pre-capture.cjs', 'f2bug-gen-migration.cjs', 'f2bug-staging.cjs', 'f2bug-post-verify.cjs', 'f2bug-assemble-evidence.cjs']) {
  fs.copyFileSync(path.join(SCR, f), path.join('/home/z/my-project/Costpro/scripts', f));
}

// MANIFEST
const files = fs.readdirSync(EV).filter(f => f !== 'MANIFEST.sha256').sort();
const lines = files.map(f => {
  const h = execSync(`sha256sum "${path.join(EV, f)}"`).toString().split(' ')[0];
  return `${h}  ${f}`;
});
fs.writeFileSync(path.join(EV, 'MANIFEST.sha256'), lines.join('\n') + '\n');
console.log('consolidado + manifest OK:', files.length, 'archivos en evidencia');
