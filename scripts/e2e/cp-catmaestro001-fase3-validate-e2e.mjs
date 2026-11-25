#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 — FASE 3 · Validación en BD AISLADA (E2E)
 * ============================================================================
 * Aplica la migración 20261125131000 al proyecto aislado CostproE2E y valida
 * el backend completo de la edición de borradores (patrón canónico del repo:
 * fixture determinista + impersonación de usuario autenticado vía set_config):
 *
 *   A. add_reception_items: alta de producto EXISTENTE de la tienda.
 *   B. Idempotencia: reenvío del lote idéntico → salto, sin duplicar.
 *   C. Duplicado con datos distintos → ERR_PRODUCT_ALREADY_IN_RECEIPT.
 *   D. Producto inexistente/ajeno → ERR_PRODUCT_NOT_IN_STORE.
 *   E. Producto NUEVO sin SKU → maestro con código OFICIAL consecutivo +
 *      fila local vinculada + línea en la recepción.
 *   F. CONCURRENCIA: dos llamadas PARALELAS con productos nuevos → códigos
 *      oficiales distintos y consecutivos (advisory lock, sin colisiones).
 *   G. Fail-closed atómico: fila bloqueada (ERR_NAME_MATCH_REQUIRES_REVIEW)
 *      → NADA se crea (ni maestro ni línea).
 *   H. ERR_NOT_EDITABLE sobre recepción confirmada (active).
 *   I. save_pending_reception_changes: cabecera + cantidad + alta NUEVA en
 *      UNA transacción.
 *   J. Autorización: usuario autenticado SIN acceso a la tienda → ERR_UNAUTHORIZED.
 *   K. Cero inventario: sin stock_movements por editar el borrador.
 *
 * Uso: node scripts/e2e/cp-catmaestro001-fase3-validate-e2e.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const E2E_REF = 'lguovmvrozxgssupkwpf';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

// CP-INFRA-011: guard fail-closed de BD aislada (el script solo opera sobre
// el proyecto CostproE2E — nunca producción).
const require2 = createRequire(import.meta.url);
const { assertIsolatedDb } = require2('../../e2e/fixtures/assert-isolated-db.cjs');
if (process.env.E2E_ALLOWED_REMOTE_REF && process.env.E2E_ALLOWED_REMOTE_REF !== E2E_REF) {
  console.error('FALLO: E2E_ALLOWED_REMOTE_REF no coincide con el ref del script');
  process.exit(2);
}
await assertIsolatedDb();

const api = `https://api.supabase.com/v1/projects/${E2E_REF}/database/query`;

async function execSql(sql) {
  const res = await fetch(api, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 700)}`);
  try {
    const rows = JSON.parse(text);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
async function tryExecSql(sql) {
  try { return { ok: true, rows: await execSql(sql) }; }
  catch (e) { return { ok: false, err: e.message }; }
}

/** Impersonación de usuario autenticado en UN solo statement (patrón
 *  canónico del repo: CTE con set_config + LATERAL del RPC). */
function asAuth(rpcSql, uid) {
  const claims = JSON.stringify({ role: 'authenticated', sub: uid });
  return `WITH setup AS (
    SELECT set_config('role','authenticated',false) AS a,
           set_config('request.jwt.claims', '${claims}', false) AS b,
           set_config('request.jwt.claim.sub', '${uid}', false) AS c
  )
  SELECT r.* FROM setup, LATERAL (${rpcSql}) r;`;
}

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? '✓' : '✗ FALLO'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) process.exitCode = 1;
}

const T = '44444444-4444-4444-8444-444444444444'; // tenant fixture
const S = '55555555-5555-4555-8555-555555555555'; // store fixture
const R = '66666666-6666-4666-8666-666666666666'; // recepción pendiente
const R2 = '77777777-7777-4777-8777-777777777777'; // recepción confirmada
const UID = '88888888-8888-4888-8888-888888888888'; // encargado (con acceso)
const UID2 = '99999999-9999-4999-8999-999999999999'; // usuario SIN acceso
const M_EXIST = 'aaaa0002-0000-4000-8000-000000000001';
const M_EXIST2 = 'aaaa0002-0000-4000-8000-000000000002';
const M_SAME_NAME = 'aaaa0002-0000-4000-8000-000000000003'; // colisión de nombre (G)

const cleanup = async () => {
  await execSql(`SET session_replication_role = replica;
    DELETE FROM public.receipt_items WHERE receipt_id IN ('${R}', '${R2}');
    DELETE FROM public.receipts WHERE id IN ('${R}', '${R2}');
    DELETE FROM public.products WHERE store_id = '${S}';
    DELETE FROM public.master_change_log WHERE tenant_id = '${T}';
    DELETE FROM public.master_products WHERE tenant_id = '${T}';
    DELETE FROM public.audit_logs WHERE store_id = '${S}';
    DELETE FROM public.user_store_memberships WHERE user_id IN ('${UID}','${UID2}');
    DELETE FROM public.catalog_store_links WHERE store_id = '${S}';
    DELETE FROM public.stores WHERE id = '${S}';
    DELETE FROM public.tenants WHERE id = '${T}';
    DELETE FROM public.profiles WHERE id IN ('${UID}','${UID2}');
    DELETE FROM auth.users WHERE id IN ('${UID}','${UID2}');
    SET session_replication_role = DEFAULT;`);
};

(async () => {
  console.log('=== CP-CATMAESTRO-001 · FASE 3 · validación BD aislada ===');
  try { await cleanup(); } catch { /* primera ejecución */ }

  // 0. Migración.
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261125131000_cp_catmaestro001_add_reception_items.sql'), 'utf8');
  await execSql(sql);
  await execSql("NOTIFY pgrst, 'reload schema'");
  check('migración aplicada', true);

  // 1. Fixture (patrón verify-catalogo-identidad-pg.mjs). La BD aislada
  // crea el perfil automáticamente al insertar auth.users (trigger estándar
  // de Supabase) — por eso el ON CONFLICT en profiles.
  await execSql(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
    VALUES ('${UID}', 'catmaestro-f3-enc@example.invalid', 'x', now(), now(), now(), '{"name":"F3 enc"}'::jsonb);
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
    VALUES ('${UID2}', 'catmaestro-f3-out@example.invalid', 'x', now(), now(), now(), '{"name":"F3 out"}'::jsonb);
    INSERT INTO public.profiles (id, role) VALUES ('${UID}', 'usuario'), ('${UID2}', 'usuario')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.tenants (id, name, owner_id) VALUES ('${T}', 'ORG F3', '${UID}');
    INSERT INTO public.stores (id, tenant_id, name, is_active) VALUES ('${S}', '${T}', 'Tienda F3', true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES ('${UID}', '${S}', 'encargado', 'active');
    INSERT INTO public.catalog_store_links (tenant_id, store_id, status, connected_at, created_at, updated_at)
      VALUES ('${T}', '${S}', 'connected', now(), now(), now());`);

  // Maestros numéricos 1..3 (prefijo contiguo) + 3 con fila local.
  let vals = '';
  for (let i = 1; i <= 3; i++) vals += `('${T}', '${i}', 'Numerico ${i}', 'active'),`;
  vals = vals.replace(/,$/, '');
  await execSql(`INSERT INTO public.master_products (tenant_id, sku, name, status) VALUES ${vals};
    INSERT INTO public.master_products (id, tenant_id, sku, name, status)
    VALUES ('${M_EXIST}', '${T}', '10', 'Producto F3 existente', 'active'),
           ('${M_EXIST2}', '${T}', '11', 'Producto F3 existente 2', 'active'),
           ('${M_SAME_NAME}', '${T}', '12', 'Nombre Colision F3', 'active');`);

  const locals = {};
  for (const [mid, sku, name] of [[M_EXIST, '10', 'Producto F3 existente'], [M_EXIST2, '11', 'Producto F3 existente 2']]) {
    const rows = await execSql(`INSERT INTO public.products
      (store_id, tenant_id, master_product_id, sku, name, price, cost_price, cost_average, stock_current, is_active, unit_of_measure)
      VALUES ('${S}', '${T}', '${mid}', '${sku}', '${name}', 5, 1, 1, 3, true, 'unidad') RETURNING id;`);
    locals[sku] = rows[0].id;
  }

  await execSql(`INSERT INTO public.receipts (id, store_id, user_id, status, total_cost, supplier, reception_date)
    VALUES ('${R}', '${S}', '${UID}', 'pending', 2, 'Proveedor F3', current_date);
    INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost)
    VALUES ('${R}', '${locals['10']}', 2, 1);
    INSERT INTO public.receipts (id, store_id, user_id, status, total_cost, supplier, reception_date)
    VALUES ('${R2}', '${S}', '${UID}', 'active', 1, 'Proveedor F3', current_date);
    INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost)
    VALUES ('${R2}', '${locals['10']}', 1, 1);`);
  check('fixture creado', true);

  // A. Alta de producto existente.
  const a = await execSql(asAuth(`SELECT public.add_reception_items('${R}',
    '[{"product_id":"${locals['11']}","quantity":4,"unit_cost":2}]'::jsonb, NULL) AS res`, UID));
  const aRes = a[0].res;
  check('A. alta de existente: added=1, total 2+8=10', aRes.added_count === 1 && Number(aRes.new_total) === 10,
    `added=${aRes.added_count} total=${aRes.new_total}`);

  // B. Idempotencia.
  const b = await execSql(asAuth(`SELECT public.add_reception_items('${R}',
    '[{"product_id":"${locals['11']}","quantity":4,"unit_cost":2}]'::jsonb, NULL) AS res`, UID));
  check('B. idempotencia: skipped=1, added=0', b[0].res.idempotent_skipped === 1 && b[0].res.added_count === 0,
    `skipped=${b[0].res.idempotent_skipped}`);

  // C. Duplicado con otros datos.
  const c = await tryExecSql(asAuth(`SELECT public.add_reception_items('${R}',
    '[{"product_id":"${locals['11']}","quantity":9,"unit_cost":2}]'::jsonb, NULL) AS res`, UID));
  check('C. duplicado distinto → ERR_PRODUCT_ALREADY_IN_RECEIPT', !c.ok && /ERR_PRODUCT_ALREADY_IN_RECEIPT/.test(c.err),
    c.err?.slice(0, 80));

  // D. Producto inexistente.
  const d = await tryExecSql(asAuth(`SELECT public.add_reception_items('${R}',
    '[{"product_id":"12345678-1234-4123-8123-123456789012","quantity":1,"unit_cost":1}]'::jsonb, NULL) AS res`, UID));
  check('D. producto ajeno/inexistente → ERR_PRODUCT_NOT_IN_STORE', !d.ok && /ERR_PRODUCT_NOT_IN_STORE/.test(d.err));

  // E. Producto nuevo sin SKU → código oficial.
  const e = await execSql(asAuth(`SELECT public.add_reception_items('${R}',
    '[{"sku":null,"name":"Producto nuevo F3 A","quantity":2,"unit_cost":3}]'::jsonb, NULL) AS res`, UID));
  const eRes = e[0].res;
  const eLine = (eRes.items || [])[0] || {};
  check('E. nuevo sin SKU: added=1 con código oficial 4', eRes.added_count === 1 && eLine.sku === '4',
    `sku=${eLine.sku} assigned_by_server=${eLine.sku_assigned_by_server}`);
  const eMaster = await execSql(`SELECT mp.sku, p.sku AS local_sku
    FROM public.master_products mp JOIN public.products p ON p.master_product_id = mp.id
    WHERE mp.tenant_id='${T}' AND mp.sku = '4';`);
  check('E. maestro 4 + fila local vinculada sincronizada',
    eMaster.length === 1 && eMaster[0].sku === eMaster[0].local_sku);
  const eItem = await execSql(`SELECT COUNT(*) AS n FROM public.receipt_items ri
    WHERE ri.receipt_id='${R}' AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = ri.product_id AND p.sku='4');`);
  check('E. línea insertada para el producto nuevo', eItem[0].n === 1, `n=${eItem[0].n}`);

  // F. CONCURRENCIA: dos llamadas paralelas con productos nuevos.
  const [f1, f2] = await Promise.all([
    execSql(asAuth(`SELECT public.add_reception_items('${R}',
      '[{"sku":null,"name":"Producto nuevo F3 B","quantity":1,"unit_cost":1}]'::jsonb, NULL) AS res`, UID)),
    execSql(asAuth(`SELECT public.add_reception_items('${R}',
      '[{"sku":null,"name":"Producto nuevo F3 C","quantity":1,"unit_cost":1}]'::jsonb, NULL) AS res`, UID)),
  ]);
  const f1Sku = ((f1[0].res.items || [])[0] || {}).sku;
  const f2Sku = ((f2[0].res.items || [])[0] || {}).sku;
  check('F. concurrencia: códigos distintos (5,6) sin colisión',
    f1Sku && f2Sku && f1Sku !== f2Sku && [f1Sku, f2Sku].sort().join(',') === '5,6',
    `f1=${f1Sku} f2=${f2Sku}`);
  const fMasters = await execSql(`SELECT COUNT(*) AS n FROM public.master_products WHERE tenant_id='${T}' AND sku IN ('5','6');`);
  const fLocals = await execSql(`SELECT COUNT(*) AS n FROM public.products WHERE store_id='${S}' AND sku IN ('5','6');`);
  check('F. un maestro y una fila local por código', fMasters[0].n === 2 && fLocals[0].n === 2,
    `masters=${fMasters[0].n} locals=${fLocals[0].n}`);

  // G. Fail-closed atómico: nombre que colisiona con maestro existente.
  const before = await execSql(`SELECT COUNT(*) AS n FROM public.master_products WHERE tenant_id='${T}';`);
  const g = await tryExecSql(asAuth(`SELECT public.add_reception_items('${R}',
    '[{"sku":null,"name":"Nombre Colision F3","quantity":1,"unit_cost":1}]'::jsonb, NULL) AS res`, UID));
  const after = await execSql(`SELECT COUNT(*) AS n FROM public.master_products WHERE tenant_id='${T}';`);
  check('G. fila bloqueada → error sin crear NADA (transacción revertida)',
    !g.ok && after[0].n === before[0].n,
    `${(g.err || '').slice(0, 60)}… masters ${before[0].n}→${after[0].n}`);

  // H. Recepción confirmada → ERR_NOT_EDITABLE.
  const h = await tryExecSql(asAuth(`SELECT public.add_reception_items('${R2}',
    '[{"product_id":"${locals['11']}","quantity":1,"unit_cost":1}]'::jsonb, NULL) AS res`, UID));
  check('H. confirmada → ERR_NOT_EDITABLE', !h.ok && /ERR_NOT_EDITABLE/.test(h.err));

  // I. save_pending_reception_changes: cabecera + cantidad + alta en UNA.
  const firstItem = await execSql(`SELECT id FROM public.receipt_items WHERE receipt_id='${R}' ORDER BY created_at LIMIT 1;`);
  const i2 = await execSql(asAuth(`SELECT public.save_pending_reception_changes('${R}',
    '{"supplier":"Proveedor F3 EDITADO","reference_doc":"FAC-EDIT-3"}'::jsonb,
    '[{"id":"${firstItem[0].id}","quantity":5,"unit_cost":1,"deleted":false}]'::jsonb,
    '[{"sku":null,"name":"Producto nuevo F3 D","quantity":1,"unit_cost":7}]'::jsonb, NULL) AS res`, UID));
  const i2Res = i2[0].res;
  const receiptAfter = await execSql(`SELECT supplier, reference_doc, total_cost FROM public.receipts WHERE id='${R}';`);
  check('I. guardado atómico: header+qty+alta (updated=1, added=1)',
    i2Res.updated_count === '1' && i2Res.added_count === '1',
    `updated=${i2Res.updated_count} added=${i2Res.added_count}`);
  check('I. cabecera aplicada', receiptAfter[0].supplier === 'Proveedor F3 EDITADO' && receiptAfter[0].reference_doc === 'FAC-EDIT-3');
  check('I. total coherente con líneas', Number(receiptAfter[0].total_cost) > 10, `total=${receiptAfter[0].total_total ?? receiptAfter[0].total_cost}`);

  // J. Autorización: usuario SIN acceso a la tienda.
  const j = await tryExecSql(asAuth(`SELECT public.add_reception_items('${R}',
    '[{"product_id":"${locals['11']}","quantity":1,"unit_cost":1}]'::jsonb, NULL) AS res`, UID2));
  check('J. usuario sin acceso → ERR_UNAUTHORIZED', !j.ok && /ERR_UNAUTHORIZED/.test(j.err),
    (j.err || '').slice(0, 60));

  // K. Cero inventario.
  const movs = await execSql(`SELECT COUNT(*) AS n FROM public.stock_movements WHERE store_id='${S}';`);
  check('K. sin movimientos de inventario por editar el borrador', movs[0].n === 0, `n=${movs[0].n}`);

  // Limpieza + residuos.
  await cleanup();
  const residue = await execSql(`SELECT
    (SELECT COUNT(*) FROM public.products WHERE store_id='${S}') AS p,
    (SELECT COUNT(*) FROM public.master_products WHERE tenant_id='${T}') AS m,
    (SELECT COUNT(*) FROM public.receipts WHERE id IN ('${R}','${R2}')) AS r,
    (SELECT COUNT(*) FROM public.stores WHERE id='${S}') AS s,
    (SELECT COUNT(*) FROM public.tenants WHERE id='${T}') AS t,
    (SELECT COUNT(*) FROM auth.users WHERE id IN ('${UID}','${UID2}')) AS u;`);
  const row = residue[0];
  check('cleanup: cero residuos', row.p === 0 && row.m === 0 && row.r === 0 && row.s === 0 && row.t === 0 && row.u === 0,
    JSON.stringify(row));

  const passed = results.filter(r => r.ok).length;
  console.log(`\n=== RESULTADO: ${passed}/${results.length} pruebas ===`);
  if (results.some(r => !r.ok)) process.exit(1);
  console.log('VALIDACIÓN E2E DE FASE 3: ' + (process.exitCode ? 'CON FALLOS' : 'APROBADA'));
})().catch(e => { console.error('EXCEPCIÓN:', e.message); process.exit(1); });
