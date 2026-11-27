#!/usr/bin/env node
/**
 * cpbra-r05-authorization-battery-e2e.mjs — Batería E2E de autorización R-05
 * (INV-005) contra la BD AISLADA CostproE2E. Misión CP-BRA-INV005-FIN011-CLOSURE-001.
 *
 * Casos (misión §2.6, server-side — el caso 14 UI↔RPC vive en Vitest):
 *   1. admin de plataforma (profiles.role=admin) confirma → OK
 *   2. manager (membresía) confirma → OK
 *   3. encargado (membresía) confirma → OK
 *   4. clerk → ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED (stock/kardex/audit intactos)
 *   5. usuario (membresía ordinaria) → mismo rechazo
 *   6. usuario de OTRA tienda (sin membresía aquí) → rechazo
 *   7. sin autenticación (anon) → rechazo (EXECUTE revocado a anon)
 *   8. manipulación de actor: clerk envía p_user_id=encargado → v_caller_uid
 *      sigue siendo auth.uid() (clerk) → rechazo
 *   9. rol vivo: clerk promovido a encargado EN BD → ahora confirma OK
 *      (el servidor lee la membresía real, no claims del cliente)
 *  10. ajuste inexistente → ERR_ADJUSTMENT_NOT_FOUND
 *  11. ajuste ya confirmado → ERR_NOT_PENDING
 *  12. reintento inmediato tras éxito → ERR_NOT_PENDING
 *  13. fallo del mecanismo de autorización (RENAME temporal de
 *      has_store_role_as — no DROP: políticas RLS dependientes) → rechazo
 *      seguro SIN estado parcial; restaurada la función, la confirmación procede
 *  + integridad: stock modificado UNA sola vez; rechazo no produce
 *    movimientos parciales; auditoría transaccional (1 fila por confirmación).
 *
 * Fixtures: efímeros (tiendas R05-QA-*, usuarios e2e-r05-*@costpro.test —
 * patrón admitido por e2e_hard_delete_user). Limpieza en finally con
 * verificación de retorno al baseline. Guard canónico de aislamiento.
 *
 * Uso: node scripts/e2e/cpbra-r05-authorization-battery-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const URL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!URL || !SERVICE_KEY || !ANON_KEY || !MGMT_TOKEN) {
  console.error('FALLO: variables E2E_* + SUPABASE_ACCESS_TOKEN requeridas.');
  process.exit(2);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

async function runSql(q) {
  const res = await fetch('https://api.supabase.com/v1/projects/lguovmvrozxgssupkwpf/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  return { ok: res.ok, text: await res.text() };
}

const TS = Date.now();
const TAG = `R05-QA-${TS}`;
const PASSWORD = `R05qa-${TS}-battery`;
const EMAIL = (role) => `e2e-r05-${role}-${TS}@costpro.test`;

let pass = 0, fail = 0;
const results = [];
const ok = (n, m) => { pass++; results.push({ n, m, r: 'PASS' }); console.log(`  ✓ [${n}] ${m}`); };
const bad = (n, m, extra) => { fail++; results.push({ n, m, r: 'FAIL', extra }); console.log(`  ✗ [${n}] ${m}${extra ? ' — ' + extra : ''}`); };

// ── helpers de verificación ──────────────────────────────────────────────
async function stockOf(productId) {
  const { data } = await admin.from('products').select('stock_current').eq('id', productId).single();
  return data?.stock_current ?? null;
}
async function kardexCount(productId) {
  const { count } = await admin.from('stock_movements')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('movement_type', 'adjustment');
  return count || 0;
}
async function auditCount(adjustmentId) {
  const { count } = await admin.from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('record_id', adjustmentId)
    .eq('action', 'ADJUSTMENT_CONFIRMED');
  return count || 0;
}
async function adjStatus(id) {
  const { data } = await admin.from('inventory_adjustments').select('status').eq('id', id).single();
  return data?.status ?? null;
}

/** Cliente autenticado con el JWT real de un usuario (grant password). */
async function asUser(role) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL(role), password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in ${role} falló: HTTP ${res.status}`);
  const { access_token } = await res.json();
  return createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${access_token}` } },
    auth: { persistSession: false },
  });
}

async function createTestUser(role) {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL(role), password: PASSWORD, email_confirm: true, user_metadata: { role: role === 'admin' ? 'admin' : role, full_name: `QA R05 ${role}` } }),
  });
  if (!res.ok) throw new Error(`createUser ${role} falló: HTTP ${res.status} ${await res.text()}`);
  const { id } = await res.json();
  return id;
}

async function createPendingAdjustment(storeId, createdBy, counted, expected = 10) {
  const { data: adj, error } = await admin.from('inventory_adjustments').insert({
    store_id: storeId, created_by: createdBy, status: 'pending', reason: 'OTHER',
    notes: `${TAG} fixture`,
  }).select().single();
  if (error) throw new Error('fixture adjustment: ' + error.message);
  await admin.from('inventory_adjustment_items').insert({
    adjustment_id: adj.id, product_id: FIXTURE.productId,
    expected_quantity: expected, counted_quantity: counted,
  });
  return adj.id;
}

async function createUserWithMembership(role, storeId) {
  const uid = await createTestUser(role);
  await admin.from('user_store_memberships').insert({ user_id: uid, store_id: storeId, role, status: 'active' });
  return uid;
}

// ── fixtures globales ────────────────────────────────────────────────────
const FIXTURE = { storeId: null, storeBId: null, productId: null, users: {}, adjustments: {}, baselineStores: 0 };

async function setupFixtures() {
  const { count } = await admin.from('stores').select('*', { count: 'exact', head: true });
  FIXTURE.baselineStores = count || 0;

  const { data: sA, error: eA } = await admin.from('stores').insert({ name: `${TAG} STORE A` }).select().single();
  if (eA) throw new Error('fixture store A: ' + eA.message);
  const { data: sB, error: eB } = await admin.from('stores').insert({ name: `${TAG} STORE B` }).select().single();
  if (eB) throw new Error('fixture store B: ' + eB.message);
  FIXTURE.storeId = sA.id;
  FIXTURE.storeBId = sB.id;

  const { data: prod, error: eP } = await admin.from('products').insert({
    name: `${TAG} producto kardex`, sku: `${TAG}-SKU`, store_id: FIXTURE.storeId,
    stock_current: 10, cost_average: 1,
  }).select().single();
  if (eP) throw new Error('fixture product: ' + eP.message);
  FIXTURE.productId = prod.id;
  // El guard de kardex valida contra inventory (no products.stock_current):
  // sin fila de inventory, cualquier desviación negativa lanza
  // ERR_INSUFFICIENT_STOCK. Fila inicial = 10 (mismo stock declarado).
  const { error: eI } = await admin.from('inventory').insert({
    store_id: FIXTURE.storeId, product_id: FIXTURE.productId, quantity: 10,
  });
  if (eI) throw new Error('fixture inventory: ' + eI.message);

  // Usuario de plataforma (admin) — sin membresías por diseño
  FIXTURE.users.admin = await createTestUser('admin');
  FIXTURE.users.manager = await createUserWithMembership('manager', FIXTURE.storeId);
  FIXTURE.users.encargado = await createUserWithMembership('encargado', FIXTURE.storeId);
  FIXTURE.users.clerk = await createUserWithMembership('clerk', FIXTURE.storeId);
  FIXTURE.users.usuario = await createUserWithMembership('usuario', FIXTURE.storeId);
  // No-miembro: membresía SOLO en la otra tienda (miembro de B, no de A)
  FIXTURE.users.other = await createUserWithMembership('otherb', FIXTURE.storeBId);

  // Ajustes pendientes (uno por caso que necesita estado fresco)
  FIXTURE.adjustments.admin = await createPendingAdjustment(FIXTURE.storeId, FIXTURE.users.clerk, 8);
  FIXTURE.adjustments.manager = await createPendingAdjustment(FIXTURE.storeId, FIXTURE.users.clerk, 7);
  FIXTURE.adjustments.encargado = await createPendingAdjustment(FIXTURE.storeId, FIXTURE.users.clerk, 9);
  FIXTURE.adjustments.clerk = await createPendingAdjustment(FIXTURE.storeId, FIXTURE.users.clerk, 6);
  FIXTURE.adjustments.usuario = await createPendingAdjustment(FIXTURE.storeId, FIXTURE.users.clerk, 5);
  FIXTURE.adjustments.other = await createPendingAdjustment(FIXTURE.storeId, FIXTURE.users.clerk, 4);
  FIXTURE.adjustments.spoof = await createPendingAdjustment(FIXTURE.storeId, FIXTURE.users.clerk, 3);
  FIXTURE.adjustments.mechanism = await createPendingAdjustment(FIXTURE.storeId, FIXTURE.users.clerk, 12);
}

async function teardownFixtures() {
  // Trigger-disable temporal para la limpieza de tiendas/auditoría (los
  // triggers SEC-026 y audit_store_changes escriben filas DURANTE el borrado).
  let triggersRestored = false;
  try {
    const d = await runSql(`
      ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes;
      ALTER TABLE public.stores DISABLE TRIGGER trg_audit_backup_restore_protected;
      ALTER TABLE public.user_store_memberships DISABLE TRIGGER trg_sec026_membership_audit;
    `);
    if (!d.ok) console.error('TEARDOWN: disable triggers falló:', d.text.slice(0, 200));
    try {
      const ids = Object.values(FIXTURE.adjustments).filter(Boolean);
      if (ids.length) {
        await admin.from('audit_logs').delete().in('record_id', ids);
        await admin.from('inventory_adjustment_items').delete().in('adjustment_id', ids);
        await admin.from('inventory_adjustments').delete().in('id', ids);
      }
      if (FIXTURE.productId) {
        // kardex PRIMERO (FK stock_movements.product_id bloquea products)
        await admin.from('stock_movements').delete().eq('product_id', FIXTURE.productId);
        await admin.from('inventory').delete().eq('product_id', FIXTURE.productId);
        await admin.from('products').delete().eq('id', FIXTURE.productId);
      }
      await admin.from('user_store_memberships').delete().in('store_id', [FIXTURE.storeId, FIXTURE.storeBId].filter(Boolean));
      await admin.from('audit_logs').delete().in('store_id', [FIXTURE.storeId, FIXTURE.storeBId].filter(Boolean));
      // Usuarios vía el RPC OFICIAL de hard delete (patrón canónico e2e)
      for (const uid of Object.values(FIXTURE.users)) {
        if (!uid) continue;
        try { await admin.rpc('e2e_hard_delete_user', { p_user_id: uid }); }
        catch (e) { console.error('TEARDOWN user', uid.slice(0, 8), ':', e.message?.slice(0, 80)); }
      }
      for (const sid of [FIXTURE.storeId, FIXTURE.storeBId]) {
        if (sid) await admin.from('stores').delete().eq('id', sid);
      }
    } finally {
      const e = await runSql(`
        ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes;
        ALTER TABLE public.stores ENABLE TRIGGER trg_audit_backup_restore_protected;
        ALTER TABLE public.user_store_memberships ENABLE TRIGGER trg_sec026_membership_audit;
      `);
      triggersRestored = e.ok;
    }
    const { count } = await admin.from('stores').select('*', { count: 'exact', head: true });
    const { data: resProds } = await admin.from('products').select('id').like('sku', `${TAG}-SKU`);
    return count === FIXTURE.baselineStores && triggersRestored && (resProds || []).length === 0;
  } catch (e) {
    console.error('TEARDOWN ERROR:', e.message);
    return false;
  }
}

// ── batería ──────────────────────────────────────────────────────────────
let cleaned = true;
try {
  await setupFixtures();
  console.log(`\n═══ BATERÍA R-05 — fixtures ${TAG} (tiendas A/B, 6 usuarios, 8 ajustes) ═══\n`);

  // Caso 1: admin de plataforma
  try {
    const cl = await asUser('admin');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.admin });
    if (error) bad(1, 'admin de plataforma debería confirmar', error.message);
    else if ((await adjStatus(FIXTURE.adjustments.admin)) === 'confirmed' && (await auditCount(FIXTURE.adjustments.admin)) === 1) ok(1, 'admin confirma + auditoría transaccional presente');
    else bad(1, 'estado/auditoría inesperados tras confirmación admin');
  } catch (e) { bad(1, 'excepción', e.message); }

  // Caso 2: manager
  try {
    const cl = await asUser('manager');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.manager });
    if (error) bad(2, 'manager debería confirmar', error.message);
    else if ((await adjStatus(FIXTURE.adjustments.manager)) === 'confirmed') ok(2, 'manager confirma');
    else bad(2, 'estado inesperado');
  } catch (e) { bad(2, 'excepción', e.message); }

  // Caso 3: encargado
  try {
    const cl = await asUser('encargado');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.encargado });
    if (error) bad(3, 'encargado debería confirmar', error.message);
    else if ((await adjStatus(FIXTURE.adjustments.encargado)) === 'confirmed') ok(3, 'encargado confirma');
    else bad(3, 'estado inesperado');
  } catch (e) { bad(3, 'excepción', e.message); }

  // Caso 4: clerk rechazado SIN estado parcial
  try {
    const stockBefore = await stockOf(FIXTURE.productId);
    const kardexBefore = await kardexCount(FIXTURE.productId);
    const auditBefore = await auditCount(FIXTURE.adjustments.clerk);
    const cl = await asUser('clerk');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.clerk });
    const stillPending = (await adjStatus(FIXTURE.adjustments.clerk)) === 'pending';
    const intact = (await stockOf(FIXTURE.productId)) === stockBefore
      && (await kardexCount(FIXTURE.productId)) === kardexBefore
      && (await auditCount(FIXTURE.adjustments.clerk)) === auditBefore;
    if (!error) bad(4, 'clerk NO debería confirmar');
    else if (error.message.includes('ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED') && stillPending && intact) ok(4, 'clerk rechazado, sin movimientos parciales');
    else bad(4, 'rechazo con efecto colateral o código inesperado', error.message);
  } catch (e) { bad(4, 'excepción', e.message); }

  // Caso 5: usuario ordinario rechazado
  try {
    const cl = await asUser('usuario');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.usuario });
    if (!error) bad(5, 'usuario NO debería confirmar');
    else if (error.message.includes('ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED') && (await adjStatus(FIXTURE.adjustments.usuario)) === 'pending') ok(5, 'usuario ordinario rechazado');
    else bad(5, 'rechazo inesperado', error.message);
  } catch (e) { bad(5, 'excepción', e.message); }

  // Caso 6: miembro de OTRA tienda rechazado (aislamiento por tienda)
  try {
    const cl = await asUser('otherb');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.other });
    if (!error) bad(6, 'usuario de otra tienda NO debería confirmar');
    else if (error.message.includes('ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED') && (await adjStatus(FIXTURE.adjustments.other)) === 'pending') ok(6, 'miembro de otra tienda rechazado');
    else bad(6, 'rechazo inesperado', error.message);
  } catch (e) { bad(6, 'excepción', e.message); }

  // Caso 7: sin sesión válida (anon) — EXECUTE revocado a anon
  try {
    const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await anon.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.clerk });
    if (!error) bad(7, 'anon NO debería ejecutar el RPC');
    else ok(7, `sin sesión → rechazo (RPC no expuesto a anon: ${error.message.slice(0, 60)})`);
  } catch (e) { ok(7, `sin sesión → rechazo por excepción (${e.message.slice(0, 60)})`); }

  // Caso 8: manipulación de actor (clerk envía p_user_id=encargado)
  try {
    const cl = await asUser('clerk');
    const { error } = await cl.rpc('confirm_inventory_adjustment', {
      p_adjustment_id: FIXTURE.adjustments.spoof,
      p_user_id: FIXTURE.users.encargado,
    });
    if (!error) bad(8, 'spoofing de p_user_id NO debería elevar privilegios');
    else if (error.message.includes('ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED') && (await adjStatus(FIXTURE.adjustments.spoof)) === 'pending') ok(8, 'p_user_id falsificado ignorado (v_caller_uid=auth.uid())');
    else bad(8, 'comportamiento inesperado', error.message);
  } catch (e) { bad(8, 'excepción', e.message); }

  // Caso 9: rol vivo — promover clerk a encargado EN BD y reintentar
  try {
    await admin.from('user_store_memberships')
      .update({ role: 'encargado' })
      .eq('user_id', FIXTURE.users.clerk).eq('store_id', FIXTURE.storeId);
    const cl = await asUser('clerk');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.clerk });
    if (error) bad(9, 'clerk promovido a encargado debería confirmar', error.message);
    else if ((await adjStatus(FIXTURE.adjustments.clerk)) === 'confirmed') ok(9, 'membresía leída en vivo: clerk→encargado ahora confirma');
    else bad(9, 'estado inesperado');
  } catch (e) { bad(9, 'excepción', e.message); }

  // Caso 10: ajuste inexistente
  try {
    const cl = await asUser('encargado');
    const fake = crypto.randomUUID();
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: fake });
    if (!error) bad(10, 'ajuste inexistente NO debería confirmar');
    else if (error.message.includes('ERR_ADJUSTMENT_NOT_FOUND')) ok(10, 'ajuste inexistente → ERR_ADJUSTMENT_NOT_FOUND');
    else bad(10, 'código inesperado', error.message);
  } catch (e) { bad(10, 'excepción', e.message); }

  // Caso 11: ya confirmado (encargado ya confirmó en caso 3)
  try {
    const cl = await asUser('encargado');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.encargado });
    if (!error) bad(11, 'confirmación doble NO debería permitir');
    else if (error.message.includes('ERR_NOT_PENDING')) ok(11, 'ya confirmado → ERR_NOT_PENDING');
    else bad(11, 'código inesperado', error.message);
  } catch (e) { bad(11, 'excepción', e.message); }

  // Caso 12: reintento inmediato tras éxito (manager ya confirmó en caso 2)
  try {
    const cl = await asUser('manager');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.manager });
    if (!error) bad(12, 'reintento NO debería permitir');
    else if (error.message.includes('ERR_NOT_PENDING')) ok(12, 'reintento tras éxito → ERR_NOT_PENDING');
    else bad(12, 'código inesperado', error.message);
  } catch (e) { bad(12, 'excepción', e.message); }

  // Caso 13: fallo del mecanismo de autorización → rechazo seguro
  try {
    // RENAME temporal (DROP es imposible: políticas RLS dependen de la función)
    const ren = await runSql(`ALTER FUNCTION public.has_store_role_as(uuid,uuid,text[]) RENAME TO has_store_role_as_disabled_r05;`);
    if (!ren.ok) throw new Error('RENAME has_store_role_as falló: ' + ren.text);
    try {
      const stockBefore = await stockOf(FIXTURE.productId);
      const kardexBefore = await kardexCount(FIXTURE.productId);
      const cl = await asUser('encargado');
      const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.mechanism });
      const intact = (await stockOf(FIXTURE.productId)) === stockBefore
        && (await kardexCount(FIXTURE.productId)) === kardexBefore
        && (await adjStatus(FIXTURE.adjustments.mechanism)) === 'pending';
      if (!error && intact) bad(13, 'sin función de permisos NO debería confirmar');
      else if (error && intact) ok(13, `fallo del mecanismo → rechazo seguro sin estado parcial (${error.message.slice(0, 50)})`);
      else bad(13, 'estado parcial tras fallo del mecanismo', error?.message);
    } finally {
      const fixRes = await runSql(`ALTER FUNCTION public.has_store_role_as_disabled_r05 RENAME TO has_store_role_as;`);
      if (!fixRes.ok) throw new Error('restauración has_store_role_as FALLÓ: ' + fixRes.text);
      const check = await runSql(`select count(*)=1 as ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='has_store_role_as' and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_store_id uuid, p_roles text[]';`);
      if (!JSON.parse(check.text)[0]?.ok) throw new Error('restauración verificada FALLÓ');
      console.log('  · has_store_role_as restaurada + verificada');
    }
    const cl = await asUser('encargado');
    const { error } = await cl.rpc('confirm_inventory_adjustment', { p_adjustment_id: FIXTURE.adjustments.mechanism });
    if (error) bad(13, 'tras restauración debería confirmar', error.message);
    else ok(13, 'tras restauración: encargado confirma (fail-closed solo durante el fallo)');
  } catch (e) { bad(13, 'excepción', e.message); }

  // Integridad final: 5 confirmaciones × 1 ítem = 5 movimientos de kardex
  try {
    const k = await kardexCount(FIXTURE.productId);
    if (k === 5) ok('+', `integridad: 5 confirmaciones × 1 ítem = 5 movimientos de kardex (exacto)`);
    else bad('+', `integridad: kardex esperado 5, obtenido ${k}`);
    const audit = await auditCount(FIXTURE.adjustments.mechanism);
    if (audit === 1) ok('+', 'auditoría: exactamente 1 fila ADJUSTMENT_CONFIRMED por confirmación');
    else bad('+', `auditoría esperada 1, obtenida ${audit}`);
  } catch (e) { bad('+', 'excepción integridad', e.message); }
} catch (setupErr) {
  bad('SETUP', 'fallo preparando fixtures', setupErr.message);
} finally {
  cleaned = await teardownFixtures();
  console.log(`\n  · limpieza: ${cleaned ? 'baseline restaurado ✓' : 'RESIDUOS DETECTADOS ✗'}`);
}

console.log(`\n═══ RESULTADO: ${pass} PASS / ${fail} FAIL ═══`);
console.log(JSON.stringify({ tag: TAG, pass, fail, cleaned, results }, null, 1));
process.exit(fail === 0 && cleaned ? 0 : 1);
