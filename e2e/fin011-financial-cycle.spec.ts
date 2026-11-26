/**
 * FIN-011 — E2E dedicado del ciclo financiero completo:
 *   pagos → reversiones → monedas/tasas → conciliación (misión
 *   CP-BRA-INV005-FIN011-CLOSURE-001 §3.2, escenarios A–F + §3.3).
 *
 * La evidencia que faltaba para elevar FIN-011 (CERTIFICATION-MATRIX §3):
 * «E2E dedicado de reversiones×monedas×conciliación». La suite ejercita la
 * VÍA REAL de la aplicación (rutas API con sesión autenticada —
 * getServerSession acepta Bearer JWT + canManageStore server-side) contra la
 * BD AISLADA CostproE2E:
 *
 *   A  Pago parcial (OT CUP)  → saldo pendiente, estado partial, fila del
 *                                motor con tasa 1 (CUP=CUP, sin conversión)
 *   B  Pago completo (OT CUP) → saldo cero, estado paid, sin duplicados
 *   C  Reversión parcial (servicio) → contra-fila exacta neteada + asiento
 *                                compensatorio (fin_entries anulacion con
 *                                reversal_of + fin_movements invertidos) +
 *                                histórico ORIGINAL intacto (nunca UPDATE)
 *   D  Reversión total (servicio)   → saldo 0, saldo restablecido admite
 *                                nuevo pago, reversa de contra-fila rechazada
 *   E  Monedas y tasas        → USD con tasa canónica de tienda (amount_cup =
 *                                amount × tasa), sin tasa →
 *                                ERR_TASA_NO_DISPONIBLE (sin movimientos
 *                                parciales), CxC muestra saldo original +
 *                                bloque unrated (jamás ×450 ni inventada)
 *   F  Conciliación           → paid_amount (trigger) = Σ in − Σ reversal
 *                                (contra-filas del mayor) = balance mostrado
 *                                por la aplicación; asientos cuadrados;
 *                                tab='paid' coherente
 *   N  Negativos (§3.3)       → reintento idempotente sin duplicados,
 *                                reversión concurrente → 1 sola contra-fila,
 *                                DELETE prohibido, OT voided no pagable,
 *                                overpay rechazado
 *
 * NOTA de alcance (verificada en BD): el motor de partida doble (fin_entries)
 * cubre RECEPCION|SERVICIO_RECIBIDO|VENTA|NOMINA — las OT (production_order)
 * NO generan asientos fin: su registro financiero es la fila de
 * payment_transactions + columnas del trigger update_payment_status.
 * Las aserciones de asientos se limitan a la familia SERVICIO_RECIBIDO.
 *
 * ⚠️ DEFECTO CONOCIDO F011-001 (descubierto POR esta suite, pendiente de
 * remediación en misión independiente — PR B no altera código productivo):
 * las rutas `POST /api/payments` (vía single: ref_type production_order|work)
 * y `POST /api/production-orders/[id]/payments` llaman register_supplier_payment
 * con el CLIENTE DE SESIÓN (JWT del usuario) cuya ACL es service_role-only
 * (re-certificación REM-INV-6: {postgres,service_role}) → «permission denied»
 * para cualquier sesión real. El camino batch (service|receipt) y la reversa
 * usan el cliente ADMIN tras el gate canManageStore → funcionan. Mientras no
 * se remedie, el ciclo de OT se ejercita por el RPC autoritativo (service_role
 * — la barrera definitiva del motor) y un test-pin documenta la denegación
 * app-path para forzar la actualización al remediar.
 *
 * Fixtures efímeros namespace FIN011-<runId>, limpieza verificada en afterAll
 * (el guard de higiene exige net delta = 0). SOLO modo aislado.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readRunContext, type RunContext } from './fixtures/run-env';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.E2E_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.E2E_SUPABASE_ANON_KEY || '';
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '';

let ctx: RunContext | null = null;
let svc: SupabaseClient;
let adminToken = '';

const F = {
  otCupId: '',
  otUsdId: '',
  otVoidId: '',
  otBId: '',
  svcId: '',
  rateRowCreated: false,
  rateBackup: null as number | null,
  adminActiveStoreBackup: '',
  paymentIds: [] as string[],
};
const USD_TEST_RATE = 420;

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`signIn falló: HTTP ${res.status}`);
  const { access_token } = await res.json();
  return access_token;
}

async function apiPostPayment(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) as Record<string, unknown> };
}

/**
 * Registro de pago por el RPC AUTORITATIVO del motor (service_role).
 * Para la familia production_order|work — la vía app está bloqueada por el
 * defecto F011-001 (pin de regresión abajo). Misma semántica del motor:
 * tasas fail-closed, overpay, idempotencia, trigger update_payment_status.
 */
async function engineRegisterPayment(params: {
  store_id: string; ref_type: string; ref_id: string; amount: number;
  payment_method: string; paid_by: string; currency?: string; exchange_rate?: number;
  idempotency_key?: string; notes?: string;
}) {
  const { data, error } = await svc.rpc('register_supplier_payment', {
    p_store_id: params.store_id,
    p_ref_type: params.ref_type,
    p_ref_id: params.ref_id,
    p_amount: params.amount,
    p_payment_method: params.payment_method,
    p_paid_by: params.paid_by,
    p_currency: params.currency || 'CUP',
    p_exchange_rate: params.exchange_rate ?? 1.0,
    p_notes: params.notes || null,
    p_idempotency_key: params.idempotency_key || null,
  });
  return { id: (data as string) || null, error };
}
async function apiReversePayment(token: string, paymentId: string, reason: string) {
  const res = await fetch(`${BASE}/api/payments/${paymentId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) as Record<string, unknown> };
}
async function apiDeletePayment(token: string, paymentId: string) {
  const res = await fetch(`${BASE}/api/payments/${paymentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) as Record<string, unknown> };
}
async function apiGetCxc(token: string, storeId: string, tab = 'all') {
  const res = await fetch(`${BASE}/api/accounts-receivable?store_id=${storeId}&tab=${tab}&limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) as Record<string, unknown> };
}

/** id del pago en la respuesta de POST /api/payments (single y batch). */
function paymentIdOf(json: Record<string, unknown>): string {
  const arr = (json.payments || []) as Array<{ id?: string }>;
  return arr[0]?.id || '';
}

async function setAdminActiveStore(storeId: string) {
  const { error } = await svc.from('profiles').update({ active_store_id: storeId }).eq('id', ctx!.users.admin.id);
  if (error) throw new Error('setActiveStore: ' + error.message);
}

interface OtRow { id: string; budget_total: number; paid_amount: number; payment_status: string; paid_at: string | null; }
async function otRow(id: string): Promise<OtRow> {
  const { data, error } = await svc.from('production_orders')
    .select('id, budget_total, paid_amount, payment_status, paid_at').eq('id', id).single();
  if (error) throw error;
  return data as OtRow;
}
async function svcRow(id: string): Promise<{ paid_amount: number; payment_status: string; total_amount: number }> {
  const { data, error } = await svc.from('received_services')
    .select('paid_amount, payment_status, total_amount').eq('id', id).single();
  if (error) throw error;
  return data as { paid_amount: number; payment_status: string; total_amount: number };
}
interface TxRow { id: string; amount: number; amount_cup: number; currency: string; exchange_rate: number; direction: string | null; reverses_payment_id: string | null; payment_method: string; paid_by: string; payment_date: string; }
async function txRows(refId: string): Promise<TxRow[]> {
  const { data, error } = await svc.from('payment_transactions')
    .select('id, amount, amount_cup, currency, exchange_rate, direction, reverses_payment_id, payment_method, paid_by, payment_date')
    .eq('ref_id', refId).order('payment_date');
  if (error) throw error;
  return (data || []) as TxRow[];
}
async function finEntries(refId: string): Promise<Array<{ id: string; event: string; payment_ref: string | null; reversal_of: string | null }>> {
  const { data, error } = await svc.from('fin_entries')
    .select('id, event, payment_ref, reversal_of').eq('document_id', refId);
  if (error) throw error;
  return (data || []) as Array<{ id: string; event: string; payment_ref: string | null; reversal_of: string | null }>;
}
async function finMovementsOfEntry(entryId: string): Promise<Array<{ sense: string; amount: number; currency: string }>> {
  const { data, error } = await svc.from('fin_movements')
    .select('sense, amount, currency').eq('entry_id', entryId);
  if (error) throw error;
  return (data || []) as Array<{ sense: string; amount: number; currency: string }>;
}

test.describe.serial('FIN-011 — ciclo financiero pagos→reversiones→monedas→conciliación', () => {
  test.beforeAll(async () => {
    ctx = readRunContext();
    test.skip(!ctx, 'Requiere modo aislado (E2E_ISOLATION=1 con run provisionado)');
    test.skip(!URL || !SVC_KEY || !ANON, 'Variables Supabase no configuradas');
    if (!ctx) return;

    svc = createClient(URL, SVC_KEY, { auth: { persistSession: false } });
    adminToken = await signIn(ctx.users.admin.email, ctx.users.admin.password);

    const { data: prof } = await svc.from('profiles').select('active_store_id').eq('id', ctx.users.admin.id).single();
    F.adminActiveStoreBackup = prof?.active_store_id || '';

    const ns = `FIN011-${ctx.runId}`;

    const otA = await svc.from('production_orders').insert({
      store_id: ctx.pilotStoreA.id, order_number: `${ns}-OT-A`, budget_total: 1000,
      status: 'draft', description: `${ns} ciclo A/B/F`,
    }).select('id').single();
    expect(otA.error, 'fixture OT A: ' + otA.error?.message).toBeNull();
    F.otCupId = otA.data!.id;

    const otE = await svc.from('production_orders').insert({
      store_id: ctx.pilotStoreA.id, order_number: `${ns}-OT-E`, budget_total: 50000,
      status: 'draft', description: `${ns} monedas`,
    }).select('id').single();
    expect(otE.error, 'fixture OT E: ' + otE.error?.message).toBeNull();
    F.otUsdId = otE.data!.id;

    const otV = await svc.from('production_orders').insert({
      store_id: ctx.pilotStoreA.id, order_number: `${ns}-OT-V`, budget_total: 100,
      status: 'voided', description: `${ns} voided`,
    }).select('id').single();
    expect(otV.error, 'fixture OT voided: ' + otV.error?.message).toBeNull();
    F.otVoidId = otV.data!.id;

    const sv = await svc.from('received_services').insert({
      store_id: ctx.pilotStoreA.id, service_number: `${ns}-SRV`,
      service_date: new Date().toISOString().slice(0, 10),
      service_type_name: 'FIN011 test', total_amount: 500, status: 'active', currency: 'CUP',
      supplier: `${ns} proveedor de prueba`,   // CHECK received_services_supplier_not_null
    }).select('id').single();
    expect(sv.error, 'fixture servicio: ' + sv.error?.message).toBeNull();
    F.svcId = sv.data!.id;

    const otB = await svc.from('production_orders').insert({
      store_id: ctx.pilotStoreB.id, order_number: `${ns}-OT-B`, budget_total: 100000,
      budget_currency: 'USD',  // presupuesto USD sin tasa en B → bloque unrated en CxC
      status: 'draft', description: `${ns} sin tasa`,
    }).select('id').single();
    expect(otB.error, 'fixture OT B: ' + otB.error?.message).toBeNull();
    F.otBId = otB.data!.id;

    // Tasa canónica USD de pilotStoreA (backup si pre-existe)
    const { data: existing } = await svc.from('store_exchange_rates')
      .select('rate').eq('store_id', ctx.pilotStoreA.id).eq('currency', 'USD').limit(1);
    if (existing && existing.length > 0) {
      F.rateBackup = Number((existing[0] as { rate: number }).rate);
      const { error } = await svc.from('store_exchange_rates')
        .update({ rate: USD_TEST_RATE, updated_at: new Date().toISOString() })
        .eq('store_id', ctx.pilotStoreA.id).eq('currency', 'USD');
      expect(error, 'rate update: ' + error?.message).toBeNull();
    } else {
      const { error } = await svc.from('store_exchange_rates').insert({
        store_id: ctx.pilotStoreA.id, currency: 'USD', rate: USD_TEST_RATE,
      });
      expect(error, 'rate insert: ' + error?.message).toBeNull();
      F.rateRowCreated = true;
    }

    await setAdminActiveStore(ctx.pilotStoreA.id);
  });

  // ════════════════════ ESCENARIO A — pago parcial ════════════════════
  test('A — pago parcial OT: saldo pendiente, estado partial, tasa 1 (CUP=CUP)', async () => {
    // Vía RPC autoritativo (motor) — la vía app para OT está bloqueada por el
    // defecto F011-001 (pin de regresión en N6)
    const { id: pid, error } = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'production_order', ref_id: F.otCupId,
      amount: 400, payment_method: 'cash', paid_by: ctx!.users.admin.id,
      currency: 'CUP', exchange_rate: 1, idempotency_key: `fin011-a-${ctx!.runId}`,
      notes: 'FIN011 escenario A (pago parcial)',
    });
    expect(error, JSON.stringify(error)).toBeNull();
    expect(pid).toBeTruthy();
    F.paymentIds.push(pid!);

    const ot = await otRow(F.otCupId);
    expect(ot.paid_amount).toBe(400);
    expect(ot.payment_status).toBe('partial');

    const rows = await txRows(F.otCupId);
    expect(rows).toHaveLength(1);
    expect(rows[0].direction ?? 'in').toBe('in');
    expect(rows[0].amount).toBe(400);
    expect(rows[0].amount_cup).toBe(400);        // CUP: tasa 1, sin conversión
    expect(rows[0].exchange_rate).toBe(1);
    expect(rows[0].currency).toBe('CUP');        // moneda original preservada
    expect(rows[0].paid_by).toBe(ctx!.users.admin.id); // trazabilidad del actor
  });

  // ════════════════════ ESCENARIO B — pago completo ════════════════════
  test('B — pago completo: saldo cero, estado paid, sin duplicados', async () => {
    const { id, error } = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'production_order', ref_id: F.otCupId,
      amount: 600, payment_method: 'transfer', paid_by: ctx!.users.admin.id,
      currency: 'CUP', exchange_rate: 1, idempotency_key: `fin011-b-${ctx!.runId}`,
    });
    expect(error, JSON.stringify(error)).toBeNull();
    F.paymentIds.push(id!);

    const ot = await otRow(F.otCupId);
    expect(ot.paid_amount).toBe(1000);
    expect(ot.payment_status).toBe('paid');
    expect(ot.paid_at).toBeTruthy();

    const rows = await txRows(F.otCupId);
    expect(rows.filter(x => (x.direction ?? 'in') === 'in')).toHaveLength(2);
    expect(rows.reduce((s, x) => s + x.amount_cup, 0)).toBe(1000);
  });

  test('N1 — reintento con la misma idempotencia NO duplica el pago (§3.3)', async () => {
    const before = await txRows(F.otCupId);
    const { id, error } = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'production_order', ref_id: F.otCupId,
      amount: 400, payment_method: 'cash', paid_by: ctx!.users.admin.id,
      currency: 'CUP', exchange_rate: 1,
      idempotency_key: `fin011-a-${ctx!.runId}`,    // MISMA clave del escenario A
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const rows = await txRows(F.otCupId);
    expect(rows.length).toBe(before.length);        // misma cantidad de filas
    // El id devuelto es el del pago original (reuso, no fila nueva)
    expect(id).toBe(before.find(x => x.amount === 400)!.id);
    const ot = await otRow(F.otCupId);
    expect(ot.paid_amount).toBe(1000);              // saldo intacto
  });

  // ════════════════════ ESCENARIO C — reversión parcial ════════════════
  test('C — reversión parcial: contra-fila neteada, asiento compensatorio, histórico intacto', async () => {
    const pr = await apiPostPayment(adminToken, {
      ref_type: 'service', ref_id: F.svcId,
      payment_method: 'cash', amount: 300, currency: 'CUP',
      idempotency_key: `fin011-c-${ctx!.runId}`,
    });
    expect(pr.status, JSON.stringify(pr.json)).toBe(201);
    const paymentId = paymentIdOf(pr.json);
    expect(paymentId).toBeTruthy();
    F.paymentIds.push(paymentId);

    let srow = await svcRow(F.svcId);
    expect(srow.paid_amount).toBe(300);
    expect(srow.payment_status).toBe('partial');

    const pre = await txRows(F.svcId);
    expect(pre).toHaveLength(1);
    const preOriginal = pre[0];

    const rr = await apiReversePayment(adminToken, paymentId, 'FIN011 escenario C — reversión parcial del dinero');
    expect([200, 201]).toContain(rr.status);  // 201 nueva reversión, 200 idempotente
    expect(rr.json.success).toBe(true);

    // Contra-fila: MISMO importe/moneda, direction='reversal', enlazada al original
    const rows = await txRows(F.svcId);
    const contra = rows.find(x => (x.direction ?? 'in') === 'reversal');
    expect(contra, 'contra-fila ausente').toBeTruthy();
    expect(contra!.amount).toBe(300);
    expect(contra!.currency).toBe('CUP');
    expect(contra!.reverses_payment_id).toBe(paymentId);

    // Saldo neteado: 300 in − 300 reversal = 0 → vuelve a unpaid
    srow = await svcRow(F.svcId);
    expect(srow.paid_amount).toBe(0);
    expect(srow.payment_status).toBe('unpaid');

    // El histórico NO se modifica: la fila original nunca UPDATE (§3.3)
    const post = await txRows(F.svcId);
    const postOriginal = post.find(x => x.id === preOriginal.id)!;
    expect(postOriginal.amount).toBe(preOriginal.amount);
    expect(postOriginal.amount_cup).toBe(preOriginal.amount_cup);
    expect(postOriginal.direction ?? 'in').toBe('in');
    expect(postOriginal.payment_date).toBe(preOriginal.payment_date);
    expect(postOriginal.paid_by).toBe(preOriginal.paid_by);

    // Asiento compensatorio (SERVICIO_RECIBIDO): 'anulacion' con reversal_of + sentidos invertidos
    const pagoEntry = (await finEntries(F.svcId)).find(e => e.event === 'pago' && e.payment_ref === paymentId);
    expect(pagoEntry, 'asiento pago ausente').toBeTruthy();
    const anulaEntry = (await finEntries(F.svcId)).find(e => e.event === 'anulacion' && e.reversal_of === pagoEntry!.id);
    expect(anulaEntry, 'asiento compensatorio ausente').toBeTruthy();
    const pagoMovs = await finMovementsOfEntry(pagoEntry!.id);
    const anulaMovs = await finMovementsOfEntry(anulaEntry!.id);
    expect(anulaMovs.length).toBe(pagoMovs.length);
    for (const m of pagoMovs) {
      const inv = anulaMovs.find(x => x.currency === m.currency && x.amount === m.amount && x.sense !== m.sense);
      expect(inv, `movimiento inverso ausente para ${m.sense} ${m.amount} ${m.currency}`).toBeTruthy();
    }
  });

  // ════════════════════ ESCENARIO D — reversión total ══════════════════
  test('D — reversión total: saldo 0, saldo restablecido admite nuevo pago', async () => {
    // Pago 500 vía motor (RPC autoritativo): la vía app batch está bloqueada
    // por el DEFECTO F011-002 (pin N7) — su pre-check no netea contra-filas
    const pr = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'service', ref_id: F.svcId,
      amount: 500, payment_method: 'transfer', paid_by: ctx!.users.admin.id,
      currency: 'CUP', exchange_rate: 1,
      idempotency_key: `fin011-d-${ctx!.runId}`,
    });
    expect(pr.error, JSON.stringify(pr.error)).toBeNull();
    const paymentId = pr.id!;
    F.paymentIds.push(paymentId);

    let srow = await svcRow(F.svcId);
    expect(srow.payment_status).toBe('paid');

    const rr = await apiReversePayment(adminToken, paymentId, 'FIN011 escenario D — reversión total');
    expect([200, 201]).toContain(rr.status);
    expect(rr.json.success).toBe(true);

    srow = await svcRow(F.svcId);
    expect(srow.paid_amount).toBe(0);
    expect(srow.payment_status).toBe('unpaid');

    // Reversión de una contra-fila NO permitida (negativo)
    const contra = (await txRows(F.svcId)).find(x => x.reverses_payment_id === paymentId)!;
    const rr2 = await apiReversePayment(adminToken, contra.id, 'FIN011 — no debe anularse una contra-fila');
    expect(rr2.status).toBeGreaterThanOrEqual(400);

    // El saldo restablecido ADMITE un nuevo pago (overpay respeta el neteo)
    const re = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'service', ref_id: F.svcId,
      amount: 100, payment_method: 'cash', paid_by: ctx!.users.admin.id,
      currency: 'CUP', exchange_rate: 1,
      idempotency_key: `fin011-d2-${ctx!.runId}`,
    });
    expect(re.error, JSON.stringify(re.error)).toBeNull();
    expect(re.id).toBeTruthy();
    F.paymentIds.push(re.id!);
    srow = await svcRow(F.svcId);
    expect(srow.paid_amount).toBe(100);
    expect(srow.payment_status).toBe('partial');
  });

  test('N7 — PIN de regresión del DEFECTO F011-002: el pre-check del batch no netea contra-filas', async () => {
    // DEFECTO DOCUMENTADO (descubierto por esta suite): el pre-check de saldo
    // de register_supplier_payment_batch (20261121190000:279-284 y 462-468)
    // suma TODAS las filas SIN restar direction='reversal' — contradice el
    // neteo del motor single (20261126140000:296-306) y su diseño documentado
    // («una obligación con pago revertido vuelve a admitir pagos por el
    // importe restablecido»). Efecto real: tras una reversión, cualquier
    // liquidación vía app (servicio/recepción) es rechazada con
    // ERR_BATCH_OVERPAY y saldo pendiente negativo. La verdad en BD (trigger)
    // permanece correcta: es un bloqueo de pagos legítimos, no un saldo
    // corrupto. Al remediar (mismo CASE de neteo del motor single), ESTE PIN
    // FALLA intencionadamente y debe sustituirse por la prueba positiva.
    const r = await apiPostPayment(adminToken, {
      ref_type: 'service', ref_id: F.svcId,
      payment_method: 'cash', amount: 1, currency: 'CUP',
      idempotency_key: `fin011-n7-${ctx!.runId}`,
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain('ERR_BATCH_OVERPAY');
  });

  test('N2 — reversión concurrente del mismo pago: exactamente 1 contra-fila (§3.3)', async () => {
    // Pago base vía motor (la vía batch está bloqueada por F011-002 tras las
    // reversiones del ciclo — ver pin N7)
    const pr = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'service', ref_id: F.svcId,
      amount: 50, payment_method: 'cash', paid_by: ctx!.users.admin.id,
      currency: 'CUP', exchange_rate: 1,
      idempotency_key: `fin011-cc-${ctx!.runId}`,
    });
    expect(pr.error, JSON.stringify(pr.error)).toBeNull();
    const paymentId = pr.id!;
    F.paymentIds.push(paymentId);

    const [r1, r2] = await Promise.all([
      apiReversePayment(adminToken, paymentId, 'FIN011 reversa concurrente 1'),
      apiReversePayment(adminToken, paymentId, 'FIN011 reversa concurrente 2'),
    ]);
    expect([200, 201]).toContain(r1.status);
    // La segunda puede ser idempotente (200) o error — NUNCA una 2ª contra-fila
    const contraRows = (await txRows(F.svcId)).filter(x => x.reverses_payment_id === paymentId);
    expect(contraRows).toHaveLength(1);
  });

  // ════════════════════ ESCENARIO E — monedas y tasas ══════════════════
  test('E1 — USD con tasa canónica de tienda: amount_cup = amount × tasa, moneda preservada', async () => {
    const { id: pid, error } = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'production_order', ref_id: F.otUsdId,
      amount: 100, payment_method: 'cash', paid_by: ctx!.users.admin.id,
      currency: 'USD', exchange_rate: 1.0,   // ≤1 → el motor busca la tasa de tienda
      idempotency_key: `fin011-e1-${ctx!.runId}`,
    });
    expect(error, JSON.stringify(error)).toBeNull();
    expect(pid).toBeTruthy();
    F.paymentIds.push(pid!);
    const row = (await txRows(F.otUsdId)).find(x => x.id === pid)!;
    expect(row.currency).toBe('USD');              // moneda original preservada
    expect(row.amount).toBe(100);
    expect(row.exchange_rate).toBe(USD_TEST_RATE); // tasa canónica, no inventada
    expect(row.amount_cup).toBe(100 * USD_TEST_RATE);

    const ot = await otRow(F.otUsdId);
    expect(ot.paid_amount).toBe(100 * USD_TEST_RATE);
    expect(ot.payment_status).toBe('partial');
  });

  test('E2 — sin tasa de tienda: ERR_TASA_NO_DISPONIBLE y SIN movimientos parciales', async () => {
    const { error } = await engineRegisterPayment({
      store_id: ctx!.pilotStoreB.id, ref_type: 'production_order', ref_id: F.otBId,
      amount: 10, payment_method: 'cash', paid_by: ctx!.users.admin.id,
      currency: 'USD', exchange_rate: 1.0,   // ≤1 → busca tasa de B (no existe)
      idempotency_key: `fin011-e2-${ctx!.runId}`,
    });
    expect(error, 'debería fallar sin tasa').toBeTruthy();
    expect(JSON.stringify(error)).toContain('ERR_TASA_NO_DISPONIBLE');
    const { data: rows } = await svc.from('payment_transactions').select('id').eq('ref_id', F.otBId);
    expect((rows || []).length).toBe(0);         // rechazo sin efectos
  });

  test('E3 — CxC sin tasa: saldo en moneda original + bloque unrated (nunca ×450)', async () => {
    // OT B: presupuesto USD en una tienda SIN tasa USD → el saldo se muestra
    // en moneda original, balance_cup NULO y contabilizado en unrated
    await setAdminActiveStore(ctx!.pilotStoreB.id);
    try {
      const r = await apiGetCxc(adminToken, ctx!.pilotStoreB.id, 'all');
      expect(r.status).toBe(200);
      const items = (r.json.data || []) as Array<Record<string, unknown>>;
      const mine = items.find((o) => o.id === F.otBId);
      expect(mine, 'OT B ausente en CxC').toBeTruthy();
      expect(mine!.budget_currency).toBe('USD');
      expect(mine!.balance).toBe(100000);          // saldo en moneda original (USD)
      expect(mine!.balance_cup ?? null).toBeNull(); // sin tasa canónica → NO convertida
      const unrated = r.json.unrated as { count?: number; total_by_currency?: Record<string, number> } | undefined;
      expect(unrated).toBeTruthy();
      expect(unrated!.count ?? 0).toBeGreaterThanOrEqual(1);
      expect(unrated!.total_by_currency?.USD ?? 0).toBeGreaterThanOrEqual(100000);
    } finally {
      await setAdminActiveStore(ctx!.pilotStoreA.id);
    }
  });

  // ════════════════════ ESCENARIO F — conciliación ════════════════════
  test('F1 — conciliación: motor = mayor neteado = aplicación (tasa canónica)', async () => {
    const otCup = await otRow(F.otCupId);
    const otUsd = await otRow(F.otUsdId);
    const srv = await svcRow(F.svcId);

    // 1) Reconstrucción desde el mayor de pagos (Σ in − Σ reversal)
    const recon = async (refId: string) => {
      const rows = await txRows(refId);
      return rows.reduce((s, x) => s + ((x.direction ?? 'in') === 'reversal' ? -x.amount_cup : x.amount_cup), 0);
    };
    expect(await recon(F.otCupId)).toBe(otCup.paid_amount);
    expect(await recon(F.otUsdId)).toBe(otUsd.paid_amount);
    expect(await recon(F.svcId)).toBe(srv.paid_amount);

    // 2) La aplicación muestra el mismo saldo con la tasa canónica
    const rAll = await apiGetCxc(adminToken, ctx!.pilotStoreA.id, 'all');
    expect(rAll.status).toBe(200);
    const items = (rAll.json.data || []) as Array<Record<string, unknown>>;

    const cxcUsd = items.find((o) => o.id === F.otUsdId);
    expect(cxcUsd, 'OT E (partial) ausente en CxC all').toBeTruthy();
    expect(cxcUsd!.paid_amount).toBe(otUsd.paid_amount);
    expect(cxcUsd!.balance).toBe(50000 - otUsd.paid_amount);       // saldo original CUP
    expect(cxcUsd!.balance_cup).not.toBeNull();                    // tasa canónica disponible
    expect(Number(cxcUsd!.balance_cup)).toBeCloseTo(50000 - otUsd.paid_amount, 2);

    // 3) OT pagada: coherente en tab='paid' (el motor marca paid con paid_at)
    const rPaid = await apiGetCxc(adminToken, ctx!.pilotStoreA.id, 'paid');
    expect(rPaid.status).toBe(200);
    const paidItems = (rPaid.json.data || []) as Array<Record<string, unknown>>;
    const cxcPaid = paidItems.find((o) => o.id === F.otCupId);
    expect(cxcPaid, 'OT A (paid) ausente en CxC paid').toBeTruthy();
    expect(cxcPaid!.paid_amount).toBe(otCup.paid_amount);
    expect(cxcPaid!.payment_status).toBe('paid');

    // 4) El servicio (CxP) concilia igual por el mismo trigger
    expect(srv.paid_amount).toBe(
      (await txRows(F.svcId)).reduce((s, x) => s + ((x.direction ?? 'in') === 'reversal' ? -x.amount : x.amount), 0)
    );
  });

  test('F2 — asientos cuadrados: débito = crédito en cada fin_entry del ciclo', async () => {
    // El motor de partida doble cubre SERVICIO_RECIBIDO (no OT — alcance verificado)
    const entries = await finEntries(F.svcId);
    expect(entries.length).toBeGreaterThanOrEqual(3);  // 3 pagos con asiento + anulaciones
    for (const e of entries) {
      const movs = await finMovementsOfEntry(e.id);
      const deb = movs.filter(m => m.sense === 'debito').reduce((s, m) => s + m.amount, 0);
      const cre = movs.filter(m => m.sense === 'credito').reduce((s, m) => s + m.amount, 0);
      expect(deb, `entry ${e.id} (${e.event}) descuadrado`).toBeCloseTo(cre, 2);
    }
    // Cada 'anulacion' referencia su 'pago' (relación pagos↔reversiones reconstruible)
    const anulaciones = entries.filter(e => e.event === 'anulacion');
    for (const a of anulaciones) {
      expect(a.reversal_of).toBeTruthy();
      const orig = entries.find(e => e.id === a.reversal_of);
      expect(orig?.event).toBe('pago');
    }
  });

  // ════════════════════ NEGATIVOS de seguridad ════════════════════════
  test('N3 — DELETE de pago prohibido (la rectificación es la reversión)', async () => {
    const r = await apiDeletePayment(adminToken, F.paymentIds[0]);
    expect(r.status).not.toBe(200);
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  test('N4 — OT voided no admite pagos (ERR_ORDER_NOT_PAYABLE, R-01)', async () => {
    const { error } = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'production_order', ref_id: F.otVoidId,
      amount: 10, payment_method: 'cash', paid_by: ctx!.users.admin.id,
      currency: 'CUP', exchange_rate: 1,
      idempotency_key: `fin011-n4-${ctx!.runId}`,
    });
    expect(error, 'debería rechazar OT voided').toBeTruthy();
    expect(JSON.stringify(error)).toContain('ERR_ORDER_NOT_PAYABLE');
  });

  test('N5 — overpay rechazado (no excede el saldo neteado)', async () => {
    // OT A ya está paid (1000): cualquier pago nuevo debe fallar por saldo
    const { error } = await engineRegisterPayment({
      store_id: ctx!.pilotStoreA.id, ref_type: 'production_order', ref_id: F.otCupId,
      amount: 1, payment_method: 'cash', paid_by: ctx!.users.admin.id,
      currency: 'CUP', exchange_rate: 1,
      idempotency_key: `fin011-n5-${ctx!.runId}`,
    });
    expect(error, 'debería rechazar overpay').toBeTruthy();
    expect(JSON.stringify(error)).toContain('excede el saldo');
  });

  test('N6 — PIN de regresión del DEFECTO F011-001: pagos a OT por app denegados por ACL', async () => {
    // DEFECTO DOCUMENTADO (descubierto por esta suite): la vía single de
    // POST /api/payments (production_order|work) llama register_supplier_payment
    // con el cliente de sesión (ACL service_role-only desde REM-INV-6) →
    // «permission denied» para cualquier sesión real. Al remediar (cliente
    // admin tras canManageStore, patrón del camino batch), ESTE PIN FALLA
    // intencionadamente y debe sustituirse por la prueba positiva app-path.
    const r = await apiPostPayment(adminToken, {
      ref_type: 'production_order', ref_id: F.otBId,
      payment_method: 'cash', amount: 5, currency: 'CUP',
      idempotency_key: `fin011-n6-${ctx!.runId}`,
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.json)).toContain('permission denied for function register_supplier_payment');
    // Sin efectos colaterales: la OT B sigue sin filas de pago
    const { data: rows } = await svc.from('payment_transactions').select('id').eq('ref_id', F.otBId);
    expect((rows || []).length).toBe(0);
  });

  // ════════════════════ LIMPIEZA VERIFICADA ═══════════════════════════
  test.afterAll(async () => {
    if (!ctx || !svc) return;
    try {
      for (const refId of [F.otCupId, F.otUsdId, F.otVoidId, F.otBId, F.svcId].filter(Boolean)) {
        const entries = await finEntries(refId).catch(() => []);
        for (const e of entries) await svc.from('fin_movements').delete().eq('entry_id', e.id);
        await svc.from('fin_entries').delete().eq('document_id', refId);
        await svc.from('payment_transactions').delete().eq('ref_id', refId);
      }
      for (const id of [F.otCupId, F.otUsdId, F.otVoidId, F.otBId]) {
        if (id) await svc.from('production_orders').delete().eq('id', id);
      }
      if (F.svcId) await svc.from('received_services').delete().eq('id', F.svcId);
      if (F.rateRowCreated) {
        await svc.from('store_exchange_rates').delete()
          .eq('store_id', ctx.pilotStoreA.id).eq('currency', 'USD');
      } else if (F.rateBackup !== null) {
        await svc.from('store_exchange_rates').update({ rate: F.rateBackup, updated_at: new Date().toISOString() })
          .eq('store_id', ctx.pilotStoreA.id).eq('currency', 'USD');
      }
      if (F.adminActiveStoreBackup) {
        await svc.from('profiles').update({ active_store_id: F.adminActiveStoreBackup })
          .eq('id', ctx.users.admin.id);
      }
      // Verificación de cero residuos del namespace
      const ns = `FIN011-${ctx.runId}`;
      const { data: leftoverOrders } = await svc.from('production_orders').select('id').like('order_number', `${ns}%`);
      const { data: leftoverSrv } = await svc.from('received_services').select('id').like('service_number', `${ns}%`);
      expect((leftoverOrders || []).length, 'residuos production_orders FIN011').toBe(0);
      expect((leftoverSrv || []).length, 'residuos received_services FIN011').toBe(0);
    } catch (e) {
      throw new Error(`FIN011 afterAll cleanup: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
});
