#!/usr/bin/env node
/**
 * cpbra-r03-ot-batch-battery-e2e.mjs — Batería E2E R-03 (pagos múltiples de
 * órdenes de trabajo: OPERACIÓN PARCIAL + ATOMICIDAD POR ORDEN) vía API REAL
 * de la app contra la BD AISLADA CostproE2E.
 * Misión CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §3.6.
 *
 * DECISIÓN DEL PROPIETARIO (§0.1): independencia ENTRE órdenes, atomicidad
 * DENTRO de cada orden. Un fallo de una OT no revierte los pagos correctos
 * de las demás; y ningún fallo interno deja pagos parciales dentro de una OT.
 *
 * Requisito de entorno: servidor Next (localhost:3000) con el SWAP de entorno
 * aislado (.env.e2e-run → .env + pm2 restart) — patrón R-25/FIN-011 (Bearer
 * JWT real; getServerSession lo acepta).
 *
 * Casos §3.6:
 *   B1  Cinco OT válidas → all_success, 5 pagos, actor real
 *   B2  Cuatro válidas + una anulada → partial: 4 pagos; anulada 409
 *       ERR_ORDER_NOT_PAYABLE y SIN movimientos
 *   B3  Una válida + una de OTRA tienda + una válida → 2 OK + rechazo por
 *       tienda (sin fuga RLS)
 *   B4  Una con saldo insuficiente (overpay) + otras correctas → partial
 *   B5  Todas fallidas → all_failed
 *   B6  Reintento del mismo lote (misma idempotency_key) → replayed, mismos
 *       payment_ids, sin duplicados
 *   B7  Dos errores independientes en el mismo lote (anulada + overpay) →
 *       2 OK + 2 fallos con códigos correctos
 *   B8  Reintento EXCLUSIVO de una OT fallida → solo esa OT se procesa
 *   B9  Duplicación de una OT en el payload → 400 ERR_BATCH_DUPLICATE
 *   B10 Reintento con clave de idempotencia repetida tras éxito → replay
 *   B11 Concurrencia: dos lotes simultáneos compartiendo una OT con
 *       presupuesto justo → 1 gana esa OT, el otro falla SOLO en ella
 *   B12 Pago MIXTO multi-componente de UNA OT con fallo en el componente 2 →
 *       ATOMICIDAD: 0 pagos de esa OT (via /api/payments, defecto FIN-013)
 *   B13 Las demás OT exitosas permanecen registradas (conciliación post-fallos)
 *   B14 Conciliación pagos ↔ mayor financiero (fin_entries ORDEN_TRABAJO +
 *       movimientos + paid_amount = Σ neta)
 *   SEC1 clerk → 403; SEC2 no autenticado → 401
 *
 * Fixtures efímeros R03-QA-* (patrón R25: usuarios e2e-r03-*@costpro.test
 * borrados con e2e_hard_delete_user; tiendas con triggers de auditoría
 * desactivados temporalmente). Limpieza final con verificación baseline.
 *
 * Uso: node scripts/e2e/cpbra-r03-ot-batch-battery-e2e.mjs [--base http://localhost:3000]
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
const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : null) || process.env.E2E_APP_BASE || 'http://localhost:3000';
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
const TAG = `R03-QA-${TS}`;
const PASSWORD = `R03qa-${TS}-battery`;
const EMAIL = (role) => `e2e-r03-${role}-${TS}@costpro.test`;

let pass = 0, fail = 0;
const results = [];
const ok = (n, m) => { pass++; results.push({ n, m, r: 'PASS' }); console.log(`  ✓ [${n}] ${m}`); };
const bad = (n, m, extra) => { fail++; results.push({ n, m, r: 'FAIL', extra }); console.log(`  ✗ [${n}] ${m}${extra ? ' — ' + String(extra).slice(0, 220) : ''}`); };

const EMAILS = {};
async function tokenOf(role) {
  const email = EMAILS[role];
  if (!email) throw new Error(`sin email registrado para ${role}`);
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`sign-in ${role} falló: HTTP ${res.status} ${t.slice(0, 160)}`);
  }
  const { access_token } = await res.json();
  return access_token;
}

async function apiPost(role, path, body) {
  const token = role === null ? null : await tokenOf(role);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, json };
}

async function paymentsOf(orderId) {
  const { data } = await admin.from('payment_transactions')
    .select('id, amount, amount_cup, currency, paid_by, store_id, ref_id, idempotency_key, direction, payment_method')
    .eq('ref_id', orderId)
    .in('ref_type', ['production_order', 'work']);
  return data || [];
}
async function orderOf(orderId) {
  const { data } = await admin.from('production_orders').select('paid_amount, payment_status, paid_at, status').eq('id', orderId).single();
  return data;
}
async function finMovementsOf(orderId) {
  const { data: entries } = await admin.from('fin_entries')
    .select('id, document_type, document_id, event, payment_ref')
    .eq('document_id', orderId);
  const { data: movs } = await admin.from('fin_movements')
    .select('id, amount_cup, sense, category_code')
    .in('entry_id', (entries || []).map(e => e.id));
  return { entries: entries || [], movs: movs || [] };
}

async function createTestUser(role, globalRole) {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL(role), password: PASSWORD, email_confirm: true, user_metadata: { full_name: `QA R03 ${role}` } }),
  });
  if (!res.ok) throw new Error(`createUser ${role} falló: HTTP ${res.status} ${await res.text()}`);
  const { id } = await res.json();
  const upd = { active_store_id: null, full_name: `QA R03 ${role}` };
  if (globalRole) upd.role = globalRole;
  const { error } = await admin.from('profiles').update(upd).eq('id', id);
  if (error) throw new Error(`profile ${role}: ${error.message}`);
  return id;
}

const FIXTURE = { storeAId: null, storeBId: null, users: {}, orders: {}, baselineStores: 0 };

async function createOrder(storeId, suffix, budget, status = 'draft', orderType = 'work') {
  const { data: po, error } = await admin.from('production_orders').insert({
    store_id: storeId,
    order_number: `${TAG}-${suffix}`,
    order_type: orderType,
    status,
    budget_total: budget,
    budget_currency: 'CUP',
    description: `${TAG} fixture ${suffix}`,
    created_by: FIXTURE.users.managerA,
  }).select().single();
  if (error) throw new Error(`fixture PO ${suffix}: ${error.message}`);
  return po.id;
}

async function setupFixtures() {
  const { count } = await admin.from('stores').select('*', { count: 'exact', head: true });
  FIXTURE.baselineStores = count || 0;

  const { data: sA, error: eA } = await admin.from('stores').insert({ name: `${TAG} STORE A` }).select().single();
  if (eA) throw new Error('fixture store A: ' + eA.message);
  const { data: sB, error: eB } = await admin.from('stores').insert({ name: `${TAG} STORE B` }).select().single();
  if (eB) throw new Error('fixture store B: ' + eB.message);
  FIXTURE.storeAId = sA.id;
  FIXTURE.storeBId = sB.id;

  FIXTURE.users.managerA = await createTestUser('manager', 'clerk');
  EMAILS.managerA = EMAIL('manager');
  FIXTURE.users.clerkA = await createTestUser('clerk', 'clerk');
  EMAILS.clerkA = EMAIL('clerk');
  FIXTURE.users.managerB = await createTestUser('managerb', 'clerk');
  EMAILS.managerB = EMAIL('managerb');

  const { error: mE } = await admin.from('user_store_memberships').insert([
    { user_id: FIXTURE.users.managerA, store_id: FIXTURE.storeAId, role: 'manager', status: 'active' },
    { user_id: FIXTURE.users.clerkA, store_id: FIXTURE.storeAId, role: 'clerk', status: 'active' },
    { user_id: FIXTURE.users.managerB, store_id: FIXTURE.storeBId, role: 'manager', status: 'active' },
  ]);
  if (mE) throw new Error('fixture memberships: ' + mE.message);
  await admin.from('profiles').update({ active_store_id: FIXTURE.storeAId }).in('id', [FIXTURE.users.managerA, FIXTURE.users.clerkA]);
  await admin.from('profiles').update({ active_store_id: FIXTURE.storeBId }).eq('id', FIXTURE.users.managerB);

  // Órdenes de trabajo (presupuestos en CUP):
  FIXTURE.orders.o1 = await createOrder(FIXTURE.storeAId, 'O1', 1000);
  FIXTURE.orders.o2 = await createOrder(FIXTURE.storeAId, 'O2', 1000);
  FIXTURE.orders.o3 = await createOrder(FIXTURE.storeAId, 'O3', 1000);
  FIXTURE.orders.o4 = await createOrder(FIXTURE.storeAId, 'O4', 1000);
  FIXTURE.orders.o5 = await createOrder(FIXTURE.storeAId, 'O5', 1000);
  FIXTURE.orders.voided = await createOrder(FIXTURE.storeAId, 'VOID', 500, 'voided');
  FIXTURE.orders.overpay = await createOrder(FIXTURE.storeAId, 'OVER', 300);
  FIXTURE.orders.inB = await createOrder(FIXTURE.storeBId, 'INB', 500);
  FIXTURE.orders.mix = await createOrder(FIXTURE.storeAId, 'MIX', 1000);
  FIXTURE.orders.conc = await createOrder(FIXTURE.storeAId, 'CONC', 1000);
  FIXTURE.orders.a2 = await createOrder(FIXTURE.storeAId, 'A2', 800);
  FIXTURE.orders.a3 = await createOrder(FIXTURE.storeAId, 'A3', 800);
}

async function teardownFixtures() {
  try {
    const d = await runSql(`
      ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes;
      ALTER TABLE public.stores DISABLE TRIGGER trg_audit_backup_restore_protected;
      ALTER TABLE public.user_store_memberships DISABLE TRIGGER trg_sec026_membership_audit;
    `);
    if (!d.ok) console.error('TEARDOWN: disable triggers falló:', d.text.slice(0, 200));
    try {
      const orderIds = Object.values(FIXTURE.orders).filter(Boolean);
      if (orderIds.length) {
        const { data: ents } = await admin.from('fin_entries').select('id').in('document_id', orderIds);
        if (ents && ents.length) {
          await admin.from('fin_movements').delete().in('entry_id', ents.map(e => e.id));
          await admin.from('fin_entries').delete().in('id', ents.map(e => e.id));
        }
        await admin.from('fin_posting_errors').delete().in('document_id', orderIds);
        await admin.from('payment_transactions').delete().in('ref_id', orderIds);
        await admin.from('production_orders').delete().in('id', orderIds);
      }
      await admin.from('user_store_memberships').delete().in('store_id', [FIXTURE.storeAId, FIXTURE.storeBId].filter(Boolean));
      await admin.from('audit_logs').delete().in('store_id', [FIXTURE.storeAId, FIXTURE.storeBId].filter(Boolean));
      for (const uid of Object.values(FIXTURE.users)) {
        if (!uid) continue;
        await runSql(`select public.e2e_hard_delete_user('${uid}');`);
      }
      const { count: finalCount } = await admin.from('stores').select('*', { count: 'exact', head: true });
      if ((finalCount || 0) !== FIXTURE.baselineStores) {
        // Eliminación de tiendas con FK de protecciones: borrado directo tras
        // desactivar triggers de auditoría (patrón R25).
        await runSql(`DELETE FROM public.stores WHERE id IN ('${FIXTURE.storeAId}', '${FIXTURE.storeBId}')`);
        const { count: finalCount2 } = await admin.from('stores').select('*', { count: 'exact', head: true });
        if ((finalCount2 || 0) !== FIXTURE.baselineStores) {
          console.error(`TEARDOWN: tiendas residual (${finalCount2} ≠ baseline ${FIXTURE.baselineStores})`);
        }
      }
    } finally {
      const r = await runSql(`
        ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes;
        ALTER TABLE public.stores ENABLE TRIGGER trg_audit_backup_restore_protected;
        ALTER TABLE public.user_store_memberships ENABLE TRIGGER trg_sec026_membership_audit;
      `);
      if (r.ok) triggersRestoredTrue();
    }
  } catch (e) {
    console.error('TEARDOWN error:', e.message);
  }
}
let triggersRestoredFlag = false;
function triggersRestoredTrue() { triggersRestoredFlag = true; }

const row = (r, k) => ((r.json?.results) || [])[k];
const rowByRef = (r, refId) => ((r.json?.results) || []).find((x) => x.ref_id === refId);

async function main() {
  await setupFixtures();
  const M = 'managerA';
  const item = (ref_id, amount = 100, method = 'cash') => ({ ref_id, payments: [{ payment_method: method, amount, currency: 'CUP', exchange_rate: 1.0 }] });

  try {
    // ── B1: cinco OT válidas → all_success ──────────────────────────────
    const ids5 = [FIXTURE.orders.o1, FIXTURE.orders.o2, FIXTURE.orders.o3, FIXTURE.orders.o4, FIXTURE.orders.o5];
    const b1 = await apiPost(M, '/api/payments/ot-batch', { items: ids5.map((r) => item(r, 100)), idempotency_key: `b1-${TS}` });
    b1.__ids = ids5;
    if (b1.status === 201 && b1.json?.status === 'all_success' && b1.json.success_count === 5) {
      const p1 = await paymentsOf(FIXTURE.orders.o1);
      if (p1.length === 1 && p1[0].paid_by === FIXTURE.users.managerA && p1[0].store_id === FIXTURE.storeAId) {
        ok('B1', 'cinco OT válidas → all_success 201, 5 pagos, actor real (managerA) y tienda correcta');
      } else bad('B1', 'pagos no conciliables', JSON.stringify(p1));
    } else bad('B1', 'esperado all_success 201 ×5', JSON.stringify({ s: b1.status, j: b1.json?.status, c: b1.json?.success_count }));

    // ── B2: cuatro válidas + una anulada → partial; anulada sin movimientos ─
    const voided = FIXTURE.orders.voided;
    const b2ids = [FIXTURE.orders.o2, voided, FIXTURE.orders.o3, FIXTURE.orders.o4, FIXTURE.orders.o5];
    const b2 = await apiPost(M, '/api/payments/ot-batch', { items: b2ids.map((r) => item(r, 200)), idempotency_key: `b2-${TS}` });
    const b2v = rowByRef(b2, voided);
    const b2o2 = rowByRef(b2, FIXTURE.orders.o2);
    const voidedPayments = await paymentsOf(voided);
    const voidedOrder = await orderOf(voided);
    if (b2.status === 201 && b2.json?.status === 'partial' && b2.json.success_count === 4 && b2.json.error_count === 1) {
      if (b2v?.success === false && b2v?.error_code === 'ERR_ORDER_NOT_PAYABLE' && voidedPayments.length === 0 && voidedOrder?.status === 'voided') {
        ok('B2', '4 válidas pagadas + anulada rechazada ERR_ORDER_NOT_PAYABLE SIN movimientos (resultado obligatorio §3.2)');
      } else bad('B2', 'anulada mal clasificada o con movimientos', JSON.stringify({ b2v, voidedPayments }));
    } else bad('B2', 'esperado partial 4/1', JSON.stringify({ s: b2.status, st: b2.json?.status, sc: b2.json?.success_count, ec: b2.json?.error_count }));

    // ── B3: una válida + una de OTRA tienda + una válida → sin fuga RLS ──
    const b3 = await apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.o3, 300), item(FIXTURE.orders.inB, 100), item(FIXTURE.orders.o4, 300)], idempotency_key: `b3-${TS}` });
    const b3inB = rowByRef(b3, FIXTURE.orders.inB);
    if (b3.status === 201 && b3.json?.status === 'partial' && b3.json.success_count === 2
      && b3inB?.success === false && ['ERR_ORDER_NOT_FOUND', 'ERR_ORDER_STORE_MISMATCH'].includes(b3inB.error_code)) {
      ok('B3', 'OT de otra tienda rechazada por ítem (RLS sin fuga) — las 2 válidas pagadas');
    } else bad('B3', 'esperado partial 2/1 con rechazo de tienda', JSON.stringify({ s: b3.status, st: b3.json?.status, inB: b3inB }));

    // ── B4: una con saldo insuficiente + otras correctas ────────────────
    const b4 = await apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.overpay, 400), item(FIXTURE.orders.o4, 400)], idempotency_key: `b4-${TS}` });
    const b4ov = rowByRef(b4, FIXTURE.orders.overpay);
    const ovPayments = await paymentsOf(FIXTURE.orders.overpay);
    if (b4.status === 201 && b4.json?.status === 'partial' && b4ov?.success === false && b4ov?.error_code === 'ERR_BATCH_OVERPAY' && ovPayments.length === 0) {
      ok('B4', 'overpay (400 > presupuesto 300) rechazado ERR_BATCH_OVERPAY sin pagos — la otra OT OK');
    } else bad('B4', 'esperado ERR_BATCH_OVERPAY por ítem', JSON.stringify({ s: b4.status, ov: b4ov, p: ovPayments.length }));

    // ── B5: todas fallidas → all_failed ─────────────────────────────────
    const b5 = await apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.voided, 100), item(FIXTURE.orders.overpay, 999), item(FIXTURE.orders.inB, 100)], idempotency_key: `b5-${TS}` });
    if (b5.status === 201 && b5.json?.status === 'all_failed' && b5.json.success_count === 0 && b5.json.error_count === 3) {
      ok('B5', 'todas fallidas → all_failed 201 con 3 errores por ítem (convención bulk-pay)');
    } else bad('B5', 'esperado all_failed', JSON.stringify({ s: b5.status, st: b5.json?.status }));

    // ── B6/B10: reintento del mismo lote (misma clave) → replay sin duplicar ─
    const b6 = await apiPost(M, '/api/payments/ot-batch', { items: ids5.map((r) => item(r, 100)), idempotency_key: `b1-${TS}` });
    const b6o1 = rowByRef(b6, FIXTURE.orders.o1);
    const p1After = await paymentsOf(FIXTURE.orders.o1);
    if (b6.status === 201 && b6.json?.status === 'all_success' && b6o1?.replayed === true && p1After.length === 1 && b6o1?.payment_ids?.[0] === (b1.json.results.find((r) => r.ref_id === FIXTURE.orders.o1)?.payment_ids?.[0])) {
      ok('B6', 'reintento del mismo lote con la misma clave → replayed:true, MISMOS payment_ids, sin duplicados');
    } else bad('B6', 'esperado replay idempotente', JSON.stringify({ st: b6.json?.status, o1: b6o1, n: p1After.length }));

    // ── B7: dos errores independientes en el mismo lote ─────────────────
    const b7 = await apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.a2, 400), item(FIXTURE.orders.voided, 100), item(FIXTURE.orders.overpay, 999), item(FIXTURE.orders.a3, 400)], idempotency_key: `b7-${TS}` });
    const b7v = rowByRef(b7, FIXTURE.orders.voided);
    const b7ov = rowByRef(b7, FIXTURE.orders.overpay);
    const b7a2 = rowByRef(b7, FIXTURE.orders.a2);
    if (b7.json?.status === 'partial' && b7.json.success_count === 2 && b7v?.error_code === 'ERR_ORDER_NOT_PAYABLE' && b7ov?.error_code === 'ERR_BATCH_OVERPAY' && b7a2?.success === true) {
      ok('B7', 'dos errores independientes (anulada 409 + overpay 400) con 2 OT correctas pagadas');
    } else bad('B7', 'esperado partial 2 OK + 2 fallos clasificados', JSON.stringify({ st: b7.json?.status, v: b7v, ov: b7ov }));

    // ── B8: reintento EXCLUSIVO de una OT fallida ───────────────────────
    // la OT anulada sigue fallando; las OT pagadas NO se duplican.
    const beforeO2 = (await paymentsOf(FIXTURE.orders.o2)).length;
    const b8 = await apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.overpay, 300)], idempotency_key: `b8-retry-${TS}` });
    const afterO2 = (await paymentsOf(FIXTURE.orders.o2)).length;
    const overNow = await paymentsOf(FIXTURE.orders.overpay);
    if (b8.json?.status === 'all_success' && afterO2 === beforeO2 && overNow.length === 1) {
      ok('B8', 'reintento exclusivo de la OT fallida (300 = presupuesto exacto) → OK; otras OT sin duplicación');
    } else bad('B8', 'reintento exclusivo mal comportado', JSON.stringify({ st: b8.json?.status, afterO2, beforeO2, overNow: overNow.length }));

    // ── B9: duplicación de una OT en el payload → 400 ERR_BATCH_DUPLICATE ─
    const b9 = await apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.a2, 50), item(FIXTURE.orders.a2, 60)] });
    const a2Now = (await paymentsOf(FIXTURE.orders.a2)).length;
    if (b9.status === 400 && b9.json?.code === 'ERR_BATCH_DUPLICATE' && a2Now === 1) {
      ok('B9', 'OT duplicada en payload → 400 ERR_BATCH_DUPLICATE, sin pagos adicionales');
    } else bad('B9', 'esperado 400 ERR_BATCH_DUPLICATE', JSON.stringify({ s: b9.status, c: b9.json?.code, a2: a2Now }));

    // ── B10 (explícito): clave repetida tras éxito → replay ─────────────
    const b10 = await apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.a3, 200)], idempotency_key: `b7-${TS}` });
    const a3p = await paymentsOf(FIXTURE.orders.a3);
    const b7a3 = rowByRef(b7, FIXTURE.orders.a3);
    if (b10.status === 201 && rowByRef(b10, FIXTURE.orders.a3)?.replayed === true && a3p.length === 1 && a3p[0].id === b7a3?.payment_ids?.[0]) {
      ok('B10', 'clave de idempotencia repetida → replay del bloque, sin segundo pago');
    } else bad('B10', 'esperado replay con la clave de b7', JSON.stringify({ s: b10.status, a3: a3p.length }));

    // ── B11: concurrencia — dos lotes simultáneos comparten OT con
    //        presupuesto justo → 1 gana esa OT; el otro falla SOLO en ella ──
    const [c1, c2] = await Promise.all([
      apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.conc, 1000), item(FIXTURE.orders.o1, 50)], idempotency_key: `c1-${TS}` }),
      apiPost(M, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.conc, 1000), item(FIXTURE.orders.o2, 50)], idempotency_key: `c2-${TS}` }),
    ]);
    const concPays = await paymentsOf(FIXTURE.orders.conc);
    const c1conc = rowByRef(c1, FIXTURE.orders.conc);
    const c2conc = rowByRef(c2, FIXTURE.orders.conc);
    const winners = [c1conc, c2conc].filter((r) => r?.success === true).length;
    const losers = [c1conc, c2conc].filter((r) => r?.success === false).length;
    const othersOk = (rowByRef(c1, FIXTURE.orders.o1)?.success === true) && (rowByRef(c2, FIXTURE.orders.o2)?.success === true);
    if (winners === 1 && losers === 1 && concPays.length === 1 && othersOk) {
      ok('B11', 'concurrencia: FOR UPDATE serializa la OT compartida (1 entra / 1 ERR_BATCH_OVERPAY) y las OTRAS OT de ambos lotes quedan pagadas');
    } else bad('B11', 'concurrencia mal resuelta', JSON.stringify({ winners, losers, n: concPays.length, othersOk, c1conc, c2conc }));

    // ── B12: ATOMICIDAD dentro de una OT — pago mixto multi-componente con
    //    fallo en el componente 2 vía /api/payments → 0 pagos de esa OT ──
    const mixId = FIXTURE.orders.mix;
    const b12 = await apiPost(M, '/api/payments', {
      ref_type: 'work', ref_id: mixId,
      payments: [
        { payment_method: 'cash', amount: 200, currency: 'CUP', exchange_rate: 1.0 },
        { payment_method: 'transfer', amount: 2000, currency: 'CUP', exchange_rate: 1.0 },
      ],
      idempotency_key: `mix-${TS}`,
    });
    const mixPays = await paymentsOf(mixId);
    if (b12.status === 400 && mixPays.length === 0) {
      ok('B12', 'ATOMICIDAD por orden: lote mixto con componente 2 en overpay → 400 y CERO pagos de la OT (antes quedaba 1 pago parcial — defecto FIN-013)');
    } else bad('B12', 'esperado 400 y 0 pagos (sin parcial dentro de la OT)', JSON.stringify({ s: b12.status, n: mixPays.length, e: b12.json }));

    // B12b: el mismo lote mixto con componentes válidos → TODOS confirmados.
    const b12b = await apiPost(M, '/api/payments', {
      ref_type: 'work', ref_id: mixId,
      payments: [
        { payment_method: 'cash', amount: 300, currency: 'CUP', exchange_rate: 1.0 },
        { payment_method: 'transfer', amount: 700, currency: 'CUP', exchange_rate: 1.0 },
      ],
      idempotency_key: `mix-ok-${TS}`,
    });
    const mixOk = await paymentsOf(mixId);
    if (b12b.status === 201 && mixOk.length === 2) {
      ok('B12b', 'pago mixto válido de una OT → 2 componentes confirmados en UNA transacción');
    } else bad('B12b', 'esperado 201 ×2', JSON.stringify({ s: b12b.status, n: mixOk.length }));

    // ── B13: las demás OT exitosas permanecen registradas ───────────────
    // Secuencia acumulada real: B1 +100 ×5 · B2 +200 (o2..o5) · B3 +300
    // (o3,o4) · B4 +400 (o4) · B7 +400 (a2,a3) · B8 +300 (overpay) ·
    // B11 +50 (o1 y o2 desde lotes concurrentes) · B12b mixto +300+700 (mix).
    const checks13 = [FIXTURE.orders.o1, FIXTURE.orders.o2, FIXTURE.orders.o3, FIXTURE.orders.o4, FIXTURE.orders.a2, FIXTURE.orders.a3];
    const expected13 = new Map([
      [FIXTURE.orders.o1, 150],   // B1 100 + B11 50
      [FIXTURE.orders.o2, 350],   // B1 100 + B2 200 + B11 50
      [FIXTURE.orders.o3, 600],   // B1 100 + B2 200 + B3 300
      [FIXTURE.orders.o4, 1000],  // B1 100 + B2 200 + B3 300 + B4 400 (= presupuesto)
      [FIXTURE.orders.a2, 400],   // B7 400
      [FIXTURE.orders.a3, 400],   // B7 400
    ]);
    let all13 = true;
    const detail13 = {};
    for (const oid of checks13) {
      const ps = await paymentsOf(oid);
      const ord = await orderOf(oid);
      const expectedPaid = expected13.get(oid);
      const sumNet = ps.filter((p) => p.direction !== 'reversal').reduce((s, p) => s + Number(p.amount_cup || p.amount), 0);
      if (ps.length === 0 || sumNet !== expectedPaid || Number(ord?.paid_amount) !== expectedPaid) {
        all13 = false;
        detail13[oid.slice(0, 8)] = { n: ps.length, sumNet, paid_amount: ord?.paid_amount, expected: expectedPaid };
      }
    }
    if (all13) {
      ok('B13', 'conciliación post-fallos: todas las OT exitosas conservan sus pagos (paid_amount = Σ neta)');
    } else bad('B13', 'divergencia en conciliación post-fallos', JSON.stringify(detail13));

    // ── B14: conciliación pagos ↔ mayor financiero ──────────────────────
    // El asiento usa partida doble (sense debito/credito): Σ débitos ACT =
    // importe cobrado del pago mixto (1000 CUP).
    const fin = await finMovementsOf(mixId);
    const debitoSum = fin.movs.filter((m) => m.sense === 'debito').reduce((s, m) => s + Number(m.amount_cup), 0);
    const creditoSum = fin.movs.filter((m) => m.sense === 'credito').reduce((s, m) => s + Number(m.amount_cup), 0);
    const finOk = fin.entries.length >= 1 && fin.movs.length >= 2
      && fin.entries.every((e) => e.document_type === 'ORDEN_TRABAJO')
      && Math.abs(debitoSum - 1000) < 0.01
      && Math.abs(creditoSum - 1000) < 0.01;
    if (finOk) {
      ok('B14', `mayor financiero: asiento ORDEN_TRABAJO con partida doble (débitos ${debitoSum} = créditos ${creditoSum} = 1000 CUP del pago mixto)`);
    } else bad('B14', 'asiento financiero no concilia', JSON.stringify({ debitoSum, creditoSum, nEntries: fin.entries.length, nMovs: fin.movs.length }));

    // ── SEC1: clerk → 403 ───────────────────────────────────────────────
    const sec1 = await apiPost('clerkA', '/api/payments/ot-batch', { items: [item(FIXTURE.orders.o1, 10)] });
    if (sec1.status === 403) ok('SEC1', 'clerk → 403 (gate canManageStore antes de cualquier privilegio)');
    else bad('SEC1', 'esperado 403', JSON.stringify({ s: sec1.status }));

    // ── SEC2: no autenticado → 401 ──────────────────────────────────────
    const sec2 = await apiPost(null, '/api/payments/ot-batch', { items: [item(FIXTURE.orders.o1, 10)] });
    if (sec2.status === 401) ok('SEC2', 'solicitud no autenticada → 401');
    else bad('SEC2', 'esperado 401', JSON.stringify({ s: sec2.status }));

  } finally {
    await teardownFixtures();
    console.log(`\n=== RESUMEN R-03 batería: ${pass} PASS / ${fail} FAIL (triggers restaurados: ${triggersRestoredFlag}) ===`);
    const dl = JSON.stringify(results, null, 2);
    console.log(dl.length > 4000 ? dl.slice(0, 4000) + ' …(recortado)' : dl);
    process.exit(fail > 0 ? 1 : 0);
  }
}

await main();
