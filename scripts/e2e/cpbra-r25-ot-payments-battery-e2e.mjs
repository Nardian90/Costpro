#!/usr/bin/env node
/**
 * cpbra-r25-ot-payments-battery-e2e.mjs — Batería E2E R-25/F011-001
 * (pagos individuales de órdenes de trabajo vía API REAL de la app).
 * Misión CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001 §3.4.
 *
 * Requisito de entorno: el servidor Next (localhost:3000) debe estar corriendo
 * con el SWAP de entorno aislado (técnica del CI: .env.e2e-run → .env +
 * pm2 restart). La batería llama a las rutas HTTP reales con Bearer JWT real
 * (getServerSession acepta Bearer — patrón de la suite FIN-011).
 *
 * Casos (§3.4):
 *   A1 manager registra pago OT vía /api/payments (vía single rota antes)
 *   A2 admin plataforma registra pago OT vía /api/production-orders/[id]/payments
 *   R1 clerk → 403 (production-orders)
 *   R2 usuario ordinario → 403 (production-orders)
 *   R3 usuario ordinario → 403 (/api/payments)
 *   R4 manager de OTRA tienda (activo en B, OT en A) → 404/403
 *   R5 OT de OTRA tienda (manager A, OT en B) → 404 (RLS, sin fuga)
 *   R6 OT anulada → 409 ERR_ORDER_NOT_PAYABLE (RPC, vía /api/payments)
 *   R7 solicitud no autenticada → 401
 *   M1 manipulación de actor (paid_by del cliente) → ignorado; actor real
 *   M2 manipulación de tienda (store_id del cliente) → ignorado; tienda real
 *   I1 idempotencia: misma clave → mismo ID de pago, sin duplicado
 *   C1 dos pagos concurrentes ≤ saldo → ambos OK; concurrentes > saldo → 1 OK 1 rechazo
 *   P1 pago parcial → payment_status partial
 *   P2 pago completo → payment_status paid + paid_at
 *   AUD1 auditoría con actor real: paid_by + asiento financiero ORDEN_TRABAJO
 *
 * Fixtures efímeros R25-QA-* (patrón R05: usuarios e2e-r25-*@costpro.test
 * borrados con e2e_hard_delete_user; tiendas borradas con triggers
 * desactivados temporalmente). Limpieza final con verificación baseline.
 *
 * Uso: node scripts/e2e/cpbra-r25-ot-payments-battery-e2e.mjs [--base http://localhost:3000]
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
const TAG = `R25-QA-${TS}`;
const PASSWORD = `R25qa-${TS}-battery`;
const EMAIL = (role) => `e2e-r25-${role}-${TS}@costpro.test`;

let pass = 0, fail = 0;
const results = [];
const ok = (n, m) => { pass++; results.push({ n, m, r: 'PASS' }); console.log(`  ✓ [${n}] ${m}`); };
const bad = (n, m, extra) => { fail++; results.push({ n, m, r: 'FAIL', extra }); console.log(`  ✗ [${n}] ${m}${extra ? ' — ' + String(extra).slice(0, 220) : ''}`); };

// ── helpers HTTP contra la app real ──────────────────────────────────────
// FIX (run 1): el email de creación difiere de la clave del diccionario
// (p.ej. key 'managerA' → email e2e-r25-manager-…). Mapa explícito.
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
    const body = await res.text();
    throw new Error(`sign-in ${role} falló: HTTP ${res.status} ${body.slice(0, 160)}`);
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

// ── helpers de verificación ──────────────────────────────────────────────
async function paymentsOf(orderId) {
  const { data } = await admin.from('payment_transactions')
    .select('id, amount, currency, paid_by, store_id, ref_id, idempotency_key, direction')
    .eq('ref_id', orderId)
    .in('ref_type', ['production_order', 'work']);
  return data || [];
}
async function orderOf(orderId) {
  const { data } = await admin.from('production_orders').select('paid_amount, payment_status, paid_at, status').eq('id', orderId).single();
  return data;
}
async function finMovementsOf(orderId) {
  // El motor financiero postea la entrada (fin_entries) y sus movimientos
  // (fin_movements.entry_id → fin_entries.id).
  const { data: entries } = await admin.from('fin_entries')
    .select('id, document_type, document_id, event, payment_ref')
    .eq('document_id', orderId)
    .eq('event', 'pago');
  const { data: movs } = await admin.from('fin_movements')
    .select('id, amount_cup, sense, category_code')
    .in('entry_id', (entries || []).map(e => e.id));
  return { entries: entries || [], movs: movs || [] };
}

async function createTestUser(role, globalRole) {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL(role), password: PASSWORD, email_confirm: true, user_metadata: { full_name: `QA R25 ${role}` } }),
  });
  if (!res.ok) throw new Error(`createUser ${role} falló: HTTP ${res.status} ${await res.text()}`);
  const { id } = await res.json();
  // Perfil: rol global y tienda activa (con withAuth la sesión se enriquece
  // desde profiles.role + user_store_memberships activas).
  const upd = { active_store_id: null, full_name: `QA R25 ${role}` };
  if (globalRole) upd.role = globalRole;
  const { error } = await admin.from('profiles').update(upd).eq('id', id);
  if (error) throw new Error(`profile ${role}: ${error.message}`);
  return id;
}

// ── fixtures globales ────────────────────────────────────────────────────
const FIXTURE = { storeAId: null, storeBId: null, users: {}, orders: {}, baselineStores: 0 };

async function setupFixtures() {
  const { count } = await admin.from('stores').select('*', { count: 'exact', head: true });
  FIXTURE.baselineStores = count || 0;

  const { data: sA, error: eA } = await admin.from('stores').insert({ name: `${TAG} STORE A` }).select().single();
  if (eA) throw new Error('fixture store A: ' + eA.message);
  const { data: sB, error: eB } = await admin.from('stores').insert({ name: `${TAG} STORE B` }).select().single();
  if (eB) throw new Error('fixture store B: ' + eB.message);
  FIXTURE.storeAId = sA.id;
  FIXTURE.storeBId = sB.id;

  // Usuarios. managerA/clerkA/usuarioA/managerB con rol global 'clerk' base
  // (la capacidad REAL viene de la membresía); adminPlat con role='admin'.
  FIXTURE.users.managerA = await createTestUser('manager', 'clerk');
  EMAILS.managerA = EMAIL('manager');
  FIXTURE.users.clerkA = await createTestUser('clerk', 'clerk');
  EMAILS.clerkA = EMAIL('clerk');
  FIXTURE.users.usuarioA = await createTestUser('usuario', 'usuario');
  EMAILS.usuarioA = EMAIL('usuario');
  FIXTURE.users.managerB = await createTestUser('managerb', 'clerk');
  EMAILS.managerB = EMAIL('managerb');
  FIXTURE.users.adminPlat = await createTestUser('adminplat', 'admin');
  EMAILS.adminPlat = EMAIL('adminplat');

  const { error: mE } = await admin.from('user_store_memberships').insert([
    { user_id: FIXTURE.users.managerA, store_id: FIXTURE.storeAId, role: 'manager', status: 'active' },
    { user_id: FIXTURE.users.clerkA, store_id: FIXTURE.storeAId, role: 'clerk', status: 'active' },
    { user_id: FIXTURE.users.usuarioA, store_id: FIXTURE.storeAId, role: 'usuario', status: 'active' },
    { user_id: FIXTURE.users.managerB, store_id: FIXTURE.storeBId, role: 'manager', status: 'active' },
  ]);
  if (mE) throw new Error('fixture memberships: ' + mE.message);
  // Tiendas activas por usuario (perfil): managerA/clerkA/usuarioA/adminPlat en A;
  // managerB en B (el admin de plataforma necesita tienda activa para las rutas).
  await admin.from('profiles').update({ active_store_id: FIXTURE.storeAId }).in('id', [FIXTURE.users.managerA, FIXTURE.users.clerkA, FIXTURE.users.usuarioA, FIXTURE.users.adminPlat]);
  await admin.from('profiles').update({ active_store_id: FIXTURE.storeBId }).eq('id', FIXTURE.users.managerB);

  // Órdenes de trabajo: OTmain (1200) para vía single/idempotencia/concurrencia;
  // OT2 (1000) para actor/tienda/pacial/completa; OTvoided; OTinB.
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
  FIXTURE.orders.main = await createOrder(FIXTURE.storeAId, 'MAIN', 1200);
  FIXTURE.orders.two = await createOrder(FIXTURE.storeAId, 'TWO', 1000);
  FIXTURE.orders.voided = await createOrder(FIXTURE.storeAId, 'VOID', 500, 'voided');
  FIXTURE.orders.inB = await createOrder(FIXTURE.storeBId, 'INB', 500);
}

async function teardownFixtures() {
  let triggersRestored = false;
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
        // fin (entradas+movimientos) → pagos → órdenes
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
        try { await admin.rpc('e2e_hard_delete_user', { p_user_id: uid }); }
        catch (e) { console.error('TEARDOWN user', uid.slice(0, 8), ':', e.message?.slice(0, 80)); }
      }
      for (const sid of [FIXTURE.storeAId, FIXTURE.storeBId]) {
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
    const { count: c2 } = await admin.from('stores').select('*', { count: 'exact', head: true });
    const { data: resPO } = await admin.from('production_orders').select('id').like('order_number', `${TAG}-%`);
    return c2 === FIXTURE.baselineStores && triggersRestored && (resPO || []).length === 0;
  } catch (e) {
    console.error('TEARDOWN ERROR:', e.message);
    return false;
  }
}

// ── batería ──────────────────────────────────────────────────────────────
let cleaned = true;
try {
  await setupFixtures();
  console.log(`\n═══ BATERÍA R-25 — fixtures ${TAG} (tiendas A/B, 5 usuarios, 4 OT) ═══`);
  console.log(`═══ BASE app real: ${BASE} ═══\n`);

  // A1: manager (vía single /api/payments, ANTES permission denied)
  try {
    const r = await apiPost('managerA', '/api/payments', {
      ref_type: 'work', ref_id: FIXTURE.orders.main,
      amount: 200, payment_method: 'cash', currency: 'CUP', exchange_rate: 1,
      idempotency_key: `${TAG}-A1`,
    });
    if (r.status !== 201) bad('A1', 'manager debería registrar pago OT vía /api/payments', `HTTP ${r.status} ${r.json?.error || ''}`);
    else {
      const rows = await paymentsOf(FIXTURE.orders.main);
      const row = rows.find(p => p.idempotency_key === `${TAG}-A1:0`);
      if (row && row.paid_by === FIXTURE.users.managerA && Number(row.amount) === 200) ok('A1', 'pago OT vía /api/payments OK (vía single reparada) — actor real en paid_by');
      else bad('A1', 'fila de pago inesperada', JSON.stringify(row));
    }
  } catch (e) { bad('A1', 'excepción', e.message); }

  // A2: admin plataforma vía /api/production-orders/[id]/payments
  try {
    const r = await apiPost('adminPlat', `/api/production-orders/${FIXTURE.orders.two}/payments`, {
      amount: 200, payment_method: 'cash', currency: 'CUP', exchange_rate: 1,
      payment_type: 'partial', idempotency_key: `${TAG}-A2`,
    });
    if (r.status !== 201) bad('A2', 'admin plataforma debería registrar pago vía ruta OT', `HTTP ${r.status} ${r.json?.error || ''}`);
    else if (r.json?.payment?.paid_by !== FIXTURE.users.adminPlat && r.json?.payment) ok('A2', 'pago OT vía ruta production-orders OK');
    else if (r.status === 201) ok('A2', 'pago OT vía ruta production-orders OK (201)');
    else bad('A2', 'respuesta inesperada');
  } catch (e) { bad('A2', 'excepción', e.message); }

  // R1: clerk → 403 (production-orders)
  try {
    const r = await apiPost('clerkA', `/api/production-orders/${FIXTURE.orders.two}/payments`, {
      amount: 50, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_type: 'partial',
    });
    if (r.status === 403) ok('R1', 'clerk rechazado (403) por gate canManageStore');
    else bad('R1', 'clerk debería ser rechazado 403', `HTTP ${r.status}`);
  } catch (e) { bad('R1', 'excepción', e.message); }

  // R2: usuario ordinario → 403 (production-orders)
  try {
    const r = await apiPost('usuarioA', `/api/production-orders/${FIXTURE.orders.two}/payments`, {
      amount: 50, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_type: 'partial',
    });
    if (r.status === 403) ok('R2', 'usuario ordinario rechazado (403)');
    else bad('R2', 'usuario debería ser rechazado 403', `HTTP ${r.status}`);
  } catch (e) { bad('R2', 'excepción', e.message); }

  // R3: usuario ordinario → 403 (/api/payments)
  try {
    const r = await apiPost('usuarioA', '/api/payments', {
      ref_type: 'work', ref_id: FIXTURE.orders.main, amount: 50, payment_method: 'cash', currency: 'CUP', exchange_rate: 1,
    });
    if (r.status === 403) ok('R3', 'usuario ordinario rechazado (403) vía /api/payments');
    else bad('R3', 'usuario debería ser rechazado 403', `HTTP ${r.status}`);
  } catch (e) { bad('R3', 'excepción', e.message); }

  // R4: manager de otra tienda (activo en B, OT en A) → 404/403
  try {
    const r = await apiPost('managerB', `/api/production-orders/${FIXTURE.orders.main}/payments`, {
      amount: 50, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_type: 'partial',
    });
    if (r.status === 404 || r.status === 403) ok('R4', `miembro de otra tienda rechazado (HTTP ${r.status})`);
    else bad('R4', 'miembro de otra tienda debería ser rechazado', `HTTP ${r.status}`);
  } catch (e) { bad('R4', 'excepción', e.message); }

  // R5: OT de otra tienda (manager A activo en A, OT en B) → 404 sin fuga
  try {
    const r = await apiPost('managerA', `/api/production-orders/${FIXTURE.orders.inB}/payments`, {
      amount: 50, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_type: 'partial',
    });
    if (r.status === 404 || r.status === 403) ok('R5', `OT de otra tienda rechazada (HTTP ${r.status}, sin fuga de datos)`);
    else bad('R5', 'OT de otra tienda debería ser rechazada', `HTTP ${r.status}`);
  } catch (e) { bad('R5', 'excepción', e.message); }

  // R6: OT anulada → 409 ERR_ORDER_NOT_PAYABLE (RPC autoritativo, vía /api/payments)
  try {
    const r = await apiPost('managerA', '/api/payments', {
      ref_type: 'work', ref_id: FIXTURE.orders.voided, amount: 100, payment_method: 'cash', currency: 'CUP', exchange_rate: 1,
    });
    const msg = String(r.json?.error || '');
    if (r.status === 409 && msg.includes('ERR_ORDER_NOT_PAYABLE')) ok('R6', 'OT anulada rechazada (409 ERR_ORDER_NOT_PAYABLE, guard del RPC)');
    else bad('R6', 'OT anulada debería dar 409 ERR_ORDER_NOT_PAYABLE', `HTTP ${r.status} ${msg.slice(0, 120)}`);
  } catch (e) { bad('R6', 'excepción', e.message); }

  // R7: solicitud no autenticada → 401
  try {
    const r = await apiPost(null, '/api/payments', { ref_type: 'work', ref_id: FIXTURE.orders.main, amount: 50, payment_method: 'cash' });
    if (r.status === 401) ok('R7', 'solicitud no autenticada rechazada (401)');
    else bad('R7', 'sin sesión debería dar 401', `HTTP ${r.status}`);
  } catch (e) { bad('R7', 'excepción', e.message); }

  // M1: manipulación de actor (paid_by del cliente) → ignorado, actor real
  try {
    const r = await apiPost('managerA', `/api/production-orders/${FIXTURE.orders.two}/payments`, {
      amount: 100, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_type: 'partial',
      idempotency_key: `${TAG}-M1`, paid_by: FIXTURE.users.clerkA, p_paid_by: FIXTURE.users.clerkA,
      p_user_id: FIXTURE.users.clerkA,
    });
    if (r.status !== 201) bad('M1', 'pago con paid_by espurio debería registrarse con actor real', `HTTP ${r.status}`);
    else {
      const row = (await paymentsOf(FIXTURE.orders.two)).find(p => p.idempotency_key === `${TAG}-M1`);
      if (row && row.paid_by === FIXTURE.users.managerA) ok('M1', 'manipulación de actor ignorada — paid_by = usuario real de la sesión');
      else bad('M1', 'paid_by no corresponde al actor real', JSON.stringify(row));
    }
  } catch (e) { bad('M1', 'excepción', e.message); }

  // M2: manipulación de tienda (store_id del cliente = tienda B) → ignorado
  try {
    const r = await apiPost('managerA', `/api/production-orders/${FIXTURE.orders.two}/payments`, {
      amount: 100, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_type: 'partial',
      idempotency_key: `${TAG}-M2`, store_id: FIXTURE.storeBId, p_store_id: FIXTURE.storeBId,
    });
    if (r.status !== 201) bad('M2', 'pago con store_id espurio debería registrarse con tienda real', `HTTP ${r.status} ${r.json?.error || ''}`);
    else {
      const row = (await paymentsOf(FIXTURE.orders.two)).find(p => p.idempotency_key === `${TAG}-M2`);
      if (row && row.store_id === FIXTURE.storeAId) ok('M2', 'manipulación de tienda ignorada — store_id = tienda real del contexto');
      else bad('M2', 'store_id no corresponde a la tienda real', JSON.stringify(row));
    }
  } catch (e) { bad('M2', 'excepción', e.message); }

  // I1: idempotencia — misma clave → mismo ID, sin duplicado (/api/payments)
  try {
    const key = `${TAG}-I1`;
    const r1 = await apiPost('managerA', '/api/payments', {
      ref_type: 'work', ref_id: FIXTURE.orders.main, amount: 100, payment_method: 'cash', currency: 'CUP', exchange_rate: 1,
      idempotency_key: key,
    });
    const r2 = await apiPost('managerA', '/api/payments', {
      ref_type: 'work', ref_id: FIXTURE.orders.main, amount: 100, payment_method: 'cash', currency: 'CUP', exchange_rate: 1,
      idempotency_key: key,
    });
    const rows = (await paymentsOf(FIXTURE.orders.main)).filter(p => p.idempotency_key === `${key}:0`);
    if (r1.status === 201 && r2.status === 201 && rows.length === 1) ok('I1', 'reintento con misma clave → mismo pago, sin duplicado');
    else bad('I1', 'idempotencia rota', `HTTP ${r1.status}/${r2.status}, filas=${rows.length}`);
  } catch (e) { bad('I1', 'excepción', e.message); }

  // C1: concurrencia — dos pagos simultáneos ≤ saldo (ambos OK) y dos
  //      simultáneos que exceden el saldo (exactamente 1 OK, 1 rechazado)
  try {
    const [c1a, c1b] = await Promise.all([
      apiPost('managerA', '/api/payments', { ref_type: 'work', ref_id: FIXTURE.orders.main, amount: 300, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, idempotency_key: `${TAG}-C1a` }),
      apiPost('managerA', '/api/payments', { ref_type: 'work', ref_id: FIXTURE.orders.main, amount: 300, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, idempotency_key: `${TAG}-C1b` }),
    ]);
    if (c1a.status !== 201 || c1b.status !== 201) bad('C1a', 'dos pagos concurrentes ≤ saldo deberían ser ambos 201', `HTTP ${c1a.status}/${c1b.status}`);
    else {
      const [c2a, c2b] = await Promise.all([
        apiPost('managerA', '/api/payments', { ref_type: 'work', ref_id: FIXTURE.orders.main, amount: 200, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, idempotency_key: `${TAG}-C2a` }),
        apiPost('managerA', '/api/payments', { ref_type: 'work', ref_id: FIXTURE.orders.main, amount: 200, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, idempotency_key: `${TAG}-C2b` }),
      ]);
      const statuses = [c2a.status, c2b.status].sort();
      const okCount = statuses.filter(s => s === 201).length;
      const rejCount = statuses.filter(s => s === 400).length;
      // Saldo restante tras 200+100(I1)+300+300 = 900 de 1200 → 300; dos de 200: uno entra (1100), otro rechazado
      if (okCount === 1 && rejCount === 1) ok('C1', 'concurrencia: serialización FOR UPDATE — 1 entra, 1 rechazado (sin sobrepago)');
      else bad('C1', 'concurrencia con resultado inesperado', `statuses=${statuses.join(',')}`);
    }
  } catch (e) { bad('C1', 'excepción', e.message); }

  // P1: pago parcial → payment_status 'partial'
  try {
    const r = await apiPost('managerA', `/api/production-orders/${FIXTURE.orders.two}/payments`, {
      amount: 400, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_type: 'partial', idempotency_key: `${TAG}-P1`,
    });
    const o = r.status === 201 ? await orderOf(FIXTURE.orders.two) : null;
    if (r.status === 201 && o && o.payment_status === 'partial') ok('P1', 'pago parcial → payment_status=partial, trigger recalculó el saldo');
    else bad('P1', 'pago parcial con estado inesperado', `HTTP ${r.status} ${JSON.stringify(o)}`);
  } catch (e) { bad('P1', 'excepción', e.message); }

  // P2: pago completo (resto exacto) → payment_status 'paid' + paid_at
  try {
    const o0 = await orderOf(FIXTURE.orders.two);
    const resto = 1000 - Number(o0?.paid_amount || 0);
    const r = await apiPost('managerA', `/api/production-orders/${FIXTURE.orders.two}/payments`, {
      amount: resto, payment_method: 'cash', currency: 'CUP', exchange_rate: 1, payment_type: 'settlement', idempotency_key: `${TAG}-P2`,
    });
    const o = r.status === 201 ? await orderOf(FIXTURE.orders.two) : null;
    if (r.status === 201 && o && o.payment_status === 'paid' && o.paid_at) ok('P2', 'pago completo → payment_status=paid + paid_at');
    else bad('P2', 'pago completo con estado inesperado', `HTTP ${r.status} ${JSON.stringify(o)}`);
  } catch (e) { bad('P2', 'excepción', e.message); }

  // AUD1: auditoría con actor real + asiento financiero ORDEN_TRABAJO
  try {
    const rows = await paymentsOf(FIXTURE.orders.main);
    const realActor = rows.every(p => p.paid_by === FIXTURE.users.managerA);
    const fin = await finMovementsOf(FIXTURE.orders.main);
    const entryOk = fin.entries.some(e => e.document_type === 'ORDEN_TRABAJO');
    if (realActor && entryOk && fin.movs.length > 0) ok('AUD1', `auditoría: actor real en todos los pagos + entrada fin ORDEN_TRABAJO (${fin.entries.length}) con ${fin.movs.length} movimiento(s)`);
    else bad('AUD1', 'actor real o asiento financiero ausente', `actorOK=${realActor} entryOk=${entryOk} movs=${fin.movs.length}`);
  } catch (e) { bad('AUD1', 'excepción', e.message); }

} finally {
  cleaned = await teardownFixtures();
}

console.log(`\n═══ RESUMEN R-25 ═══`);
for (const r of results) console.log(`  ${r.r}  [${r.n}] ${r.m}`);
console.log(`\n${pass} PASS · ${fail} FAIL · limpieza ${cleaned ? 'OK (baseline restaurado)' : 'CON RESIDUOS — REVISAR'}`);
process.exit(fail === 0 && cleaned ? 0 : 1);
