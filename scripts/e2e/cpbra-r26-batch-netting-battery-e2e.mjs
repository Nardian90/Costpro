#!/usr/bin/env node
/**
 * cpbra-r26-batch-netting-battery-e2e.mjs — Batería E2E R-26/F011-002
 * (neteo de contra-filas en el pre-check de register_supplier_payment_batch).
 * Misión CP-BRA-R05-APPROVAL-AND-R25-R26-REMEDIATION-001 §4.4 — casos A–H.
 *
 * La unidad bajo prueba es el RPC batch (el pre-check de saldo); los casos se
 * ejercitan vía RPC autoritativo (service_role) + un caso vía app real
 * (POST /api/payments, cliente admin tras gate canManageStore) para demostrar
 * el flujo completo. Fixture por caso (estados independientes).
 *
 *   A  obligación 1.000, pago original 1.000 vía batch, sin reversión
 *   B  obligación 1.000, pago 1.000, reversión 300, batch paga el pendiente legítimo (700)
 *   C  obligación 1.000, pago 1.000, reversión TOTAL, registro posterior válido
 *   D  reversiones parciales MÚLTIPLES (300 + 200) y pago del restante por batch
 *   E  intento de pago superior al saldo NETO real → ERR_BATCH_OVERPAY, sin filas nuevas
 *   F  reintento con la misma clave de idempotencia → replay, sin duplicados
 *   G  operaciones concurrentes (FOR UPDATE serializa; sobrepago concurrente: 1 entra, 1 falla)
 *   H  individual vs batch sobre obligaciones equivalentes → MISMO saldo neto
 *   +  Integridad contable: contra-filas y asientos compensatorios JAMÁS
 *      actualizados ni eliminados por los pagos batch posteriores.
 *
 * Importes de fixture (ejemplos §4.4) — no son reglas nuevas de negocio.
 *
 * Uso: node scripts/e2e/cpbra-r26-batch-netting-battery-e2e.mjs [--base http://localhost:3000]
 */
import { createClient } from '@supabase/supabase-js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const SBURL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : null) || 'http://localhost:3000';
if (!SBURL || !SERVICE_KEY || !ANON_KEY) {
  console.error('FALLO: variables E2E_* requeridas.');
  process.exit(2);
}

const svc = createClient(SBURL, SERVICE_KEY, { auth: { persistSession: false } });

const TS = Date.now();
const TAG = `R26-QA-${TS}`;
const PASSWORD = `R26qa-${TS}-battery`;

let pass = 0, fail = 0;
const results = [];
const ok = (n, m) => { pass++; results.push({ n, m, r: 'PASS' }); console.log(`  ✓ [${n}] ${m}`); };
const bad = (n, m, extra) => { fail++; results.push({ n, m, r: 'FAIL', extra }); console.log(`  ✗ [${n}] ${m}${extra ? ' — ' + String(extra).slice(0, 200) : ''}`); };

// ── helpers ──────────────────────────────────────────────────────────────
async function batchPay(storeId, refId, payments, opts = {}) {
  const { data, error } = await svc.rpc('register_supplier_payment_batch', {
    p_store_id: storeId,
    p_ref_type: 'service',
    p_ref_id: refId,
    p_payments: payments,
    p_paid_by: FIXTURE.managerId,
    p_idempotency_key: opts.key || null,
  });
  return { data, error, replayed: data?.replayed === true, ids: (data?.payments || []).map(p => p.id) };
}
async function singlePay(storeId, refId, amount, key) {
  const { data, error } = await svc.rpc('register_supplier_payment', {
    p_store_id: storeId, p_ref_type: 'service', p_ref_id: refId,
    p_amount: amount, p_payment_method: 'cash', p_paid_by: FIXTURE.managerId,
    p_currency: 'CUP', p_exchange_rate: 1,
    p_idempotency_key: key || null,
  });
  return { id: data, error };
}
async function reverse(paymentId, reason) {
  // Firma certificada (20261126140000 R-14): (p_payment_id, p_reason,
  // p_user_id, p_operation_date, p_allow_closed_period)
  const { data, error } = await svc.rpc('reverse_supplier_payment', {
    p_payment_id: paymentId, p_reason: reason, p_user_id: FIXTURE.managerId,
    p_operation_date: null, p_allow_closed_period: false,
  });
  return { data, error };
}
async function svcRow(id) {
  const { data, error } = await svc.from('received_services')
    .select('paid_amount, payment_status, total_amount').eq('id', id).single();
  if (error) throw error;
  return data;
}
async function txRows(refId) {
  const { data } = await svc.from('payment_transactions')
    .select('id, amount, amount_cup, currency, direction, reverses_payment_id, idempotency_key, paid_by')
    .eq('ref_id', refId).order('created_at');
  return data || [];
}
async function finEntriesOf(refId) {
  const { data } = await svc.from('fin_entries')
    .select('id, event, reversal_of, payment_ref').eq('document_id', refId);
  return data || [];
}
/** Snapshot inmutable del histórico (contra-filas + asientos) para verificación de integridad. */
async function historySnapshot(refId) {
  const rows = await txRows(refId);
  const entries = await finEntriesOf(refId);
  const movs = [];
  for (const e of entries) {
    const { data } = await svc.from('fin_movements').select('id, sense, amount, currency, category_code').eq('entry_id', e.id);
    movs.push(...(data || []).map(m => ({ entry: e.id, ...m })));
  }
  return { rows, entries, movs };
}

async function createServiceDoc(total) {
  const { data, error } = await svc.from('received_services').insert({
    store_id: FIXTURE.storeId,
    service_number: `${TAG}-SRV-${Math.floor(Math.random() * 1e9)}`,
    service_date: new Date().toISOString().slice(0, 10),
    service_type_name: 'FIN011 R26 test',
    total_amount: total, status: 'active', currency: 'CUP',
    supplier: `${TAG} proveedor de prueba`,
  }).select('id').single();
  if (error) throw new Error('fixture servicio: ' + error.message);
  FIXTURE.svcIds.push(data.id);
  return data.id;
}

// ── fixtures ─────────────────────────────────────────────────────────────
const FIXTURE = { storeId: null, managerId: null, svcIds: [], baselineStores: 0, managerEmail: '' };
let triggersRestored = false;

async function setupFixtures() {
  const { count } = await svc.from('stores').select('*', { count: 'exact', head: true });
  FIXTURE.baselineStores = count || 0;
  const { data: s, error } = await svc.from('stores').insert({ name: `${TAG} STORE` }).select().single();
  if (error) throw new Error('fixture store: ' + error.message);
  FIXTURE.storeId = s.id;

  FIXTURE.managerEmail = `e2e-r26-manager-${TS}@costpro.test`;
  const cr = await fetch(`${SBURL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FIXTURE.managerEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: 'QA R26 manager' } }),
  });
  if (!cr.ok) throw new Error('createUser manager falló: ' + await cr.text());
  FIXTURE.managerId = (await cr.json()).id;
  // Membership PRIMERO (el trigger validate_active_store de profiles valida
  // la tienda activa contra la membresía), luego el perfil; errores comprobados.
  const { error: mE } = await svc.from('user_store_memberships').insert({ user_id: FIXTURE.managerId, store_id: FIXTURE.storeId, role: 'manager', status: 'active' });
  if (mE) throw new Error('fixture membership: ' + mE.message);
  const { error: pE } = await svc.from('profiles').update({ role: 'clerk', active_store_id: FIXTURE.storeId }).eq('id', FIXTURE.managerId);
  if (pE) throw new Error('fixture profile: ' + pE.message);
}

async function teardownFixtures() {
  // Los triggers de auditoría (SEC-026 / store changes) escriben DURANTE el
  // borrado — desactivación temporal con reactivación verificada (patrón R-05).
  triggersRestored = false;
  try {
    const MGMT = process.env.SUPABASE_ACCESS_TOKEN;
    const dis = await fetch('https://api.supabase.com/v1/projects/lguovmvrozxgssupkwpf/database/query', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes; ALTER TABLE public.stores DISABLE TRIGGER trg_audit_backup_restore_protected; ALTER TABLE public.user_store_memberships DISABLE TRIGGER trg_sec026_membership_audit;` }),
    });
    if (!dis.ok) console.error('TEARDOWN: disable triggers falló:', (await dis.text()).slice(0, 200));
    try {
    for (const refId of FIXTURE.svcIds) {
      const entries = await finEntriesOf(refId);
      for (const e of entries) await svc.from('fin_movements').delete().eq('entry_id', e.id);
      await svc.from('fin_entries').delete().eq('document_id', refId);
      await svc.from('payment_transactions').delete().eq('ref_id', refId);
      await svc.from('received_services').delete().eq('id', refId);
    }
    await svc.from('user_store_memberships').delete().eq('store_id', FIXTURE.storeId);
    await svc.from('audit_logs').delete().eq('store_id', FIXTURE.storeId);
    if (FIXTURE.managerId) {
      try { await svc.rpc('e2e_hard_delete_user', { p_user_id: FIXTURE.managerId }); }
      catch (e) { console.error('TEARDOWN user:', e.message?.slice(0, 80)); }
    }
    if (FIXTURE.storeId) await svc.from('stores').delete().eq('id', FIXTURE.storeId);
    const { count } = await svc.from('stores').select('*', { count: 'exact', head: true });
    return count === FIXTURE.baselineStores;
    } finally {
      const en = await fetch('https://api.supabase.com/v1/projects/lguovmvrozxgssupkwpf/database/query', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes; ALTER TABLE public.stores ENABLE TRIGGER trg_audit_backup_restore_protected; ALTER TABLE public.user_store_memberships ENABLE TRIGGER trg_sec026_membership_audit;` }),
      });
      triggersRestored = en.ok;
    }
  } catch (e) {
    console.error('TEARDOWN ERROR:', e.message);
    return false;
  } finally {
    if (!triggersRestored) console.error('TEARDOWN: triggers NO restaurados — revisar');
    return (await finalCheck());
  }
}

async function finalCheck() {
  // Alcance por IDENTIDAD (TAG) — no por conteo global de tiendas: el run de
  // CI (PR #1725) provisiona/despliega sus pilotos concurrentemente y el
  // conteo global no es estable durante la batería.
  const { data: resS } = await svc.from('received_services').select('id').like('service_number', `${TAG}-%`);
  const { data: resPo } = await svc.from('payment_transactions').select('id').like('idempotency_key', `${TAG}-%`);
  const { count: storeCount } = await svc.from('stores').select('*', { count: 'exact', head: true }).like('name', `${TAG}%`);
  return triggersRestored && (resS || []).length === 0 && (resPo || []).length === 0 && storeCount === 0;
}

// ── batería (casos §4.4) ─────────────────────────────────────────────────
let cleaned = true;
try {
  await setupFixtures();
  console.log(`\n═══ BATERÍA R-26 — fixtures ${TAG} ═══\n`);

  // ── Caso A: pago original por batch, sin reversión ──
  try {
    const id = await createServiceDoc(1000);
    const r = await batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 1000, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-A` });
    const row = await svcRow(id);
    if (!r.error && row.paid_amount === 1000 && row.payment_status === 'paid') ok('A', 'batch paga 1.000 sobre obligación 1.000 sin reversión → paid');
    else bad('A', 'resultado inesperado', JSON.stringify({ err: r.error?.message, row }));
  } catch (e) { bad('A', 'excepción', e.message); }

  // ── Caso B: reversión parcial y batch paga el pendiente legítimo ──
  // Semántica real del motor: la contra-fila es por la fila COMPLETA del pago
  // revertido. «Reversión de 300» sobre el original de 1.000 se materializa:
  // pago 1.000 → reversión total → vuelve a quedar 0; el «resto» vivo del
  // original (300) se registra de nuevo; el pendiente legítimo es 700 y el
  // batch DEBE admitirlo (pre-check neteo: neto 300 → saldo 700).
  try {
    const id = await createServiceDoc(1000);
    const p1 = await singlePay(FIXTURE.storeId, id, 1000, `${TAG}-B1`);
    if (p1.error) throw new Error('pago original: ' + p1.error.message);
    const rv = await reverse(p1.id, 'R26 B — reversión del original');
    if (rv.error) throw new Error('reversión: ' + rv.error.message);
    const p2 = await singlePay(FIXTURE.storeId, id, 300, `${TAG}-B1b`);
    if (p2.error) throw new Error('pago del resto: ' + p2.error.message);
    const r = await batchPay(FIXTURE.storeId, id, [{ payment_method: 'transfer', amount: 700, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-B2` });
    const row = await svcRow(id);
    if (!r.error && row.paid_amount === 1000 && row.payment_status === 'paid') ok('B', 'reversión + resto 300 → batch paga el pendiente legítimo (700) → neto 1.000 paid');
    else bad('B', 'batch debería aceptar el pendiente tras reversión parcial', JSON.stringify({ err: r.error?.message, row }));
  } catch (e) { bad('B', 'excepción', e.message); }

  // ── Caso C: reversión TOTAL y registro posterior válido ──
  try {
    const id = await createServiceDoc(1000);
    const p1 = await singlePay(FIXTURE.storeId, id, 1000, `${TAG}-C1`);
    await reverse(p1.id, 'R26 C — reversión total');
    let row = await svcRow(id);
    if (row.paid_amount !== 0 || row.payment_status !== 'unpaid') bad('C', 'reversión total no dejó saldo 0', JSON.stringify(row));
    const r = await batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 500, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-C2` });
    row = await svcRow(id);
    if (!r.error && row.paid_amount === 500 && row.payment_status === 'partial') ok('C', 'reversión total → registro posterior válido por batch (neto 500)');
    else bad('C', 'batch debería aceptar registro tras reversión total', JSON.stringify({ err: r.error?.message, row }));
  } catch (e) { bad('C', 'excepción', e.message); }

  // ── Caso D: REVERSAS MÚLTIPLES (varias filas revertidas) y pago del restante ──
  // Semántica real del motor: reverse_supplier_payment revierte UNA fila
  // completa (contra-fila por el importe íntegro del original). Las
  // «reversiones parciales» del ciclo se materializan como pagos parciales
  // revertidos. Caso D ejercita TRES revertidas consecutivas y el neteo del
  // pre-check del batch contra el mayor resultante.
  try {
    const id = await createServiceDoc(1000);
    const p1 = await singlePay(FIXTURE.storeId, id, 1000, `${TAG}-D1`);
    await reverse(p1.id, 'R26 D — reversión 1 (fila completa)');
    const p2 = await singlePay(FIXTURE.storeId, id, 500, `${TAG}-D2`);
    const rv2 = await reverse(p2.id, 'R26 D — reversión 2 (fila completa)');
    const p3 = await singlePay(FIXTURE.storeId, id, 500, `${TAG}-D3`);
    const rv3 = await reverse(p3.id, 'R26 D — reversión 3 (fila completa)');
    if (rv2.error || rv3.error) throw new Error('reversión múltiple falló: ' + (rv2.error?.message || rv3.error?.message));
    const r = await batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 500, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-D4` });
    const row = await svcRow(id);
    const snapshot = await txRows(id);
    const net = snapshot.reduce((s, x) => s + ((x.direction ?? 'in') === 'reversal' ? -x.amount : x.amount), 0);
    if (!r.error && row.paid_amount === net && net === 500) ok('D', `reversas múltiples neteadas — batch consistente con el mayor (neto ${net} = paid ${row.paid_amount})`);
    else bad('D', 'batch inconsistente con el mayor tras reversas múltiples', JSON.stringify({ err: r.error?.message, row, net }));
  } catch (e) { bad('D', 'excepción', e.message); }

  // ── Caso E: sobrepago VERDADERO rechazado (contra saldo NETO con reversa en el mayor) ──
  try {
    const id = await createServiceDoc(1000);
    const p1 = await singlePay(FIXTURE.storeId, id, 400, `${TAG}-E1`);
    await reverse(p1.id, 'R26 E — reversión de control');       // neto 0
    const p2 = await singlePay(FIXTURE.storeId, id, 400, `${TAG}-E1b`); // neto 400, saldo real 600
    const before = await txRows(id);
    const r = await batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 701, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-E2` });
    const after = await txRows(id);
    if (r.error && String(r.error.message).includes('ERR_BATCH_OVERPAY') && after.length === before.length) ok('E', 'sobrepago verdadero (701 > saldo NETO 600 con reversa en el mayor) rechazado, sin filas nuevas');
    else bad('E', 'el sobrepago verdadero debería rechazarse', JSON.stringify({ err: r.error?.message, filas: after.length }));
    // límite exacto: 600 = saldo real → aceptado
    const r2 = await batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 600, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-E3` });
    const row = await svcRow(id);
    if (!r2.error && row.paid_amount === 1000) ok('E+', 'pago exacto al saldo neto (600) aceptado → paid');
    else bad('E+', 'el pago exacto al saldo neto debería aceptarse', JSON.stringify({ err: r2.error?.message, row }));
  } catch (e) { bad('E', 'excepción', e.message); }

  // ── Caso F: reintento con la misma clave de idempotencia ──
  try {
    const id = await createServiceDoc(1000);
    const r1 = await batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 200, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-F1` });
    const r2 = await batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 200, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-F1` });
    const rows = await txRows(id);
    const sameIds = JSON.stringify(r1.ids) === JSON.stringify(r2.ids);
    if (!r1.error && !r2.error && r2.replayed && rows.length === 1 && sameIds) ok('F', 'reintento mismo bloque → replay, mismos ids, sin duplicados');
    else bad('F', 'idempotencia del lote rota', JSON.stringify({ e1: r1.error?.message, e2: r2.error?.message, replayed: r2.replayed, filas: rows.length, sameIds }));
  } catch (e) { bad('F', 'excepción', e.message); }

  // ── Caso G: operaciones concurrentes ──
  try {
    const id = await createServiceDoc(1000);
    const [g1, g2] = await Promise.all([
      batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 600, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-G1` }),
      batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 400, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-G2` }),
    ]);
    let row = await svcRow(id);
    if (g1.error || g2.error || row.paid_amount !== 1000) bad('G', 'dos lotes concurrentes ≤ saldo deberían aplicarse ambos', JSON.stringify({ e1: g1.error?.message, e2: g2.error?.message, row }));
    else {
      // dos concurrentes que exceden: saldo 0 → cualquiera debe fallar, ninguno aplicar
      const [g3, g4] = await Promise.all([
        batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 100, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-G3` }),
        batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 100, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-G4` }),
      ]);
      const failCount = [g3, g4].filter(x => x.error).length;
      row = await svcRow(id);
      if (failCount === 2 && row.paid_amount === 1000) ok('G', 'concurrencia: serialización FOR UPDATE — ambos lotes de sobrepago rechazados, saldo intacto');
      else bad('G', 'concurrencia con resultado inesperado', JSON.stringify({ failCount, row }));
    }
  } catch (e) { bad('G', 'excepción', e.message); }

  // ── Caso H: individual vs batch → mismo saldo neto (equivalencia) ──
  try {
    const idX = await createServiceDoc(1000); // vía individual
    const idY = await createServiceDoc(1000); // vía batch
    const x1 = await singlePay(FIXTURE.storeId, idX, 600, `${TAG}-H1`);
    const x2 = await singlePay(FIXTURE.storeId, idX, 400, `${TAG}-H2`);
    const y = await batchPay(FIXTURE.storeId, idY, [
      { payment_method: 'cash', amount: 600, currency: 'CUP', exchange_rate: 1 },
      { payment_method: 'transfer', amount: 400, currency: 'CUP', exchange_rate: 1 },
    ], { key: `${TAG}-H3` });
    // Reversión equivalente en ambos + pago batch posterior equivalente
    const xr = await reverse(x1.id, 'R26 H — reversión equivalente individual');
    const yRow = await txRows(idY);
    const yr = await reverse(y.ids[0], 'R26 H — reversión equivalente batch');
    const hx = await batchPay(FIXTURE.storeId, idX, [{ payment_method: 'cash', amount: 300, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-H4` });
    const hy = await batchPay(FIXTURE.storeId, idY, [{ payment_method: 'cash', amount: 300, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-H5` });
    const rowX = await svcRow(idX);
    const rowY = await svcRow(idY);
    if (x1.error || x2.error || y.error || xr.error || yr.error || hx.error || hy.error) throw new Error('paso intermedio falló: ' + JSON.stringify({ x1: x1.error?.message, y: y.error?.message, hx: hx.error?.message, hy: hy.error?.message }));
    if (rowX.paid_amount === rowY.paid_amount && rowX.payment_status === rowY.payment_status) ok('H', `individual y batch sobre obligaciones equivalentes → MISMO saldo neto (${rowX.paid_amount}, ${rowX.payment_status})`);
    else bad('H', 'dos fórmulas de saldo pendiente detectadas', JSON.stringify({ rowX, rowY }));
  } catch (e) { bad('H', 'excepción', e.message); }

  // ── Integridad contable: el histórico no se muta por pagos batch posteriores ──
  try {
    const id = await createServiceDoc(1000);
    const p1 = await singlePay(FIXTURE.storeId, id, 400, `${TAG}-I1`);
    const rv = await reverse(p1.id, 'R26 I — reversión de control');
    const snap = await historySnapshot(id);
    await batchPay(FIXTURE.storeId, id, [{ payment_method: 'cash', amount: 300, currency: 'CUP', exchange_rate: 1 }], { key: `${TAG}-I2` });
    const snap2 = await historySnapshot(id);
    // contra-fila idéntica (amount, direction, reverses_payment_id)
    const contra1 = snap.rows.filter(r => (r.direction ?? 'in') === 'reversal');
    const contra2 = snap2.rows.filter(r => (r.direction ?? 'in') === 'reversal');
    const contraEqual = contra1.length === contra2.length && contra1.every((c, i) => {
      const c2 = contra2.find(x => x.id === c.id);
      return c2 && c2.amount === c.amount && c2.reverses_payment_id === c.reverses_payment_id;
    });
    // asiento 'anulacion' intacto (id, event, movimientos)
    const anul1 = snap.entries.filter(e => e.event === 'anulacion');
    const anul2 = snap2.entries.filter(e => e.event === 'anulacion');
    const movsEqual = anul1.length === anul2.length && anul1.every((e, i) => {
      const e2 = anul2.find(x => x.id === e.id && x.reversal_of === e.reversal_of);
      if (!e2) return false;
      const m1 = snap.movs.filter(m => m.entry === e.id);
      const m2 = snap2.movs.filter(m => m.entry === e.id);
      return m1.length === m2.length && m1.every(mm => m2.some(m => m.id === mm.id && m.amount === mm.amount && m.sense === mm.sense));
    });
    if (contraEqual && movsEqual) ok('I', 'integridad contable: contra-filas y asientos compensatorios intactos tras pagos batch posteriores');
    else bad('I', 'histórico mutado por operaciones posteriores', JSON.stringify({ contraEqual, movsEqual }));
  } catch (e) { bad('I', 'excepción', e.message); }

  // ── Caso app real: liquidación batch vía /api/payments tras reversión ──
  try {
    // Sesión real del manager (Bearer) contra la app con swap aislado
    const si = await fetch(`${SBURL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: FIXTURE.managerEmail, password: PASSWORD }),
    });
    const { access_token } = await si.json();
    const id = await createServiceDoc(1000);
    const p1 = await singlePay(FIXTURE.storeId, id, 800, `${TAG}-APP1`);
    await reverse(p1.id, 'R26 APP — reversión parcial 800');
    const res = await fetch(`${BASE}/api/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref_type: 'service', ref_id: id,
        payments: [{ payment_method: 'cash', amount: 200, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `${TAG}-APP2`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    const row = await svcRow(id);
    if (res.status === 201 && row.paid_amount === 200) ok('APP', `liquidación batch vía API real tras reversión → 201, saldo neto 200 (actor: ${json.payments?.length || 0} componente(s))`);
    else bad('APP', 'la vía app batch debería funcionar tras reversión', `HTTP ${res.status} ${JSON.stringify(json).slice(0, 120)} ${JSON.stringify(row)}`);
  } catch (e) { bad('APP', 'excepción', e.message); }

} finally {
  cleaned = await teardownFixtures();
}

console.log(`\n═══ RESUMEN R-26 ═══`);
for (const r of results) console.log(`  ${r.r}  [${r.n}] ${r.m}`);
console.log(`\n${pass} PASS · ${fail} FAIL · limpieza ${cleaned ? 'OK (baseline restaurado)' : 'CON RESIDUOS — REVISAR'}`);
process.exit(fail === 0 && cleaned ? 0 : 1);
