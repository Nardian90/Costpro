#!/usr/bin/env node
/**
 * r2-exec-verify.cjs — REM-R2-READ-EXEC · verificación POST por lote en LIVE
 *
 * Uso: node r2-exec-verify.cjs <migration_file.sql> "<fn1 fn2 ...>"
 *
 * Para cada función del lote:
 *  V1 captura fresca pg_get_functiondef == statement de la migración (byte)
 *  V2 acl/secdef/volatility/config/owner/argnames/rettype SIN CAMBIOS vs PRE
 *  V3 dependencia congelada: has_store_access e is_admin byte-idénticas a PRE
 *  V4 dinámico HTTP: service_role → 200 · anon → denegado (solo evidencia de
 *     status codes; NUNCA se vuelcan datos de negocio a la evidencia)
 *
 * CERO escrituras (las llamadas RPC son READ-only y service_role/anon).
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

const MIG_FILE = process.argv[2];
const FN_LIST = (process.argv[3] || '').split(/\s+/).filter(Boolean);
if (!MIG_FILE || FN_LIST.length === 0) { console.error('Uso: r2-exec-verify.cjs <migration.sql> "<fn...>"'); process.exit(2); }

const PRE = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/r2-exec-pre-live.json', 'utf8'));

const PARAMS = (sid) => ({
  get_cash_closures: { p_store_id: sid, p_date_from: null, p_date_to: null, p_limit: 1 },
  get_transfers: { p_store_id: sid, p_date_from: null, p_date_to: null, p_status: null, p_limit: 1 },
  get_store_analytics_advanced: { p_store_id: sid, p_start_date: null, p_end_date: null, p_days: 7 },
  get_sales_since_last_closure: { p_store_id: sid },
  get_paginated_products: { p_store_id: sid, p_search_term: '', p_category: '', p_limit: 1, p_offset: 0 },
  get_products_for_reception: { p_store_id: sid, p_search_term: '', p_page: 1, p_page_size: 1 },
  get_product_stock_ledger_paginated: { p_product_id: '00000000-0000-0000-0000-000000000000', p_store_id: sid, p_limit: 1, p_offset: 0 },
  get_daily_expenses_aggregated: { p_store_id: sid, p_date_from: null, p_date_to: null, p_limit: 1 },
  get_low_stock_count: { p_store_id: sid },
});

const SIGS = {
  get_cash_closures: 'public.get_cash_closures(uuid,date,date,integer)',
  get_transfers: 'public.get_transfers(uuid,timestamptz,timestamptz,text,integer)',
  get_store_analytics_advanced: 'public.get_store_analytics_advanced(uuid,date,date,integer)',
  get_sales_since_last_closure: 'public.get_sales_since_last_closure(uuid)',
  get_paginated_products: 'public.get_paginated_products(uuid,text,text,integer,integer)',
  get_products_for_reception: 'public.get_products_for_reception(uuid,text,integer,integer)',
  get_product_stock_ledger_paginated: 'public.get_product_stock_ledger_paginated(uuid,uuid,integer,integer)',
  get_daily_expenses_aggregated: 'public.get_daily_expenses_aggregated(uuid,date,date,integer)',
  get_low_stock_count: 'public.get_low_stock_count(uuid)',
};

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) { console.error('QUERY FAILED:', r.status, t.slice(0, 300)); process.exit(4); }
  return JSON.parse(t);
}

async function rpc(fn, params, key) {
  const r = await fetch(`${SBURL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return { status: r.status, text: (await r.text()).slice(0, 200) };
}

(async () => {
  const out = { at: new Date().toISOString(), migration: MIG_FILE, project_ref: PROJECT_REF, checks: [] };
  let fails = 0;
  const add = (id, ok, detail) => { out.checks.push({ id, ok, detail }); if (!ok) fails++; };

  // tienda real para el smoke (SELECT-only)
  const store = await q(`SELECT id FROM public.stores WHERE is_active = true ORDER BY created_at LIMIT 1;`);
  const SID = store[0].id;
  out.smoke_store_id = SID;

  for (const f of FN_LIST) {
    const rows = await q(`
      SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS def,
             COALESCE(array_to_string(p.proacl, ','), 'NULL') AS acl, p.prosecdef AS secdef,
             p.provolatile AS volatility, COALESCE(p.proconfig::text,'-') AS config,
             pg_get_userbyid(p.proowner) AS owner, COALESCE(p.proargnames,'{}') AS argnames,
             pg_get_function_result(p.oid) AS rettype
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='${f}' ORDER BY 1;`);
    if (rows.length !== 1) { add(`V0 ${f}`, false, `overloads=${rows.length}`); continue; }
    const cur = rows[0];

    // V1: def == migración
    const mig = fs.readFileSync(MIG_FILE, 'utf8');
    const stmts = mig.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g) || [];
    const mine = stmts.find(s => s.includes(`public.${f}(`));
    const eq = !!mine && cur.def.replace(/\s+$/, '') === mine.replace(/\$function\$;\s*$/, '$function$').replace(/\s+$/, '');
    add(`V1 ${f}`, eq, eq ? 'def LIVE == migración (byte)' : 'def LIVE != migración');

    // V2: campos no-cuerpo sin cambios vs PRE
    const pre = PRE.funcs[f][0];
    const sameMeta = ['acl', 'secdef', 'volatility', 'config', 'owner', 'argnames', 'rettype']
      .every(k => String(pre[k]) === String(cur[k]));
    add(`V2 ${f}`, sameMeta, sameMeta ? 'acl/secdef/volatility/config/owner/args/rettype intactos' : 'META CAMBIADA');
    out.checks.push({ id: `V2 ${f} detail`, ok: true, detail: { acl: cur.acl, secdef: cur.secdef, volatility: cur.volatility, config: cur.config } });

    // V3: guard presente exactamente una vez
    const guards = (cur.def.match(/REM-R2-READ: authorization barrier/g) || []).length;
    const has42501 = cur.def.includes("'ERR_UNAUTHORIZED_STORE: NULL'") && cur.def.includes("'ERR_UNAUTHORIZED_STORE: %'");
    add(`V3 ${f}`, guards === 1 && has42501, `guard×${guards}, 42501 msgs: ${has42501}`);

    // V4: dinámico HTTP
    const ps = PARAMS(SID)[f];
    const sr = await rpc(f, ps, SRK);
    add(`V4 ${f} service_role`, sr.status === 200, `HTTP ${sr.status}`);
    const an = await rpc(f, ps, ANON);
    const anonOk = [401, 403].includes(an.status) || /permission denied/i.test(an.text);
    add(`V4 ${f} anon`, anonOk, `HTTP ${an.status} ${anonOk ? '(denegado)' : an.text.slice(0, 80)}`);
    await new Promise(r => setTimeout(r, 300));
  }

  // dependencia congelada (siempre)
  for (const dep of ['has_store_access', 'is_admin']) {
    const rows = await q(`
      SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${dep}';`);
    const eq = rows[0].def.replace(/\s+$/, '') === PRE.funcs[dep][0].def.replace(/\s+$/, '');
    add(`FREEZE ${dep}`, eq, eq ? 'byte-idéntica a PRE (congelada)' : 'CAMBIADA — SUPERFICIE CRÍTICA');
  }

  console.log(JSON.stringify(out.checks, null, 1));
  fs.writeFileSync(`/home/z/my-project/scripts/r2-exec-verify-$(date +%s).json`.replace('$(date +%s)', String(Date.now())), JSON.stringify(out, null, 1));
  console.log(`\nBATCH VERIFY: ${out.checks.filter(c => c.id.startsWith('V') || c.id.startsWith('FREEZE')).filter(c => c.ok).length} OK / ${fails} FAIL`);
  process.exit(fails > 0 ? 1 : 0);
})();
