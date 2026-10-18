#!/usr/bin/env node
/**
 * CP-SEC-027 — Verificación POST-MIGRACIÓN (read-only, sin escrituras).
 * Se ejecuta SOLO DESPUÉS de que el propietario autorice y aplique la
 * migración 20261019000001_cp_sec_027_catalogo_publico.sql a la BD viva.
 *
 * Comprueba, con la clave publishable (anon) contra PostgREST:
 *   1. products / stores / product_variants ya NO son legibles por anon (401/403).
 *   2. Las 3 vistas SÍ son legibles (200) y con las columnas esperadas.
 *   3. cost_average/precio_empresa AUSENTES del schema de las vistas.
 * Y vía Management API (read-only):
 *   4. Las policies anon de tabla desaparecieron; grants anon sobre tablas
 *      revocados; grants sobre vistas presentes.
 *
 * Uso: SUPABASE_ANON_KEY=<publishable> SUPABASE_ACCESS_TOKEN=<token> \
 *      node scripts/cpsec027_post_migration_verify.js
 * Salida: PASS/FAIL por aserción + resumen; exit 0 solo si TODO pasa.
 */
const REF = 'wthkddeleylijmonclxg';
const URL = `https://${REF}.supabase.co`;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ANON || !TOKEN) {
  console.error('FATAL: define SUPABASE_ANON_KEY y SUPABASE_ACCESS_TOKEN');
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail) {
  const mark = ok ? '✅' : '❌';
  if (!ok) failures++;
  console.log(`${mark} ${name}${detail ? ' — ' + detail : ''}`);
}

async function restGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  let body = null;
  try { body = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, body };
}

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}`);
  return res.json();
}

(async () => {
  console.log('══ CP-SEC-027 — Verificación post-migración (read-only) ══\n');

  // 1. Tablas inaccesibles para anon
  for (const t of ['products', 'stores', 'product_variants']) {
    const r = await restGet(`${t}?select=id&limit=1`);
    check(`anon NO puede leer tabla ${t}`, r.status === 401 || r.status === 403, `HTTP ${r.status}`);
  }
  const costAttempt = await restGet('products?select=id,cost_average&limit=1');
  check('cost_average inaccesible vía tabla', costAttempt.status === 401 || costAttempt.status === 403, `HTTP ${costAttempt.status}`);
  const tenantAttempt = await restGet('stores?select=id,tenant_id&limit=1');
  check('tenant_id inaccesible vía tabla stores', tenantAttempt.status === 401 || tenantAttempt.status === 403, `HTTP ${tenantAttempt.status}`);

  // 2. Vistas accesibles
  const cat = await restGet('public_catalog_v?select=id,name,price,price_currency,stock_current,store_id&limit=3');
  check('public_catalog_v legible por anon', cat.status === 200, `HTTP ${cat.status}, ${Array.isArray(cat.body) ? cat.body.length : '?'} filas`);
  const sto = await restGet('public_storefronts_v?select=slug,name&limit=3');
  check('public_storefronts_v legible por anon', sto.status === 200, `HTTP ${sto.status}`);
  const varr = await restGet('public_variants_v?select=id,product_id,name,price&limit=3');
  check('public_variants_v legible por anon', varr.status === 200, `HTTP ${varr.status}`);

  // 3. Columnas sensibles ausentes de las vistas (PostgREST lo reporta como error 400)
  const leak1 = await restGet('public_catalog_v?select=cost_average&limit=1');
  check('public_catalog_v SIN cost_average', leak1.status === 400, `HTTP ${leak1.status} (esperado 400: columna inexistente)`);
  const leak2 = await restGet('public_catalog_v?select=cost_price&limit=1');
  check('public_catalog_v SIN cost_price', leak2.status === 400, `HTTP ${leak2.status}`);
  const leak3 = await restGet('public_variants_v?select=precio_empresa&limit=1');
  check('public_variants_v SIN precio_empresa', leak3.status === 400, `HTTP ${leak3.status}`);
  const leak4 = await restGet('public_storefronts_v?select=tenant_id&limit=1');
  check('public_storefronts_v SIN tenant_id', leak4.status === 400, `HTTP ${leak4.status}`);
  const leak5 = await restGet('public_storefronts_v?select=bank_account&limit=1');
  check('public_storefronts_v SIN bank_account', leak5.status === 400, `HTTP ${leak5.status}`);

  // 4. Estado de policies/grants en la BD (Management API, read-only)
  const policies = await mgmtQuery(`
    SELECT tablename, policyname, roles, cmd FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('products','stores','product_variants')
    ORDER BY tablename, policyname;`);
  const polNames = (policies || []).map(p => p.policyname);
  check('policy products_public_read_anon retirada', !polNames.includes('products_public_read_anon'));
  check('policy stores_select_anon retirada', !polNames.includes('stores_select_anon'));
  // Ninguna policy viva sobre las 3 tablas puede incluir el rol anon
  const anonPolicies = (policies || []).filter(p => {
    const roles = Array.isArray(p.roles) ? p.roles.join(',') : String(p.roles || '');
    return /anon/i.test(roles);
  });
  check('ninguna policy de products/stores/product_variants incluye anon', anonPolicies.length === 0,
    anonPolicies.map(p => `${p.tablename}.${p.policyname}`).join(', ') || 'OK');
  const grants = await mgmtQuery(`
    SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon' AND privilege_type='SELECT'
      AND table_name IN ('products','stores','product_variants');`);
  check('grants SELECT anon sobre tablas revocados', (grants || []).length === 0, `${(grants || []).length} restantes`);
  const viewGrants = await mgmtQuery(`
    SELECT table_name FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon' AND privilege_type='SELECT'
      AND table_name IN ('public_catalog_v','public_storefronts_v','public_variants_v');`);
  const grantedViews = (viewGrants || []).map(g => g.table_name).sort();
  const expectedViews = ['public_catalog_v', 'public_storefronts_v', 'public_variants_v'].sort();
  check('grants SELECT anon sobre las 3 vistas presentes',
    JSON.stringify(grantedViews) === JSON.stringify(expectedViews), grantedViews.join(', '));

  console.log(`\n══ Resultado: ${failures === 0 ? 'TODO PASS — fix CP-SEC-027 verificado en vivo' : failures + ' FALLOS'} ══`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
