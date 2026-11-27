/**
 * E2E — CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 (proyecto 'creation', BD aislada)
 * ============================================================================
 * Cadenas REALES sin mocks (RPC → triggers → motor CP-FIN):
 *
 *  FASE A · Carga de productos (§2.1 — causa raíz verificada):
 *   - Tienda CONECTADA al catálogo maestro SIN filas locales →
 *     get_products_for_reception y get_products_for_pos devuelven los
 *     MAESTROS del tenant (source='master', operativos en cero).
 *   - Sin mezcla de inventarios: la fila solo-maestro reporta stock 0.
 *
 *  FASE B · Recepción Express de punta a punta (§8 Recepciones):
 *   - resolve_reception_import_rows (fila única) → activación local del
 *     maestro (mismo camino del importador Excel).
 *   - register_reception → receipt active + stock + precio de venta.
 *   - Tras la activación, el maestro YA NO aparece como solo-maestro (la
 *     fila local toma su lugar, source='local').
 *
 *  FASE C · Liquidación de recepciones (§3 — paridad Servicios Recibidos):
 *   - POST /api/payments ref_type='receipt' → register_supplier_payment_batch
 *     (atómico) → payment_transactions por componente → trigger
 *     trg_update_payment_status (payment_status/paid_amount/saldo).
 *   - Pago exacto → paid. Pago parcial (transferencia con referencia) →
 *     partial + saldo correcto → completar → paid.
 *   - Overpay → 400 ERR_BATCH_OVERPAY (fail-closed).
 *   - Recepción anulada → 409 ERR_RECEIPT_NOT_PAYABLE (gate de estado).
 *
 *  FASE D · POS: referencia de transferencia + nota general (§5.1/§5.2):
 *   - Venta con componente transferencia CUP + referencia →
 *     payment_transactions.reference persistida por PAGO.
 *   - Dos transferencias con referencias distintas → DOS filas con SUS
 *     referencias (nunca una global que sustituya).
 *   - sale_notes → transactions.notes persistida.
 *
 * Limpieza: tienda/tenant efímeros del run con hard delete (net-zero).
 * ============================================================================
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  signIn, apiHeaders, sb, rpcAsUser, requireIsolatedCreation,
  ADMIN_EMAIL, ADMIN_PASS, num, ensureEncargadoSession,
} from '../fixtures/session.fixture';
import { hardDeleteTestStore } from '../fixtures/hard-cleanup';

requireIsolatedCreation();

const SFX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// Ancla al run (diagnóstico de residuos): el sweep del run-env y cualquier
// investigación posterior identifican la tienda del run sin adivinar SFX.
const RUN_SLUG = (process.env.E2E_RUN_ID || 'E2E-RUN').toLowerCase().replace(/[^a-z0-9]+/g, '');

const MASTER_A = { sku: `CPLOG-A-${SFX}`, name: `Tornillo Maestro A ${SFX}`, uom: 'unidad' };
const MASTER_B = { sku: `CPLOG-B-${SFX}`, name: `Losa Maestra B ${SFX}`, uom: 'm2' };

let adminToken = '';
// CP-BRA-R06: el actor de las recepciones es un ENCARGADO con membresía
// activa en la tienda efímera (creación = encargado|superadmin). El admin del
// run conecta el catálogo (gobernador) pero ya NO puede crear recepciones.
let encToken = '';
let encUserId = '';
let adminUserId = '';
let tenantId = '';
let storeId = '';
let masterAId = '';
let masterBId = '';
let localProductId = '';

const RECEPTION_COST = 60;
const RECEPTION_PRICE = 100;

test.describe.serial('CP-LOG-UNIFICATION-001 · carga maestra, liquidación de recepciones y POS', () => {
  test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
    const auth = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    adminToken = auth.token;
    adminUserId = auth.userId;

    // Tenant + tienda efímeros (patrón master-catalog-multistore): tienda con
    // tenant y CERO productos locales — la precondición exacta del bug.
    // owner_id = admin → gobernador del catálogo (is_catalog_governor).
    const [tenant] = await sb.insert('tenants', [{ name: `E2E TENANT CPLOG ${RUN_SLUG} ${SFX}`, plan: 'free', is_active: true, owner_id: adminUserId }]);
    tenantId = String(tenant.id);
    const [store] = await sb.insert('stores', [{
      name: `E2E STORE CPLOG ${RUN_SLUG} ${SFX}`,
      tenant_id: tenantId,
      is_active: true,
      address: `Calle CPLOG ${SFX}`,
      slug: `e2e-cplog-${SFX}`,
    }]);
    storeId = String(store.id);

    // CP-BRA-R06: encargado de la tienda para las recepciones del spec.
    const enc = await ensureEncargadoSession(storeId);
    encToken = enc.token;
    encUserId = enc.userId;

    // Conectar la tienda al catálogo de la organización (RPC real, gobernador).
    const c = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeId });
    if (!c.ok) throw new Error(`connect_store_catalog falló: ${c.status} ${c.error}`);

    // Maestros activos del tenant — INSERCIÓN DIRECTA (service role): el bug
    // bajo prueba es «tienda conectada SIN filas locales ve 0 productos» → los
    // maestros NO deben tener fila local (create_master_product la crea; ya
    // cubierto por master-catalog-multistore). Sin datos comerciales (por
    // diseño, el maestro solo porta identidad).
    const inserted = await sb.insert('master_products', [
      { tenant_id: tenantId, sku: MASTER_A.sku, name: MASTER_A.name, unit_of_measure: MASTER_A.uom, status: 'active', created_by: adminUserId },
      { tenant_id: tenantId, sku: MASTER_B.sku, name: MASTER_B.name, unit_of_measure: MASTER_B.uom, status: 'active', created_by: adminUserId },
    ]);
    masterAId = String(inserted[0].id);
    masterBId = String(inserted[1].id);
    expect(masterAId).toBeTruthy();
    expect(masterBId).toBeTruthy();

    // La tienda ACTIVA del admin = tienda efímera (canon de /api/payments y
    // /api/pos/checkout: resuelven la tienda del perfil).
    await sb.update('profiles', `id=eq.${adminUserId}`, { active_store_id: storeId });
  });

  test.afterAll(async () => {
    // Net-zero. ORDEN CRÍTICO (lección de las corridas 90F217/c35078): la
    // tienda PRIMERO — sus products.master_product_id bloquean el borrado de
    // los maestros (FK) — después links → change-logs → maestros (por ID y
    // por created_by: el FK master_products.created_by BLOQUEA el teardown de
    // usuarios del run si queda uno) → tenant. Siempre best-effort.
    //
    // CP-LOG-UNIFICATION-001 (lección 2026-11-21): un fallo SILENCIADO del
    // hard-delete dejó la tienda del run viva (el guardrail la detectó como
    // contaminación). El intento se REPITE y el error se IMPRIME — el fallo
    // visible vale más que el residuo mudo.
    // ORDEN REAL (lección corrida 20261121-111511): catalog_store_links
    // ANTES de la tienda — la RPC e2e_hard_delete_store NO limpia esa tabla
    // y el FK catalog_store_links_store_id_fkey bloquea el hard-delete con
    // 409 (que a su vez dejaba vivos maestros/tenant/usuario en cadena).
    try { if (storeId) await sb.delete('catalog_store_links', `store_id=eq.${storeId}`); } catch (e) { console.error('[afterAll] catalog_store_links (pre):', e); }
    try { if (adminUserId) await sb.delete('catalog_store_links', `created_by=eq.${adminUserId}`); } catch (e) { console.error('[afterAll] catalog_store_links (created_by):', e); }
    if (storeId) {
      let borrada = false;
      for (let intento = 1; intento <= 2 && !borrada; intento++) {
        try {
          await hardDeleteTestStore(storeId);
          borrada = true;
        } catch (e) {
          console.error(`[afterAll] hardDeleteTestStore intento ${intento} falló:`, e);
        }
      }
      if (!borrada) console.error(`[afterAll] RESIDUO: la tienda ${storeId} sobrevivió al hard-delete — el guardrail debe detectarla.`);
    }
    try {
      // Barredo por created_by: maestros del run aunque el spec abortara antes
      // de capturar los ids; los products locales ya no existen (tienda borrada).
      const mine = await sb.select<{ id: string }>('master_products', `created_by=eq.${adminUserId}&select=id`).catch(() => [] as { id: string }[]);
      const ids = [...mine.map((x) => x.id), ...[masterAId, masterBId].filter(Boolean)];
      const uniq = [...new Set(ids)];
      if (uniq.length) {
        await sb.delete('master_change_log', `master_product_id=in.(${uniq.join(',')})`).catch((e) => console.error('[afterAll] master_change_log:', e));
        await sb.delete('master_products', `id=in.(${uniq.join(',')})`).catch((e) => console.error('[afterAll] master_products:', e));
      }
    } catch (e) { console.error('[afterAll] barre maestros:', e); }
    try { if (tenantId) await sb.delete('tenants', `id=eq.${tenantId}`); } catch (e) { console.error('[afterAll] tenants:', e); }
  });

  // ────────────────────────────────────────────────────────────────────────
  // FASE A · Carga de productos (causa raíz §2.1)
  // ────────────────────────────────────────────────────────────────────────
  test('A1 · tienda conectada sin filas locales: get_products_for_reception devuelve los MAESTROS (source=master, operativos 0)', async () => {
    const r = await rpcAsUser<any[]>('get_products_for_reception', adminToken, {
      p_store_id: storeId, p_search_term: '', p_page: 1, p_page_size: 50,
    });
    expect(r.ok, `error: ${r.error}`).toBe(true);
    const rows = r.data || [];
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.source).toBe('master');
      expect(Number(row.price)).toBe(0); // sin datos comerciales a nivel maestro
      expect(Number(row.cost_price)).toBe(0);
      expect(Number(row.stock_current)).toBe(0); // SIN mezcla de inventarios
      expect(row.master_product_id).toBe(row.id);
    }
    expect(rows.some((x: any) => x.sku === MASTER_A.sku)).toBe(true);
    expect(rows.some((x: any) => x.sku === MASTER_B.sku)).toBe(true);
  });

  test('A2 · get_products_for_pos también devuelve los maestros (vistazo del catálogo, no vendible)', async () => {
    const r = await rpcAsUser<any[]>('get_products_for_pos', adminToken, {
      p_store_id: storeId, p_search_term: '', p_category: '',
    });
    expect(r.ok, `error: ${r.error}`).toBe(true);
    const rows = r.data || [];
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.source).toBe('master');
      expect(Number(row.price)).toBe(0);
      expect(Number(row.stock_current)).toBe(0);
      expect(row.is_service).toBe(false);
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // FASE B · Recepción Express de punta a punta
  // ────────────────────────────────────────────────────────────────────────
  test('B1 · activación de maestro (fila única por el camino del importador Excel) + recepción real', async () => {
    // 1) Activar el maestro A — el MISMO flujo que ejecuta el modal manual y
    //    el Express al agregar un producto solo-maestro.
    const act = await rpcAsUser<any>('resolve_reception_import_rows', adminToken, {
      p_store_id: storeId,
      p_rows: [{
        name: MASTER_A.name, sku: MASTER_A.sku, unit_of_measure: MASTER_A.uom,
        quantity: 1, // el clasificador exige cantidad >= 1 (ERR_INVALID_QUANTITY)
        unit_cost: RECEPTION_COST, sale_price: RECEPTION_PRICE,
      }],
      p_confirm_reactivation: [],
    });
    expect(act.ok, `error: ${act.error}`).toBe(true);
    const results = (act.data?.results || []) as any[];
    expect(results.length).toBe(1);
    expect(['activate_local', 'identified']).toContain(results[0].status);
    localProductId = String(results[0].product_id);
    expect(localProductId).toBeTruthy();

    // La fila local quedó vinculada al maestro con los datos comerciales.
    const [prod] = await sb.select<any>('products', `id=eq.${localProductId}&select=id,master_product_id,price,cost_price,stock_current,store_id`);
    expect(prod.master_product_id).toBe(masterAId);
    expect(num(prod.price)).toBe(RECEPTION_PRICE);
    expect(prod.store_id).toBe(storeId);

    // 2) Recepción real del producto local (Express: register_reception).
    const reg = await rpcAsUser<any>('register_reception', encToken, {
      p_store_id: storeId,
      p_supplier: `Proveedor CPLOG ${SFX}`,
      p_reception_date: new Date().toISOString(),
      p_invoice_number: `FAC-CPLOG-${SFX}-1`,
      p_items: [{
        product_id: localProductId, sku: MASTER_A.sku, quantity: 10,
        unit_cost: RECEPTION_COST, unit_of_measure: MASTER_A.uom,
        sale_price: RECEPTION_PRICE, variant_id: null,
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0, price_currency: 'CUP',
      }],
      p_user_id: encUserId, p_po_id: null,
      p_supplier_code: null, p_supplier_tax_id: null, p_supplier_phone: null, p_supplier_address: null,
    });
    expect(reg.ok, `register_reception: ${reg.error}`).toBe(true);
    const receiptId = reg.data;
    expect(receiptId).toBeTruthy();

    // 3) Stock aplicado (10 unidades) — sin inventario de otras tiendas.
    const [inv] = await sb.select<any>('inventory', `store_id=eq.${storeId}&product_id=eq.${localProductId}&select=quantity`);
    expect(num(inv?.quantity)).toBe(10);
  });

  test('B2 · tras la activación, el maestro YA NO es solo-maestro: la fila LOCAL ocupa su lugar', async () => {
    const rec = await rpcAsUser<any[]>('get_products_for_reception', adminToken, {
      p_store_id: storeId, p_search_term: '', p_page: 1, p_page_size: 50,
    });
    expect(rec.ok).toBe(true);
    const rows = rec.data || [];
    // A (local activa) + B (solo maestro) = 2 filas
    expect(rows.length).toBe(2);
    const localRow = rows.find((x: any) => x.id === localProductId);
    expect(localRow, 'la fila local del maestro A debe aparecer').toBeTruthy();
    expect(localRow.source).toBe('local');
    expect(num(localRow.price)).toBe(RECEPTION_PRICE);
    expect(num(localRow.stock_current)).toBe(10);
    const masterRow = rows.find((x: any) => x.source === 'master');
    expect(masterRow.sku).toBe(MASTER_B.sku);
  });

  // ────────────────────────────────────────────────────────────────────────
  // FASE C · Liquidación de recepciones (canal atómico batch)
  // ────────────────────────────────────────────────────────────────────────
  test('C1 · liquidación EXACTA al confirmar (efectivo total) → paid + saldo 0', async ({ request }) => {
    const [receipt] = await sb.select<any>('receipts', `store_id=eq.${storeId}&select=*&order=created_at.desc&limit=1`);
    expect(receipt.status).toBe('active');
    const total = num(receipt.total_cost);
    expect(total).toBe(10 * RECEPTION_COST);

    const res = await request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'receipt', ref_id: receipt.id,
        payments: [{ payment_method: 'cash', amount: total, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `cplog-c1-${SFX}`,
      },
    });
    expect(res.status(), await res.text()).toBe(201);

    const [after] = await sb.select<any>('receipts', `id=eq.${receipt.id}&select=payment_status,paid_amount,total_cost`);
    expect(after.payment_status).toBe('paid');
    expect(num(after.paid_amount)).toBe(total);

    const pays = await sb.select<any>('payment_transactions', `ref_type=eq.receipt&ref_id=eq.${receipt.id}&select=*`);
    expect(pays.length).toBe(1);
    expect(pays[0].payment_method).toBe('cash');
    expect(num(pays[0].amount)).toBe(total);
  });

  test('C2 · segunda recepción + liquidación PARCIAL por transferencia (con referencia) → partial + saldo; luego completar → paid', async ({ request }) => {
    const reg = await rpcAsUser<any>('register_reception', encToken, {
      p_store_id: storeId,
      p_supplier: `Proveedor CPLOG ${SFX}`,
      p_reception_date: new Date().toISOString(),
      p_invoice_number: `FAC-CPLOG-${SFX}-2`,
      p_items: [{
        product_id: localProductId, sku: MASTER_A.sku, quantity: 5,
        unit_cost: RECEPTION_COST, unit_of_measure: MASTER_A.uom,
        sale_price: RECEPTION_PRICE, variant_id: null,
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0, price_currency: 'CUP',
      }],
      p_user_id: encUserId, p_po_id: null,
      p_supplier_code: null, p_supplier_tax_id: null, p_supplier_phone: null, p_supplier_address: null,
    });
    expect(reg.ok).toBe(true);
    const receiptId = reg.data;
    const total = 5 * RECEPTION_COST; // 300

    // Pago PARCIAL por transferencia (la mitad) CON referencia del banco.
    const half = total / 2;
    const res1 = await request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'receipt', ref_id: receiptId,
        payments: [{ payment_method: 'transfer', amount: half, currency: 'CUP', exchange_rate: 1, reference: `TRF-CPLOG-${SFX}-P1` }],
        idempotency_key: `cplog-c2p1-${SFX}`,
      },
    });
    expect(res1.status(), await res1.text()).toBe(201);

    let [mid] = await sb.select<any>('receipts', `id=eq.${receiptId}&select=payment_status,paid_amount,total_cost`);
    expect(mid.payment_status).toBe('partial');
    expect(num(mid.paid_amount)).toBe(half);

    // La referencia quedó vinculada al pago.
    const pays1 = await sb.select<any>('payment_transactions', `ref_type=eq.receipt&ref_id=eq.${receiptId}&select=*`);
    expect(pays1.length).toBe(1);
    expect(pays1[0].payment_method).toBe('transfer');
    expect(pays1[0].reference).toBe(`TRF-CPLOG-${SFX}-P1`);

    // Completar el saldo con efectivo → paid.
    const res2 = await request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'receipt', ref_id: receiptId,
        payments: [{ payment_method: 'cash', amount: half, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `cplog-c2p2-${SFX}`,
      },
    });
    expect(res2.status()).toBe(201);
    const [end] = await sb.select<any>('receipts', `id=eq.${receiptId}&select=payment_status,paid_amount,total_cost`);
    expect(end.payment_status).toBe('paid');
    expect(num(end.paid_amount)).toBe(total);
  });

  test('C3 · overpay del lote → 400 ERR_BATCH_OVERPAY (fail-closed, sin escrituras)', async ({ request }) => {
    const [receipt] = await sb.select<any>('receipts', `store_id=eq.${storeId}&payment_status=eq.paid&select=*&order=created_at.desc&limit=1`);
    const total = num(receipt.total_cost);
    const paysBefore = (await sb.select<any>('payment_transactions', `ref_type=eq.receipt&ref_id=eq.${receipt.id}&select=id`)).length;

    const res = await request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'receipt', ref_id: receipt.id,
        payments: [{ payment_method: 'cash', amount: total + 1, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `cplog-c3-${SFX}`,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('ERR_BATCH_OVERPAY');

    const paysAfter = (await sb.select<any>('payment_transactions', `ref_type=eq.receipt&ref_id=eq.${receipt.id}&select=id`)).length;
    expect(paysAfter).toBe(paysBefore); // sin escrituras
  });

  test('C4 · gate de estado: recepción ANULADA no admite pagos → 409 ERR_RECEIPT_NOT_PAYABLE', async ({ request }) => {
    const reg = await rpcAsUser<any>('register_reception', encToken, {
      p_store_id: storeId,
      p_supplier: `Proveedor CPLOG ${SFX}`,
      p_reception_date: new Date().toISOString(),
      p_invoice_number: `FAC-CPLOG-${SFX}-3`,
      p_items: [{
        product_id: localProductId, sku: MASTER_A.sku, quantity: 1,
        unit_cost: RECEPTION_COST, unit_of_measure: MASTER_A.uom,
        sale_price: RECEPTION_PRICE, variant_id: null,
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0, price_currency: 'CUP',
      }],
      p_user_id: encUserId, p_po_id: null,
      p_supplier_code: null, p_supplier_tax_id: null, p_supplier_phone: null, p_supplier_address: null,
    });
    expect(reg.ok).toBe(true);
    const receiptId = reg.data;

    // Anular (service-role: preparación de estado del fixture).
    await sb.update('receipts', `id=eq.${receiptId}`, { status: 'voided' });

    const res = await request.post('/api/payments', {
      headers: apiHeaders(adminToken),
      data: {
        ref_type: 'receipt', ref_id: receiptId,
        payments: [{ payment_method: 'cash', amount: 10, currency: 'CUP', exchange_rate: 1 }],
        idempotency_key: `cplog-c4-${SFX}`,
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('ERR_RECEIPT_NOT_PAYABLE');
  });

  // ────────────────────────────────────────────────────────────────────────
  // FASE D · POS: referencia de transferencia por pago + nota general
  // ────────────────────────────────────────────────────────────────────────
  function checkoutPayload(overrides: Record<string, unknown> = {}) {
    return {
      store_id: storeId,
      seller_id: adminUserId,
      payment_method: 'transfer',
      total_amount: 2 * RECEPTION_PRICE,
      subtotal: 2 * RECEPTION_PRICE,
      cash_amount: 0,
      transfer_amount: 2 * RECEPTION_PRICE,
      zelle_amount: 0,
      tax_amount: 0,
      sale_currency: 'CUP',
      idempotency_key: `cplog-d-${SFX}-${Math.random().toString(36).slice(2, 8)}`,
      items: [
        { product_id: localProductId, quantity: 2, price: RECEPTION_PRICE, cost: RECEPTION_COST },
      ],
      ...overrides,
    };
  }

  test('D1 · venta por transferencia con referencia → payment_transactions.reference persistida + nota general en la venta', async ({ request }) => {
    // Baseline dinámico de stock (patrón E2E-POS-008): recepciones previas
    // del propio spec (B1: 10, C2: 5, C4: 1 — anulada vía UPDATE directo, sin
    // reversión de stock) hacen frágil un número absoluto.
    const [invBefore] = await sb.select<any>('inventory', `store_id=eq.${storeId}&product_id=eq.${localProductId}&select=quantity`);
    const stockBefore = num(invBefore?.quantity);
    const NOTE = `Nota general E2E CPLOG ${SFX} — entrega en taller, cliente Ana`;
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: checkoutPayload({
        payment_components: [
          { method: 'transfer', currency: 'CUP', amount: 2 * RECEPTION_PRICE, reference: `TRF-E2E-${SFX}-D1` },
        ],
        sale_notes: NOTE,
      }),
    });
    expect(res.status(), await res.text()).toBe(200);
    const json = await res.json();
    const txId: string = json.transaction_id;
    expect(txId).toBeTruthy();

    // La nota general quedó persistida con el documento de venta.
    const [tx] = await sb.select<any>('transactions', `id=eq.${txId}&select=id,notes,total_amount`);
    expect(tx.notes).toContain(`Nota general E2E CPLOG ${SFX}`);
    expect(num(tx.total_amount)).toBe(2 * RECEPTION_PRICE);

    // La referencia quedó vinculada AL PAGO de la venta.
    const pays = await sb.select<any>('payment_transactions', `transaction_id=eq.${txId}&select=*`);
    expect(pays.length).toBe(1);
    expect(pays[0].payment_method).toBe('transfer');
    expect(pays[0].reference).toBe(`TRF-E2E-${SFX}-D1`);

    // Stock descontado exactamente por la venta (−2).
    const [inv] = await sb.select<any>('inventory', `store_id=eq.${storeId}&product_id=eq.${localProductId}&select=quantity`);
    expect(num(inv.quantity)).toBe(stockBefore - 2);
  });

  test('D2 · DOS transferencias con referencias distintas → DOS filas con SUS referencias (no una global que sustituya)', async ({ request }) => {
    const [invBefore2] = await sb.select<any>('inventory', `store_id=eq.${storeId}&product_id=eq.${localProductId}&select=quantity`);
    const stockBefore2 = num(invBefore2?.quantity);
    // Venta de 1000: 300 transferencia ref-1 + 200 transferencia ref-2 + 500 efectivo.
    const res = await request.post('/api/pos/checkout', {
      headers: apiHeaders(adminToken),
      data: checkoutPayload({
        payment_method: 'mixed',
        total_amount: 10 * RECEPTION_PRICE,
        subtotal: 10 * RECEPTION_PRICE,
        cash_amount: 500,
        transfer_amount: 500,
        items: [{ product_id: localProductId, quantity: 10, price: RECEPTION_PRICE, cost: RECEPTION_COST }],
        payment_components: [
          { method: 'transfer', currency: 'CUP', amount: 300, reference: `TRF-E2E-${SFX}-D2A` },
          { method: 'transfer', currency: 'CUP', amount: 200, reference: `TRF-E2E-${SFX}-D2B` },
          { method: 'cash', currency: 'CUP', amount: 500 },
        ],
      }),
    });
    expect(res.status(), await res.text()).toBe(200);
    const json = await res.json();
    const txId: string = json.transaction_id;

    // TRES filas de pago: transfer A (300, ref D2A), transfer B (200, ref
    // D2B — claves de idempotencia distintas por el índice del componente)
    // y efectivo (500, sin referencia).
    const pays = await sb.select<any>('payment_transactions', `transaction_id=eq.${txId}&select=*`);
    expect(pays.length).toBe(3);
    const t1 = pays.find((p: any) => p.reference === `TRF-E2E-${SFX}-D2A`);
    const t2 = pays.find((p: any) => p.reference === `TRF-E2E-${SFX}-D2B`);
    const cash = pays.find((p: any) => p.payment_method === 'cash');
    expect(t1, 'la primera transferencia conserva SU referencia').toBeTruthy();
    expect(num(t1.amount)).toBe(300);
    expect(t2, 'la segunda transferencia conserva SU referencia (no sustituida)').toBeTruthy();
    expect(num(t2.amount)).toBe(200);
    expect(t1.id).not.toBe(t2.id); // DOS filas distintas, no una agregada
    expect(cash).toBeTruthy();
    expect(num(cash.amount)).toBe(500);

    // Invariante del cobro: Σ amount_cup = total (1000).
    const sumCup = pays.reduce((s: number, p: any) => s + num(p.amount_cup), 0);
    expect(sumCup).toBe(10 * RECEPTION_PRICE);

    // Stock descontado exactamente por la venta (−10).
    const [inv] = await sb.select<any>('inventory', `store_id=eq.${storeId}&product_id=eq.${localProductId}&select=quantity`);
    expect(num(inv.quantity)).toBe(stockBefore2 - 10);
  });
});
