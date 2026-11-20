/**
 * E2E — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008 (proyecto 'creation', BD aislada)
 * ============================================================================
 * Cadenas REALES sin mocks (ruta API → RPC de dominio → triggers → motor CP-FIN):
 *   · Borradores: POST save_as_draft (create_received_service_draft) →
 *     PATCH update-draft → PATCH status active (set_received_service_status con
 *     gate) → trigger fin_trg_received_services (reconocimiento UNA vez).
 *   · Proveedores: create_master_party (Clasificador Maestro) → identidad
 *     (supplier_id / master / snapshot) congelada en received_services.
 *   · Liquidación: POST /api/payments → register_supplier_payment_batch
 *     (atómico) → payment_transactions por componente → fin_trg_
 *     payment_transactions → asiento 'pago' por componente con cuenta
 *     canónica fin_resolve_financial_account(medio, moneda).
 *   · Pendiente: confirmación sin pagos → obligación PAS_SERV_PEND viva,
 *     cero egresos; liquidación posterior desde el detalle (mismo canal).
 *
 * Limpieza: tienda efímera del run con hard delete (net-zero).
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, sb, createTestStore, requireIsolatedCreation, rpcAsService,
  ADMIN_EMAIL, ADMIN_PASS,
} from '../fixtures/session.fixture';
import { hardDeleteTestStore } from '../fixtures/hard-cleanup';

requireIsolatedCreation();

const RATE_USD = 400;

let adminToken = '';
let adminUserId = '';
let storeA = '';
const serviceIds: string[] = [];
const paymentIds: string[] = [];
let freshStoreId = '';

test.describe.serial('ADN-008 · borradores, proveedores y liquidación multipago', () => {
  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    const auth = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = auth.token;
    adminUserId = auth.userId;
    const store = await createTestStore(request, adminToken, 'ADN008 SR');
    storeA = store.id;
    freshStoreId = store.id;
    // Patrón cpfin003 L209: alinear la tienda ACTIVA del usuario con la tienda
    // efímera del run — /api/payments resuelve la tienda desde el perfil.
    await sb.update('profiles', `id=eq.${adminUserId}`, { active_store_id: storeA });
  });

  test.afterAll(async () => {
    // Net-zero de la misión: la tienda efímera del run se elimina completa
    // (hard delete gobernado; sus servicios/pagos/asientos van con ella).
    if (freshStoreId) {
      await hardDeleteTestStore(freshStoreId);
    }
  });

  async function serviceRow(id: string) {
    const rows = await sb.select<Record<string, any>>('received_services', `id=eq.${id}&select=*`);
    return rows[0];
  }
  async function paymentsOf(id: string) {
    return sb.select<Record<string, any>>('payment_transactions', `ref_type=eq.service&ref_id=eq.${id}&select=*&order=payment_date.asc`);
  }
  async function finEntriesOf(id: string) {
    return sb.select<Record<string, any>>('fin_entries', `document_type=eq.SERVICIO_RECIBIDO&document_id=eq.${id}&select=*`);
  }

  /** POST/PATCH con backoff del rate limit (10/min por withSecurity). */
  async function withRlBackoff(fn: () => Promise<{ status: number; text: () => Promise<string> }>) {
    let res = await fn();
    if (res.status === 429) {
      // eslint-disable-next-line no-console
      console.log('[adn008] rate limit (429) — esperando 65s y reintentando');
      await new Promise((r) => setTimeout(r, 65_000));
      res = await fn();
    }
    return res;
  }

  test('B1 · borrador sin proveedor: se guarda en draft SIN obligación, pago, egreso ni asiento', async ({ request }: { request: APIRequestContext }) => {
    const res = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: {
        store_id: storeA,
        service_type_name: 'Transporte',
        supplier: null, // §3.2: el borrador puede guardar sin proveedor (sin inventar datos)
        total_amount: 1040,
        save_as_draft: true,
        creation_key: `adn008-b1-${Date.now()}`,
      },
    }));
    expect(res.status()).toBe(201);
    const body = await res.json();
    const id = body.data.id as string;
    serviceIds.push(id);

    const row = await serviceRow(id);
    expect(row.status).toBe('draft');
    expect(row.supplier).toBeNull();

    // §3.4 protección financiera: NADA de efectos.
    expect(await paymentsOf(id)).toHaveLength(0);
    expect(await finEntriesOf(id)).toHaveLength(0);
  });

  test('B2 · idempotencia de creación: misma creation_key → el MISMO borrador (no duplicado)', async ({ request }: { request: APIRequestContext }) => {
    const key = `adn008-b2-${Date.now()}`;
    const r1 = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Transporte', total_amount: 500, save_as_draft: true, creation_key: key },
    }));
    expect(r1.status()).toBe(201);
    const first = (await r1.json()).data;
    serviceIds.push(first.id);

    const r2 = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Transporte', total_amount: 500, save_as_draft: true, creation_key: key },
    }));
    expect(r2.status()).toBe(201);
    const second = (await r2.json()).data;
    expect(second.id).toBe(first.id); // §7.4: el reintento no crea un segundo servicio
    expect(second.duplicate).toBe(true);
  });

  test('B3 · recuperación y edición del borrador: update-draft guarda proveedor con identidad y datos', async ({ request }: { request: APIRequestContext }) => {
    // Identidad real: crear el tercero en el Clasificador Maestro (RPC canónica
    // del selector de Recepciones; create_master_party crea maestro + fila local).
    const stamp = Date.now().toString(36);
    const party = await rpcAsService<{ master_party_id?: string; supplier_id?: string }>('create_master_party', {
      p_store_id: storeA,
      p_code: null,
      p_name: `Prov ADN008 ${stamp}`,
      p_address: 'Calle 1',
      p_phone: '53-555-0001',
      p_email: null,
      p_tax_id: `NIT-${stamp}`,
      p_party_type: 'juridica',
      p_is_client: false,
      p_is_supplier: true,
      p_notes: null,
      p_ci: null,
      p_user_id: adminUserId, // actor-explícito bajo service_role (doctrina del repo)
    });
    expect(party.ok, `create_master_party falló: ${party.error}`).toBe(true);
    // Tienda conectada → master_party_id + supplier_id; tienda sin conexión →
    // alta local (master_party_id null). Ambas ramas son válidas en E2E.
    const supplierId = party.data!.supplier_id ? String(party.data!.supplier_id) : null;
    const masterPartyId = party.data!.master_party_id ? String(party.data!.master_party_id) : null;
    const supplierName = `Prov ADN008 ${stamp}`;

    // Borrador a editar (nuevo, con creation_key propia).
    const res = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Manipulación', total_amount: 300, save_as_draft: true, creation_key: `adn008-b3-${Date.now()}` },
    }));
    if (res.status() !== 201) console.log('[B3] POST body:', await res.text());
    const draftId = (await res.json()).data.id as string;
    serviceIds.push(draftId);

    const upd = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: {
        service_id: draftId,
        action: 'update-draft',
        supplier: supplierName,
        supplier_id: supplierId,
        supplier_master_party_id: masterPartyId,
        supplier_meta: { code: 'ADN008', tax_id: 'NIT-B3', phone: '53-555-0001', address: 'Calle 1' },
        total_amount: 1040,
        observations: 'Completado antes de confirmar',
      },
    }));
    if (upd.status() !== 200) console.log('[B3] PATCH body:', await upd.text());
    expect(upd.status()).toBe(200);

    const row = await serviceRow(draftId);
    expect(row.status).toBe('draft');
    expect(row.supplier).toBe(supplierName);
    expect(row.total_amount).toBe(1040);
    expect(row.observations).toBe('Completado antes de confirmar');
    // §4.3: la identidad REAL del proveedor queda guardada (no solo el nombre).
    expect(row.supplier_id).toBe(supplierId);
    if (masterPartyId) expect(row.supplier_master_party_id).toBe(masterPartyId);
    expect(row.supplier_code).toBe('ADN008');
    expect(row.supplier_tax_id).toBe('NIT-B3');

    // No se creó un proveedor duplicado en la tienda.
    const dups = await sb.select<{ c: number }>('suppliers',
      `store_id=eq.${storeA}&name=eq.${encodeURIComponent(supplierName)}&select=id`);
    expect(dups.length).toBe(1);
  });

  test('B4 · aislamiento: proveedor de OTRA tienda → ERR_SUPPLIER_INVALID (fail-closed)', async ({ request }: { request: APIRequestContext }) => {
    const other = await sb.insert<Record<string, any>>('suppliers', {
      // Simula identidad de otra tienda con un UUID que NO existe en esta tienda
      store_id: '00000000-0000-0000-0000-000000000000', name: 'Prov otra tienda', is_active: true,
    }).catch(() => null);
    const foreignId = other?.[0]?.id ?? '99999999-9999-4999-8999-999999999999';

    const res = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: {
        store_id: storeA, service_type_name: 'Transporte', total_amount: 100,
        save_as_draft: true, creation_key: `adn008-b4-${Date.now()}`,
        supplier_id: foreignId,
      },
    }));
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('proveedor');
  });

  test('B5 · confirmación del borrador: gate exige proveedor; con proveedor activa y contabiliza UNA vez', async ({ request }: { request: APIRequestContext }) => {
    // 1) Borrador SIN proveedor → la activación es RECHAZADA (gate server-side).
    const r = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Transporte', total_amount: 800, save_as_draft: true, creation_key: `adn008-b5-${Date.now()}` },
    }));
    const draftId = (await r.json()).data.id;
    serviceIds.push(draftId);

    const denied = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: draftId, status: 'active', reason: 'Intento sin proveedor' },
    }));
    expect(denied.status()).toBe(400);
    const deniedBody = await denied.json();
    expect(deniedBody.error).toContain('proveedor');

    // El rechazo NO contabilizó nada.
    expect(await finEntriesOf(draftId)).toHaveLength(0);

    // 2) Completar el proveedor y confirmar → activación + reconocimiento.
    const upd = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: draftId, action: 'update-draft', supplier: 'Prov B5 confirmación' },
    }));
    expect(upd.status()).toBe(200);

    const act = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: draftId, status: 'active', reason: 'Confirmación de borrador' },
    }));
    expect(act.status()).toBe(200);

    let row = await serviceRow(draftId);
    expect(row.status).toBe('active');

    const entries = await finEntriesOf(draftId);
    const reconocimientos = entries.filter((e) => e.event === 'reconocimiento' && e.status === 'posted');
    expect(reconocimientos).toHaveLength(1); // §7.1: reconocido UNA vez

    // 3) Confirmación DUPLICADA → no_change; sin segundo asiento (§7.4/§9.8).
    const again = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: draftId, status: 'active', reason: 'Doble clic simulado' },
    }));
    expect(again.status()).toBe(200);
    const againBody = await again.json();
    expect(againBody.data.status).toBe('no_change');
    expect((await finEntriesOf(draftId)).filter((e) => e.event === 'reconocimiento')).toHaveLength(1);

    // 4) Un servicio ACTIVO ya no es editable como borrador (409).
    const late = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: draftId, action: 'update-draft', supplier: 'Late edit' },
    }));
    expect(late.status()).toBe(409);
  });

  test('L1 · liquidación al confirmar MULTIPAGO (§9): 40 USD efectivo + 1.000 CUP efectivo = 1 servicio, 2 componentes', async ({ request }: { request: APIRequestContext }) => {
    const res = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Transporte', supplier: 'Prov multipago L1', total_amount: 17000 },
    }));
    expect(res.status()).toBe(201);
    const id = (await res.json()).data.id;
    serviceIds.push(id);

    const act = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: id, status: 'active', reason: 'Confirmar y liquidar' },
    }));
    expect(act.status()).toBe(200);

    // §5.3: UNA liquidación con DOS componentes (monedas distintas, mismo medio).
    const pay = await withRlBackoff(() => request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'service',
        ref_id: id,
        payments: [
          { payment_method: 'cash', amount: 40, currency: 'USD', exchange_rate: RATE_USD },
          { payment_method: 'cash', amount: 1000, currency: 'CUP', exchange_rate: 1 },
        ],
        idempotency_key: `adn008-l1-${Date.now()}`,
      },
    }));
    expect(pay.status()).toBe(201);
    const payBody = await pay.json();
    expect(payBody.count).toBe(2);
    for (const p of payBody.payments) paymentIds.push(p.id);

    // Dos payment_transactions con su moneda y tasa REAL.
    const pmts = await paymentsOf(id);
    expect(pmts).toHaveLength(2);
    const usd = pmts.find((p) => p.currency === 'USD');
    const cup = pmts.find((p) => p.currency === 'CUP');
    expect(usd).toBeTruthy();
    expect(Number(usd.amount)).toBe(40);
    expect(Number(usd.amount_cup)).toBe(16000); // 40 × 400 (conversión oficial, §5.5)
    expect(Number(cup.amount)).toBe(1000);

    // Estado de pago: PAID (obligación cancelada por los importes efectivos).
    const row = await serviceRow(id);
    expect(row.payment_status).toBe('paid');

    // Asientos: 1 reconocimiento + 2 'pago' posted, cada uno BALANCEADO.
    const entries = await finEntriesOf(id);
    expect(entries.filter((e) => e.event === 'reconocimiento' && e.status === 'posted')).toHaveLength(1);
    const pagos = entries.filter((e) => e.event === 'pago' && e.status === 'posted');
    expect(pagos).toHaveLength(2);

    for (const e of [...pagos]) {
      const movs = await sb.select<Record<string, any>>('fin_movements', `entry_id=eq.${e.id}&select=*`);
      const deb = movs.filter((m) => m.sense === 'debito').reduce((s, m) => s + Number(m.amount_cup), 0);
      const cred = movs.filter((m) => m.sense === 'credito').reduce((s, m) => s + Number(m.amount_cup), 0);
      expect(Math.abs(deb - cred)).toBeLessThan(0.01); // partida doble equilibrada
    }

    // Obligación PAS_SERV_PEND del servicio: saldo neto CERO (cancelada).
    const oblig = await sb.select<Record<string, any>>(
      'fin_movements',
      `select=entry_id,sense,amount_cup&entry_id=in.(${entries.map((e) => e.id).join(',')})`,
    );
    const pasMovs = await sb.select<Record<string, any>>(
      'fin_movements',
      `select=*&entry_id=in.(${entries.map((e) => e.id).join(',')})&category_code=eq.PAS_SERV_PEND`,
    );
    const pasNet = pasMovs.reduce((s, m) => s + (m.sense === 'credito' ? Number(m.amount_cup) : -Number(m.amount_cup)), 0);
    expect(Math.abs(pasNet)).toBeLessThan(0.01);
    void oblig;
  });

  test('L2 · liquidación PARCIAL al confirmar → Parcial y saldo pendiente real', async ({ request }: { request: APIRequestContext }) => {
    const res = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Transporte', supplier: 'Prov parcial L2', total_amount: 1000 },
    }));
    const id = (await res.json()).data.id;
    serviceIds.push(id);
    await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: id, status: 'active', reason: 'Confirmar con parcial' },
    }));

    const pay = await withRlBackoff(() => request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'service', ref_id: id,
        payments: [{ payment_method: 'cash', amount: 400, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `adn008-l2-${Date.now()}`,
      },
    }));
    expect(pay.status()).toBe(201);

    const row = await serviceRow(id);
    expect(row.payment_status).toBe('partial'); // §7.2: jamás Pagado sin cubrir
    expect(Number(row.paid_amount)).toBe(400);
  });

  test('L3 · overpay del lote → 400 fail-closed sin escrituras', async ({ request }: { request: APIRequestContext }) => {
    const res = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Transporte', supplier: 'Prov overpay L3', total_amount: 100 },
    }));
    const id = (await res.json()).data.id;
    serviceIds.push(id);
    await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: id, status: 'active', reason: 'Confirmar overpay test' },
    }));

    const pay = await withRlBackoff(() => request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'service', ref_id: id,
        payments: [{ payment_method: 'cash', amount: 200, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `adn008-l3-${Date.now()}`,
      },
    }));
    expect(pay.status()).toBe(400);
    expect((await paymentsOf(id))).toHaveLength(0); // nada insertado
  });

  test('P1 · confirmación pendiente: obligación viva SIN egresos; liquidación posterior multipago desde el detalle', async ({ request }: { request: APIRequestContext }) => {
    const res = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Transporte', supplier: 'Prov pendiente P1', total_amount: 2600 },
    }));
    const id = (await res.json()).data.id;
    serviceIds.push(id);

    // Confirmar SIN liquidar (modo B §6): obligación, cero egresos.
    const act = await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: id, status: 'active', reason: 'Confirmación pendiente' },
    }));
    expect(act.status()).toBe(200);

    expect(await paymentsOf(id)).toHaveLength(0);
    const row0 = await serviceRow(id);
    expect(row0.payment_status).toBe('unpaid');

    const entries0 = await finEntriesOf(id);
    expect(entries0.filter((e) => e.event === 'reconocimiento')).toHaveLength(1);
    // Sin movimiento en cuentas de caja/banco (no hay 'pago').
    expect(entries0.filter((e) => e.event === 'pago')).toHaveLength(0);

    // Liquidación POSTERIOR desde el detalle: transferencia + exterior USD
    // (§5.4: medios y monedas del catálogo; 'Transf. Exterior' = zelle).
    const p1Key = `adn008-p1-${Date.now()}`;
    const pay = await withRlBackoff(() => request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'service', ref_id: id,
        payments: [
          { payment_method: 'transfer', amount: 2200, currency: 'CUP', exchange_rate: 1 },
          { payment_method: 'zelle', amount: 1, currency: 'USD', exchange_rate: RATE_USD },
        ],
        idempotency_key: p1Key,
      },
    }));
    expect(pay.status()).toBe(201);

    const row1 = await serviceRow(id);
    expect(row1.payment_status).toBe('paid');

    // Cada componente con su cuenta canónica: transfer CUP → ACT_BANCOS;
    // zelle USD → ACT_TRANSF_EXTERIOR (fin_account_mapping, igual que ventas).
    const entries = await finEntriesOf(id);
    const pagos = entries.filter((e) => e.event === 'pago' && e.status === 'posted');
    expect(pagos).toHaveLength(2);
    const cuentas = new Set<string>();
    for (const e of pagos) {
      const movs = await sb.select<Record<string, any>>('fin_movements', `entry_id=eq.${e.id}&select=*`);
      for (const m of movs) cuentas.add(String(m.category_code));
    }
    expect(cuentas.has('ACT_BANCOS')).toBe(true);
    expect(cuentas.has('ACT_TRANSF_EXTERIOR')).toBe(true);

    // Reintento con la MISMA idempotency key → sin duplicados (§7.4).
    const replay = await withRlBackoff(() => request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'service', ref_id: id,
        payments: [
          { payment_method: 'transfer', amount: 2200, currency: 'CUP', exchange_rate: 1 },
          { payment_method: 'zelle', amount: 1, currency: 'USD', exchange_rate: RATE_USD },
        ],
        idempotency_key: p1Key,
      },
    }));
    expect(replay.status()).toBe(201);
    expect(await paymentsOf(id)).toHaveLength(2); // exactamente 2 pagos
  });

  test('REG · regresión del flujo histórico: confirmación simple efectivo CUP sigue funcionando', async ({ request }: { request: APIRequestContext }) => {
    const res = await withRlBackoff(() => request.post('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { store_id: storeA, service_type_name: 'Seguro', supplier: 'Prov regresión', total_amount: 1000 },
    }));
    const id = (await res.json()).data.id;
    serviceIds.push(id);
    await withRlBackoff(() => request.patch('/api/received-services', {
      headers: apiHeaders(adminToken),
      data: { service_id: id, status: 'active', reason: 'Regresión' },
    }));
    const pay = await withRlBackoff(() => request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'service', ref_id: id,
        payments: [{ payment_method: 'cash', amount: 1000, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `adn008-reg-${Date.now()}`,
      },
    }));
    expect(pay.status()).toBe(201);
    const row = await serviceRow(id);
    expect(row.payment_status).toBe('paid');
  });
});
