#!/usr/bin/env node
/**
 * cpbra-pay-commission-battery-e2e.mjs — Batería E2E §0.2/§5.4 (pay_commission)
 * vía API REAL de la app contra la BD AISLADA CostproE2E.
 * Misión CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 FASE 3.
 *
 * DECISIÓN DEL PROPIETARIO (§0.2): admin, manager y ENCARGADO pueden pagar
 * comisiones dentro de su tienda; clerk y usuario ordinario NO. La
 * autorización se verifica server-side y en la barrera autoritativa de BD
 * (pay_commission: has_store_role_as ARRAY['admin','manager','encargado'],
 * migración 20261127150000). Compat de admin de plataforma preservada.
 *
 * Requisito de entorno: servidor Next con SWAP aislado (patrón R-25/R-03).
 *
 * Casos §5.4:
 *   A1 admin de tienda (membresía admin) paga → OK, actor real
 *   A2 manager paga → OK
 *   A3 ENCARGADO paga → OK (el cierre §0.2 — antes rechazado)
 *   R1 clerk → 403 (ruta) y sin pago
 *   R2 usuario ordinario → 403
 *   R3 manager de OTRA tienda (activo en B, comisión en A) → 404 sin fuga
 *   R4 solicitud sin sesión → 401
 *   N1 comisión inexistente → 404
 *   N2 comisión ya pagada → replay idempotente (sin doble pago)
 *   N3 reintento duplicado → replay; exactamente 1 fila paid con el mismo paid_by
 *   C1 dos pagos SIMULTÁNEOS (advisory lock) → 1 paid + 1 replay/state-changed
 *   M1 manipulación de actor (clerk invoca el RPC directo con p_user_id del
 *      manager) → ERR_FORBIDDEN_ROLE (p_user_id solo service_role)
 *   M2 manipulación de tienda (pago desde tienda B de comisión en A vía RPC
 *      directo con sesión de A) → ERR_FORBIDDEN_ROLE / no pertenece
 *   F1 guard físico del cajón: pago 'cash' con caja vacía → ERR_INSUFFICIENT_CURRENCY (422)
 *   AUD1 auditoría del actor real: paid_by = usuario de la sesión
 *
 * Uso: node scripts/e2e/cpbra-pay-commission-battery-e2e.mjs [--base http://localhost:3000]
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
const TAG = `PC-QA-${TS}`;
const PASSWORD = `PCqa-${TS}-battery`;
const EMAIL = (role) => `e2e-pc-${role}-${TS}@costpro.test`;

let pass = 0, fail = 0;
const results = [];
const ok = (n, m) => { pass++; results.push({ n, m, r: 'PASS' }); console.log(`  ✓ [${n}] ${m}`); };
const bad = (n, m, extra) => { fail++; results.push({ n, m, r: 'FAIL', extra }); console.log(`  ✗ [${n}] ${m}${extra ? ' — ' + String(extra).slice(0, 240) : ''}`); };

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

// apiFetch: método arbitrario con Bearer JWT real
async function apiFetch(role, method, path, body) {
  const token = role === null ? null : await tokenOf(role);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, json };
}

// Cliente de sesión REAL (para invocar el RPC directo como lo haría la app)
async function sessionClient(role) {
  const token = await tokenOf(role);
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function createTestUser(role, globalRole) {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL(role), password: PASSWORD, email_confirm: true, user_metadata: { full_name: `QA PC ${role}` } }),
  });
  if (!res.ok) throw new Error(`createUser ${role} falló: HTTP ${res.status} ${await res.text()}`);
  const { id } = await res.json();
  const upd = { active_store_id: null, full_name: `QA PC ${role}` };
  if (globalRole) upd.role = globalRole;
  const { error } = await admin.from('profiles').update(upd).eq('id', id);
  if (error) throw new Error(`profile ${role}: ${error.message}`);
  return id;
}

const FIXTURE = { storeAId: null, storeBId: null, users: {}, workerA: null, commissions: {}, baselineStores: 0 };

async function createCommission(storeId, suffix, status, amount = 500) {
  const { data: c, error } = await admin.from('commission_payments').insert({
    store_id: storeId,
    worker_id: FIXTURE.workerA,
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    calculated_amount: amount,
    final_amount: amount,
    amount_cup: amount,
    currency: 'CUP',
    status,
    ...(status === 'approved' ? { approved_by: FIXTURE.users.adminA, approved_at: new Date().toISOString() } : {}),
    created_by: FIXTURE.users.adminA,
  }).select().single();
  if (error) throw new Error(`fixture comisión ${suffix}: ${error.message}`);
  return c.id;
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

  // Usuarios con rol global 'clerk' base (la capacidad REAL viene de la membresía)
  FIXTURE.users.adminA = await createTestUser('admin', 'clerk');
  EMAILS.adminA = EMAIL('admin');
  FIXTURE.users.managerA = await createTestUser('manager', 'clerk');
  EMAILS.managerA = EMAIL('manager');
  FIXTURE.users.encargadoA = await createTestUser('encargado', 'clerk');
  EMAILS.encargadoA = EMAIL('encargado');
  FIXTURE.users.clerkA = await createTestUser('clerk', 'clerk');
  EMAILS.clerkA = EMAIL('clerk');
  FIXTURE.users.usuarioA = await createTestUser('usuario', 'usuario');
  EMAILS.usuarioA = EMAIL('usuario');
  FIXTURE.users.managerB = await createTestUser('managerb', 'clerk');
  EMAILS.managerB = EMAIL('managerb');

  const { error: mE } = await admin.from('user_store_memberships').insert([
    { user_id: FIXTURE.users.adminA, store_id: FIXTURE.storeAId, role: 'admin', status: 'active' },
    { user_id: FIXTURE.users.managerA, store_id: FIXTURE.storeAId, role: 'manager', status: 'active' },
    { user_id: FIXTURE.users.encargadoA, store_id: FIXTURE.storeAId, role: 'encargado', status: 'active' },
    { user_id: FIXTURE.users.clerkA, store_id: FIXTURE.storeAId, role: 'clerk', status: 'active' },
    { user_id: FIXTURE.users.usuarioA, store_id: FIXTURE.storeAId, role: 'usuario', status: 'active' },
    { user_id: FIXTURE.users.managerB, store_id: FIXTURE.storeBId, role: 'manager', status: 'active' },
  ]);
  if (mE) throw new Error('fixture memberships: ' + mE.message);
  // Activos: todos en A excepto managerB en B
  await admin.from('profiles').update({ active_store_id: FIXTURE.storeAId }).in('id', [
    FIXTURE.users.adminA, FIXTURE.users.managerA, FIXTURE.users.encargadoA, FIXTURE.users.clerkA, FIXTURE.users.usuarioA,
  ]);
  await admin.from('profiles').update({ active_store_id: FIXTURE.storeBId }).eq('id', FIXTURE.users.managerB);

  const { data: w, error: wE } = await admin.from('workers').insert({
    store_id: FIXTURE.storeAId,
    first_name: 'QA',
    last_name: `${TAG}`,
    ci: `PC${TS}`,
    status: 'active',
  }).select().single();
  if (wE) throw new Error('fixture worker: ' + wE.message);
  FIXTURE.workerA = w.id;

  // Comisiones en A (approved para pagar) + draft + ya pagada + una en B
  FIXTURE.commissions.c1 = await createCommission(FIXTURE.storeAId, 'C1-ADMIN', 'approved');
  FIXTURE.commissions.c2 = await createCommission(FIXTURE.storeAId, 'C2-MANAGER', 'approved');
  FIXTURE.commissions.c3 = await createCommission(FIXTURE.storeAId, 'C3-ENCARGADO', 'approved');
  FIXTURE.commissions.c4 = await createCommission(FIXTURE.storeAId, 'C4-CLERK', 'approved');
  FIXTURE.commissions.c5 = await createCommission(FIXTURE.storeAId, 'C5-USUARIO', 'approved');
  FIXTURE.commissions.c6 = await createCommission(FIXTURE.storeAId, 'C6-REPLAY', 'approved');
  FIXTURE.commissions.c7 = await createCommission(FIXTURE.storeAId, 'C7-CONC', 'approved');
  FIXTURE.commissions.c8 = await createCommission(FIXTURE.storeAId, 'C8-CASH', 'approved');
  FIXTURE.commissions.cB = await createCommission(FIXTURE.storeBId, 'CB-INB', 'approved');
  // Ya pagada (por admin, servicio para replay)
  const { data: cp, error: cpE } = await admin.from('commission_payments').update({
    status: 'paid', paid_at: new Date().toISOString(), paid_by: FIXTURE.users.adminA, payment_method: 'transfer',
  }).eq('id', await createCommission(FIXTURE.storeAId, 'C9-PAID', 'approved')).select().single();
  if (cpE) throw new Error('fixture paid: ' + cpE.message);
  FIXTURE.commissions.cPaid = cp.id;
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
      const commIds = Object.values(FIXTURE.commissions).filter(Boolean);
      if (commIds.length) await admin.from('commission_payments').delete().in('id', commIds);
      if (FIXTURE.workerA) await admin.from('workers').delete().eq('id', FIXTURE.workerA);
      await admin.from('user_store_memberships').delete().in('store_id', [FIXTURE.storeAId, FIXTURE.storeBId].filter(Boolean));
      await admin.from('audit_logs').delete().in('store_id', [FIXTURE.storeAId, FIXTURE.storeBId].filter(Boolean));
      for (const uid of Object.values(FIXTURE.users)) {
        if (!uid) continue;
        await runSql(`select public.e2e_hard_delete_user('${uid}');`);
      }
      const { count: finalCount } = await admin.from('stores').select('*', { count: 'exact', head: true });
      if ((finalCount || 0) !== FIXTURE.baselineStores) {
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

async function commissionOf(id) {
  const { data } = await admin.from('commission_payments').select('status, paid_by, paid_at, payment_method').eq('id', id).single();
  return data;
}

async function main() {
  await setupFixtures();
  const payBody = (method = 'transfer') => ({ action: 'pay', payment_method: method, currency: 'CUP', exchange_rate: 1.0 });

  try {
    // ── A1: admin de tienda paga ────────────────────────────────────────
    const a1 = await apiFetch('adminA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c1}`, payBody());
    const c1 = await commissionOf(FIXTURE.commissions.c1);
    if (a1.status === 200 && c1?.status === 'paid' && c1.paid_by === FIXTURE.users.adminA) {
      ok('A1', 'admin de tienda (membresía) paga → OK, paid_by = usuario real');
    } else bad('A1', 'esperado 200 + paid', JSON.stringify({ s: a1.status, c1 }));

    // ── A2: manager paga ────────────────────────────────────────────────
    const a2 = await apiFetch('managerA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c2}`, payBody());
    const c2 = await commissionOf(FIXTURE.commissions.c2);
    if (a2.status === 200 && c2?.status === 'paid' && c2.paid_by === FIXTURE.users.managerA) {
      ok('A2', 'manager paga → OK, actor real');
    } else bad('A2', 'esperado 200 + paid', JSON.stringify({ s: a2.status, c2 }));

    // ── A3: ENCARGADO paga (el cierre §0.2) ─────────────────────────────
    const a3 = await apiFetch('encargadoA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c3}`, payBody());
    const c3 = await commissionOf(FIXTURE.commissions.c3);
    if (a3.status === 200 && c3?.status === 'paid' && c3.paid_by === FIXTURE.users.encargadoA) {
      ok('A3', 'ENCARGADO paga → OK (antes: 403 por gate de rol global y gate RPC sin encargado)');
    } else bad('A3', 'esperado 200 + paid para encargado (decisión §0.2)', JSON.stringify({ s: a3.status, j: a3.json, c3 }));

    // ── R1: clerk → 403 ─────────────────────────────────────────────────
    const r1 = await apiFetch('clerkA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c4}`, payBody());
    const c4 = await commissionOf(FIXTURE.commissions.c4);
    if (r1.status === 403 && c4?.status === 'approved') {
      ok('R1', 'clerk → 403 sin pago (gate canManageStore server-side)');
    } else bad('R1', 'esperado 403', JSON.stringify({ s: r1.status, c4 }));

    // ── R2: usuario ordinario → 403 ─────────────────────────────────────
    const r2 = await apiFetch('usuarioA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c5}`, payBody());
    const c5 = await commissionOf(FIXTURE.commissions.c5);
    if (r2.status === 403 && c5?.status === 'approved') {
      ok('R2', 'usuario ordinario → 403 sin pago');
    } else bad('R2', 'esperado 403', JSON.stringify({ s: r2.status, c5 }));

    // ── R3: manager de OTRA tienda → 404 sin fuga ───────────────────────
    const r3 = await apiFetch('managerB', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c1}`, payBody());
    if (r3.status === 404) {
      ok('R3', 'manager activo en B paga comisión de A → 404 (filtro de tienda activa, sin fuga)');
    } else bad('R3', 'esperado 404', JSON.stringify({ s: r3.status, j: r3.json }));

    // ── R4: sin sesión → 401 ────────────────────────────────────────────
    const r4 = await apiFetch(null, 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c1}`, payBody());
    if (r4.status === 401) ok('R4', 'solicitud sin sesión → 401');
    else bad('R4', 'esperado 401', JSON.stringify({ s: r4.status }));

    // ── N1: comisión inexistente → 404 ──────────────────────────────────
    const n1 = await apiFetch('managerA', 'PATCH', '/api/commissions/payments/99999999-9999-4999-8999-999999999999', payBody());
    if (n1.status === 404) ok('N1', 'comisión inexistente → 404');
    else bad('N1', 'esperado 404', JSON.stringify({ s: n1.status }));

    // ── N2: comisión ya pagada → replay idempotente ─────────────────────
    const n2 = await apiFetch('managerA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.cPaid}`, payBody());
    const cpRow = await commissionOf(FIXTURE.commissions.cPaid);
    if (n2.status === 200 && cpRow?.status === 'paid' && cpRow.paid_by === FIXTURE.users.adminA) {
      ok('N2', 'comisión ya pagada → replay (message ya estaba pagada) sin alterar paid_by original');
    } else bad('N2', 'esperado replay', JSON.stringify({ s: n2.status, j: n2.json, cpRow }));

    // ── N3: reintento duplicado → mismo pago, sin doble fila ────────────
    const n3a = await apiFetch('encargadoA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c6}`, payBody());
    const n3b = await apiFetch('encargadoA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c6}`, payBody());
    const { data: c6Rows, error: c6Err } = await admin.from('commission_payments').select('id, status, paid_by, paid_at').eq('id', FIXTURE.commissions.c6);
    if (n3a.status === 200 && n3b.status === 200 && !c6Err && c6Rows.length === 1 && c6Rows[0].paid_by === FIXTURE.users.encargadoA) {
      ok('N3', 'pago duplicado (dos PATCH) → replay idempotente; UNA fila paid con paid_by del primer pago');
    } else bad('N3', 'esperado replay sin duplicación', JSON.stringify({ a: n3a.status, b: n3b.status, c6Rows }));

    // ── C1: dos pagos simultáneos (advisory lock) ───────────────────────
    const [c1r, c2r] = await Promise.all([
      apiFetch('managerA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c7}`, payBody()),
      apiFetch('encargadoA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c7}`, payBody()),
    ]);
    const c7 = await commissionOf(FIXTURE.commissions.c7);
    const onePaid = c7?.status === 'paid';
    const okPair = [c1r, c2r].every((r) => r.status === 200 || r.status === 409 || r.status === 422);
    if (onePaid && okPair) {
      ok('C1', `pagos simultáneos → advisory lock serializa: ${c1r.status}/${c2r.status}, UNA fila paid`);
    } else bad('C1', 'concurrencia mal resuelta', JSON.stringify({ c1r: c1r.status, c2r: c2r.status, c7 }));

    // ── M1: manipulación de actor (clerk invoca RPC directo con p_user_id del manager) ──
    const clerkClient = await sessionClient('clerkA');
    const { error: m1Err } = await clerkClient.rpc('pay_commission', {
      p_payment_id: FIXTURE.commissions.c4,
      p_payment_method: 'transfer',
      p_reference: null,
      p_currency: 'CUP',
      p_exchange_rate: 1.0,
      p_paid_at: new Date().toISOString(),
      p_user_id: FIXTURE.users.managerA, // spoofing del actor
    });
    const c4After = await commissionOf(FIXTURE.commissions.c4);
    if (m1Err && String(m1Err.message).includes('ERR_FORBIDDEN_ROLE') && c4After?.status === 'approved') {
      ok('M1', 'spoofing de actor (p_user_id del manager con sesión clerk) → ERR_FORBIDDEN_ROLE; p_user_id NO concede privilegios a authenticated');
    } else bad('M1', 'anti-spoofing falló', JSON.stringify({ err: m1Err?.message, c4After }));

    // ── M2: manipulación de tienda (manager B invoca RPC directo sobre comisión de A) ──
    const bClient = await sessionClient('managerB');
    const { error: m2Err } = await bClient.rpc('pay_commission', {
      p_payment_id: FIXTURE.commissions.c2,
      p_payment_method: 'transfer',
      p_reference: null,
      p_currency: 'CUP',
      p_exchange_rate: 1.0,
      p_paid_at: new Date().toISOString(),
      p_user_id: FIXTURE.users.managerB,
    });
    if (m2Err && String(m2Err.message).includes('ERR_FORBIDDEN_ROLE')) {
      ok('M2', 'manager de otra tienda vía RPC directo → ERR_FORBIDDEN_ROLE (barrera DB por membresía de tienda)');
    } else bad('M2', 'barrera de tienda falló', JSON.stringify({ err: m2Err?.message }));

    // ── F1: guard físico del cajón (cash con caja vacía) ────────────────
    const f1 = await apiFetch('managerA', 'PATCH', `/api/commissions/payments/${FIXTURE.commissions.c8}`, payBody('cash'));
    const c8 = await commissionOf(FIXTURE.commissions.c8);
    if (f1.status === 422 && f1.json?.code === 'ERR_INSUFFICIENT_CURRENCY' && c8?.status === 'approved') {
      ok('F1', 'pago en EFECTIVO con caja vacía → 422 ERR_INSUFFICIENT_CURRENCY (protocolo del cajón intacto)');
    } else bad('F1', 'esperado 422 ERR_INSUFFICIENT_CURRENCY', JSON.stringify({ s: f1.status, j: f1.json, c8 }));

    // ── AUD1: auditoría del actor real (verificación transversal) ───────
    const { data: aud } = await admin.from('commission_payments')
      .select('id, paid_by, status, payment_method')
      .in('id', [FIXTURE.commissions.c1, FIXTURE.commissions.c2, FIXTURE.commissions.c3]);
    const audOk = (aud || []).every((r) => r.status === 'paid' && r.payment_method === 'transfer'
      && [FIXTURE.users.adminA, FIXTURE.users.managerA, FIXTURE.users.encargadoA].includes(r.paid_by));
    if (audOk) ok('AUD1', 'auditoría: paid_by real (admin/manager/encargado) + método registrado en las 3 comisiones pagadas');
    else bad('AUD1', 'auditoría inconsistente', JSON.stringify(aud));

  } finally {
    await teardownFixtures();
    console.log(`\n=== RESUMEN pay_commission batería: ${pass} PASS / ${fail} FAIL (triggers restaurados: ${triggersRestoredFlag}) ===`);
    const dl = JSON.stringify(results, null, 2);
    console.log(dl.length > 3600 ? dl.slice(0, 3600) + ' …(recortado)' : dl);
    process.exit(fail > 0 ? 1 : 0);
  }
}

await main();
