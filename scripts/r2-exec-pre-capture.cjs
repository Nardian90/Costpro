#!/usr/bin/env node
/**
 * r2-exec-pre-capture.cjs — REM-R2-READ-EXEC · PRE-captura (SELECT-only)
 *
 * 1. Captura fresca LIVE de las 9 FINDINGS + has_store_access + is_admin
 *    (dependencia del guard) vía Management API.
 * 2. Byte-compare defs/ACL/secdef/config/volatility contra la captura
 *    CONGELADA de prep (03_prep-live-capture.json).
 *    → Cero drift esperado. Si hay drift en alguna finding: STOP (exit 5).
 * 3. Output → /home/z/my-project/scripts/r2-exec-pre-live.json
 *
 * CERO escrituras en producción.
 */
const fs = require('fs');

const env = {};
for (const line of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PROJECT_REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

console.log(`ALCANCE: PRODUCCIÓN LIVE ref=${PROJECT_REF} — SOLO SELECT (read-only)`);

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) { console.error('QUERY FAILED:', r.status, t.slice(0, 400)); process.exit(4); }
  return JSON.parse(t);
}

const FINDINGS = [
  'get_cash_closures',
  'get_transfers',
  'get_store_analytics_advanced',
  'get_sales_since_last_closure',
  'get_paginated_products',
  'get_products_for_reception',
  'get_product_stock_ledger_paginated',
  'get_daily_expenses_aggregated',
  'get_low_stock_count',
];
const DEPS = ['has_store_access', 'is_admin'];

(async () => {
  const ev = {
    project_ref: PROJECT_REF,
    at: new Date().toISOString(),
    scope: 'PRODUCTION LIVE (Management API, SELECT-only)',
    purpose: 'REM-R2-READ-EXEC — PRE-capture + drift check vs frozen 03_prep-live-capture.json',
    funcs: {},
    exec_grants_detail: {},
    drift_check: {},
  };

  const ALL = [...FINDINGS, ...DEPS];
  for (const f of ALL) {
    const rows = await q(`
      SELECT p.oid::regprocedure::text AS signature,
             pg_get_functiondef(p.oid) AS def,
             COALESCE(array_to_string(p.proacl, ','), 'NULL(all revoked)') AS acl,
             p.prosecdef AS secdef,
             p.provolatile AS volatility,
             COALESCE(p.proconfig::text,'-') AS config,
             pg_get_userbyid(p.proowner) AS owner,
             COALESCE(p.proargnames, '{}') AS argnames,
             pg_get_function_arguments(p.oid) AS args_full,
             pg_get_function_result(p.oid) AS rettype,
             p.pronargs AS nargs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='${f}'
      ORDER BY 1;`);
    ev.funcs[f] = rows;
    console.log(`  captured ${f}: ${rows.length} overload(s)`);
  }

  for (const f of FINDINGS) {
    const rows2 = await q(`
      SELECT p.oid::regprocedure::text AS signature,
             CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END AS grantee_role,
             g.privilege_type
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) g
      WHERE n.nspname='public' AND p.proname='${f}'
      ORDER BY 1, 2, 3;`);
    ev.exec_grants_detail[f] = rows2;
  }

  // ── Drift check vs congelado ──────────────────────────────────────────
  const frozen = JSON.parse(fs.readFileSync(
    '/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE/03_prep-live-capture.json', 'utf8'));

  let drift = 0;
  for (const f of FINDINGS) {
    const fr = frozen.funcs[f] || [];
    const nw = ev.funcs[f] || [];
    if (fr.length !== nw.length) {
      console.error(`  DRIFT ${f}: overload count ${fr.length} -> ${nw.length}`);
      ev.drift_check[f] = 'OVERLOAD_COUNT_CHANGED'; drift++; continue;
    }
    let same = true; const diffs = [];
    for (let i = 0; i < fr.length; i++) {
      for (const k of ['signature', 'def', 'acl', 'secdef', 'volatility', 'config', 'owner', 'argnames', 'args_full', 'rettype', 'nargs']) {
        if (String(fr[i][k]) !== String(nw[i][k])) { same = false; diffs.push(k); }
      }
    }
    ev.drift_check[f] = same ? 'IDENTICAL' : `CHANGED:${diffs.join(',')}`;
    if (!same) { drift++; console.error(`  DRIFT ${f}: ${diffs.join(',')}`); }
    else console.log(`  drift-check ${f}: IDENTICAL (${fr[0].def.length} bytes def)`);
  }
  // dependencia has_store_access debe estar intacta vs congelada
  {
    const fr = frozen.funcs['has_store_access'] || [];
    const nw = ev.funcs['has_store_access'] || [];
    const same = fr.length === nw.length && fr.length === 1 &&
      ['signature','def','acl','secdef','volatility','config','owner'].every(k => String(fr[0][k]) === String(nw[0][k]));
    ev.drift_check['has_store_access'] = same ? 'IDENTICAL' : 'CHANGED (CRITICAL SURFACE)';
    if (!same) { drift++; console.error('  DRIFT has_store_access — SUPERFICIE CRÍTICA, STOP'); }
    else console.log('  drift-check has_store_access: IDENTICAL (dependencia congelada intacta)');
  }

  fs.writeFileSync('/home/z/my-project/scripts/r2-exec-pre-live.json', JSON.stringify(ev, null, 1));
  console.log('\nEvidencia PRE → /home/z/my-project/scripts/r2-exec-pre-live.json');
  console.log(`DRIFT TOTAL: ${drift}`);
  if (drift > 0) { console.error('⛔ STOP — drift detectado contra captura congelada de prep'); process.exit(5); }
  console.log('✅ Cero drift — las 9 findings y has_store_access están byte-idénticas a la congelada de prep.');
})();
