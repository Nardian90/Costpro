#!/usr/bin/env node
/**
 * f2bug-post-verify.cjs — REM-R2-F2BUG-FIX · verificación POST en LIVE
 *
 * 1. Captura get_transfers de LIVE → byte == statement de la migración
 * 2. Meta intacta vs PRE de este ciclo (acl/secdef/volatility/config/
 *    owner/argnames/args_full/rettype)
 * 3. Deps congeladas: has_store_access + is_admin byte-idénticas al PRE
 * 4. Las otras 8 findings R2: byte-idénticas al congelado POST-R2
 *    (04_exec-consolidated.json) — el fix no las toca
 * 5. Dinámico PostgREST: service_role → HTTP 200 con JSON (42883 eliminado);
 *    anon → 401
 * 6. Guard R2 presente (4 sondas) + fix presente (t.status::text)
 * Output → /home/z/my-project/scripts/f2bug-post-verify.json
 */
const fs = require('fs');

const env = {};
for (const line of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PROJECT_REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const SBURL = env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
async function rpc(fn, params, key) {
  const r = await fetch(`${SBURL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return { status: r.status, text: (await r.text()).slice(0, 300) };
}

let fails = 0;
const checks = [];
const add = (id, ok, detail) => { checks.push({ id, ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`); if (!ok) fails++; };

const FN_SQL = (name, args) => `
  SELECT p.proname AS name,
    pg_get_functiondef(p.oid) AS def,
    array_to_string(p.proacl, ',') AS acl,
    p.prosecdef AS secdef,
    p.provolatile AS volatility,
    p.proconfig AS config,
    pg_get_userbyid(p.proowner) AS owner,
    p.proargnames AS argnames,
    pg_get_function_arguments(p.oid) AS args_full,
    pg_get_function_result(p.oid) AS rettype,
    to_regprocedure('${name}(${args})')::regprocedure::text AS signature
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '${name}';`;

const normConfig = (c) => {
  if (Array.isArray(c)) return JSON.stringify(c);
  if (typeof c === 'string') {
    const s = c.trim();
    if (s.startsWith('[')) { try { const v = JSON.parse(s); if (Array.isArray(v)) return JSON.stringify(v); } catch {} }
    if (s.startsWith('{') && s.endsWith('}')) {
      const inner = s.slice(1, -1);
      const parts = inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g) || [];
      return JSON.stringify(parts.map(p => p.trim().replace(/^"|"$/g, '')));
    }
    return s;
  }
  return JSON.stringify(c);
};

const OTHER_FINDINGS = ['get_cash_closures', 'get_store_analytics_advanced', 'get_sales_since_last_closure',
  'get_paginated_products', 'get_products_for_reception', 'get_product_stock_ledger_paginated',
  'get_daily_expenses_aggregated', 'get_low_stock_count'];
const ARGS = {
  get_cash_closures: 'uuid,date,date,integer',
  get_store_analytics_advanced: 'uuid,date,date,integer',
  get_sales_since_last_closure: 'uuid',
  get_paginated_products: 'uuid,text,text,integer,integer',
  get_products_for_reception: 'uuid,text,integer,integer',
  get_product_stock_ledger_paginated: 'uuid,uuid,integer,integer',
  get_daily_expenses_aggregated: 'uuid,date,date,integer',
  get_low_stock_count: 'uuid',
  has_store_access: 'uuid',
  is_admin: '',
  get_transfers: 'uuid,timestamptz,timestamptz,text,integer',
};

(async () => {
  const out = { at: new Date().toISOString(), migration: '20260916000008_rem_f2bug_transfers_status_cast.sql', project_ref: PROJECT_REF, checks };
  const pre = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/f2bug-pre-live.json', 'utf8'));
  const frozen = JSON.parse(fs.readFileSync('/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE/04_exec-consolidated.json', 'utf8'));
  const migSql = fs.readFileSync('/home/z/my-project/Costpro/supabase/migrations/20260916000008_rem_f2bug_transfers_status_cast.sql', 'utf8');
  const migStmt = migSql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g)[0]
    .replace(/\$function\$;\s*$/, '$function$').replace(/\s+$/, '');

  // 1) byte vs migración
  const gt = (await q(FN_SQL('get_transfers', ARGS.get_transfers)))[0];
  add('V1 def LIVE == migración', gt.def.replace(/\s+$/, '') === migStmt, 'byte-equal');

  // 2) meta intacta vs PRE
  for (const k of ['acl', 'secdef', 'volatility', 'owner', 'args_full', 'rettype', 'argnames']) {
    const a = JSON.stringify(gt[k]), b = JSON.stringify(pre.get_transfers[k]);
    add(`V2 meta.${k} intacta`, a === b, a === b ? 'idéntica al PRE' : `PRE=${b} LIVE=${a}`);
  }
  add('V2 meta.config intacta', normConfig(gt.config) === normConfig(pre.get_transfers.config), 'semánticamente idéntica');

  // 3) guard + fix presentes
  for (const p of ["auth.role() <> 'service_role'", 'p_store_id IS NULL', 'public.has_store_access(p_store_id)', "ERRCODE = '42501'"]) {
    add(`V3 guard «${p.slice(0, 34)}»`, gt.def.includes(p), gt.def.includes(p) ? 'presente' : 'AUSENTE');
  }
  add('V3 fix «t.status::text = p_status»', gt.def.includes('t.status::text = p_status'), gt.def.includes('t.status::text = p_status') ? 'presente' : 'AUSENTE');
  add('V3 sin rastro de línea rota', !gt.def.includes('OR t.status = p_status)'), !gt.def.includes('OR t.status = p_status)'));

  // 4) deps congeladas
  for (const [name, args] of [['has_store_access', 'uuid'], ['is_admin', '']]) {
    const d = (await q(FN_SQL(name, args)))[0];
    add(`V4 dep ${name} byte-idéntica`, d.def.replace(/\s+$/, '') === pre.deps[name].def.replace(/\s+$/, ''), 'FREEZE ok');
  }

  // 4b) otras 8 findings intactas vs congelado POST-R2
  for (const f of OTHER_FINDINGS) {
    const d = (await q(FN_SQL(f, ARGS[f])))[0];
    const fr = frozen.post_capture.funcs[f]['0'];
    const eq = d.def.replace(/\s+$/, '') === fr.def.replace(/\s+$/, '');
    add(`V5 ${f} intacta (vs POST-R2)`, eq, eq ? 'byte-idéntica' : 'DRIFT — el fix tocó algo que no debía');
  }

  // 5) dinámico PostgREST
  const store = await q(`SELECT id FROM public.stores WHERE is_active = true ORDER BY created_at LIMIT 1;`);
  const SID = store[0].id;
  out.smoke_store_id = SID;
  const sr = await rpc('get_transfers', { p_store_id: SID, p_date_from: null, p_date_to: null, p_status: null, p_limit: 10 }, SRK);
  const srOk = sr.status === 200 && (sr.text.startsWith('[') || sr.text.startsWith('{'));
  add('V6 service_role get_transfers → HTTP 200', srOk, srOk ? `HTTP 200 (42883 eliminado) body=${sr.text.slice(0, 60)}` : `HTTP ${sr.status} ${sr.text.slice(0, 80)}`);
  const srF = await rpc('get_transfers', { p_store_id: SID, p_date_from: null, p_date_to: null, p_status: 'PENDIENTE', p_limit: 10 }, SRK);
  add('V6 service_role con filtro PENDIENTE → HTTP 200', srF.status === 200, `HTTP ${srF.status}`);
  const an = await rpc('get_transfers', { p_store_id: SID, p_date_from: null, p_date_to: null, p_status: null, p_limit: 10 }, ANON);
  add('V7 anon denegado', an.status === 401 || an.status === 403, `HTTP ${an.status}`);

  out.summary = { fails, total: checks.length, at: out.at };
  fs.writeFileSync('/home/z/my-project/scripts/f2bug-post-verify.json', JSON.stringify(out, null, 1));
  console.log(`\nPOST-VERIFY: ${checks.length - fails}/${checks.length} OK, ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
