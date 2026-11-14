/**
 * E2E CP-RECEIPT-INTEGRITY-001 (2026-11-14) — proyecto 'creation'.
 * ============================================================================
 * Auditoría conductual de la integridad económica de las RECEPCIONES contra
 * la BD AISLADA (13 escenarios de la misión):
 *
 *  S1  Recepción completamente en CUP (total = Σ qty·uc).
 *  S2  Recepción completamente en USD (total CUP = Σ qty·uc·tasa, UNA conversión).
 *  S3  Productos con monedas diferentes (líneas mezcladas, cada una con su
 *      snapshot moneda/tasa; total = suma de equivalentes CUP).
 *  S4  Tasa de cambio distinta de la vigente (recepción backdated con tasa
 *      histórica propia: queda CONGELADA por línea, no reconvertida).
 *  S5  Cambio posterior de costo/precio del producto → la recepción
 *      histórica activa NO cambia.
 *  S6  Cambio posterior de moneda del producto → ídem.
 *  S7  Modificación de un BORRADOR (pending): cambia moneda/tasa por línea y
 *      la cabecera se RECALCULA (total_cost = nueva ΣCUP).
 *  S8  Intento de modificación de una recepción CONFIRMADA (active):
 *      409 ERR_NOT_EDITABLE por la ruta; y a nivel BD el trigger
 *      ERR_RECEIPT_ITEM_IMMUTABLE bloquea incluso el service_role; la
 *      cabecera PATCH solo acepta notes.
 *  S9  Anulación de borrador + recepción correctiva nueva.
 *  S10 Recalculo del total desde los detalles (todas las recepciones creadas).
 *  S11 Correspondencia cabecera ↔ detalles ↔ inventario (movimientos vinculados
 *      por uuid con unit_cost YA convertido CUP, cantidades exactas).
 *  S12 Efecto en WAC (uc_in = uc·tasa, conversión única) y CP-FIN (importe del
 *      asiento = ΣCUP de las líneas, cuando el motor esté activo).
 *  S13 Reintento/Idempotencia: factura duplicada rechazada; PATCH no-op
 *      devuelve no_change sin alterar totales.
 *
 * NOTA DE ARQUITECTURA (hallazgo de las corridas de depuración): Playwright
 * puede reiniciar el worker (timeout/fallo) y re-instanciar el módulo →
 * TODO estado compartido entre tests debe ser RESUELTO POR DATOS (consultas
 * por reference_doc determinista) y el sufijo debe derivar del E2E_RUN_ID
 * (estable en todos los workers del mismo run), NUNCA de Date.now().
 *
 * Todos los flujos pasan por servicios REALES de la app: RPC directa con el
 * Bearer del usuario (flujo online del navegador, useRegisterReception), ruta
 * POST /api/inventory/receptions (flujo offline del SyncEngine), rutas PATCH
 * de items/cabecera y RPC void_pending_reception. sb (service_role) SOLO
 * para siembra/verificación/cleanup (net-zero por patrón en afterAll).
 *
 * PRE-REQUISITO: migración 20261114160000_cp_receipt_items_immutable.sql
 * (v2, guard UPDATE) aplicada a la BD aislada.
 *
 * Ejecución: E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npm run test:e2e:creation
 * Higiene: node e2e/scripts/data-hygiene-guard.cjs → "PASS — net delta = 0".
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { signIn, apiHeaders, rpcAsUser, sb, requireIsolatedCreation, seedProduct, type Session } from '../fixtures/session.fixture';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123';

// Sufijo ESTABLE por run (E2E_RUN_ID lo exporta global-setup a todos los
// workers): inmune a reinstanciaciones del módulo.
const RUN_TAG = (process.env.E2E_RUN_ID || 'norun').replace(/[^A-Za-z0-9]/g, '').slice(-6);
const SUFFIX = `R${RUN_TAG}`;
const TODAY = new Date().toISOString().slice(0, 10);
// Backdating permitido (gate de 6 meses): mediados de junio de 2026
const BACKDATE = '2026-06-15T10:00:00.000Z';

// Facturas deterministas del spec (estables en cualquier worker del run)
const INV = {
  cup: `E2E-RI-CUP-${SUFFIX}`,
  usd: `E2E-RI-USD-${SUFFIX}`,
  mix: `E2E-RI-MIX-${SUFFIX}`,
  hist: `E2E-RI-HIST-${SUFFIX}`,
  snap: `E2E-RI-SNAP-${SUFFIX}`,
  draft: `E2E-RI-DR-${SUFFIX}`,
  corr: `E2E-RI-CORR-${SUFFIX}`,
  idem: `E2E-RI-IDEM-${SUFFIX}`,
};

test.beforeAll(() => {
  // FAIL-CLOSED: fuera del proyecto aislado esto LANZA (no crea nada).
  requireIsolatedCreation();
});

let admin: Session;
// Tienda piloto EFÍMERA del run (global-setup la crea en modo aislado y el
// teardown global la elimina → net-zero). NO creamos otra tienda: el
// rate-limit de POST /api/stores (429) se agota tras las pilotos del run.
let store = { id: '' };
// Productos sembrados (por nombre determinista — el alta es idempotente por run)
let pCup = '', pUsd = '', pMixedA = '', pMixedB = '', pBack = '', pDraft = '', pCorrective = '';

/** POST /api/inventory/receptions (flujo REAL del SyncEngine offline: ruta
 *  API + RPC). El middleware withStoreAccess exige store_id raíz además del
 *  p_store_id del contrato Zod. */
async function createReception(request: APIRequestContext, payload: Record<string, unknown>) {
  return request.post('/api/inventory/receptions', {
    headers: apiHeaders(admin.token),
    data: { ...payload, store_id: store.id },
  });
}

/** Flujo REAL online del navegador (useRegisterReception): supabase.rpc(
 *  register_reception) con el Bearer del usuario. */
async function createReceptionRpc(payload: Record<string, unknown>): Promise<string> {
  const r = await rpcAsUser('register_reception', admin.token, { ...payload, p_user_id: admin.userId });
  if (!r.ok) throw new Error(`register_reception RPC: ${r.error}`);
  return String(r.data);
}

function item(product_id: string, quantity: number, unit_cost: number, moneda = 'CUP', tasa: number = 1) {
  return { product_id, quantity, unit_cost, moneda_recepcion: moneda, tasa_cambio_recepcion: tasa };
}

// ── Helpers de verificación independientes (resuelven por DATO, no por memoria) ──
async function receiptByInvoice(invoice: string) {
  const rows = await sb.select('receipts', `store_id=eq.${store.id}&reference_doc=eq.${invoice}&select=*&limit=1`);
  return rows[0] as any;
}
async function itemsOf(id: string) {
  return sb.select('receipt_items', `receipt_id=eq.${id}&select=*&order=created_at.asc`);
}
async function sumCup(id: string): Promise<number> {
  const items = await itemsOf(id);
  return items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_cost) * Number(i.tasa_cambio_recepcion ?? 1), 0);
}

test.beforeAll(async ({ request }) => {
  admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  store = { id: process.env.E2E_TEST_STORE_ID || '' };
  if (!store.id) throw new Error('[receipts-integrity] E2E_TEST_STORE_ID no configurado (global-setup del modo aislado)');

  // 7 productos deterministas (idempotentes por run: misma semilla → mismo sku)
  const seeds: Array<[string, string]> = [
    ['Riel CUP', 'CUP'], ['Panel Solar USD', 'USD'], ['Tornillo Mixture', 'CUP'],
    ['Breaker Mixture', 'USD'], ['Cable Backdated', 'CUP'], ['Clavos Borrador', 'CUP'],
    ['Clavos Correctiva', 'CUP'],
  ];
  const ids: string[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const [name, cur] = seeds[i];
    // sku estable por run → si un worker repite el beforeAll, reutiliza la fila
    const existing = await sb.select('products', `store_id=eq.${store.id}&sku=eq.RI-${SUFFIX}-${i}&select=id&limit=1`);
    if (existing.length) { ids.push(existing[0].id as string); continue; }
    const p = await seedProduct(store, { name: `${name} ${SUFFIX}`, price: 1000, cost: 100, quantity: 10, sku: `RI-${SUFFIX}-${i}` });
    ids.push(p.id);
    if (cur === 'USD') await sb.update('products', `id=eq.${p.id}`, { price_currency: 'USD' });
  }
  [pCup, pUsd, pMixedA, pMixedB, pBack, pDraft, pCorrective] = ids;
});

test.afterAll(async () => {
  // Net-zero POR PATRÓN (inmune a reinstanciaciones): todas las recepciones
  // del spec en la tienda piloto + artefactos asociados.
  if (!store?.id) return;
  const specReceipts = await sb.select('receipts', `store_id=eq.${store.id}&reference_doc=like.E2E-RI-*${SUFFIX}*&select=id`).catch(() => []);
  for (const r of specReceipts as any[]) {
    const finE = await sb.select('fin_entries', `document_id=eq.${r.id}&select=id&limit=1`).catch(() => []);
    if (finE.length) {
      await sb.delete('fin_movements', `entry_id=in.(${finE.map((e: any) => e.id).join(',')})`).catch(() => {});
      await sb.delete('fin_entries', `document_id=eq.${r.id}`).catch(() => {});
    }
    await sb.delete('receipt_tasa_audit', `receipt_item_id=in.(select id from receipt_items where receipt_id=eq.${r.id})`).catch(() => {});
    await sb.delete('receipt_items', `receipt_id=eq.${r.id}`).catch(() => {});
    await sb.delete('receipts', `id=eq.${r.id}`).catch(() => {});
  }
  await sb.delete('stock_movements', `store_id=eq.${store.id}`).catch(() => {});
  await sb.delete('kardex_entries', `store_id=eq.${store.id}`).catch(() => {});
  await sb.delete('wac_change_log', `store_id=eq.${store.id}`).catch(() => {});
  await sb.delete('audit_logs', `store_id=eq.${store.id}`).catch(() => {});
  await sb.delete('business_events', `payload->>store_id=eq.${store.id}`).catch(() => {});
  await sb.delete('inventory', `store_id=eq.${store.id}`).catch(() => {});
  await sb.delete('products', `store_id=eq.${store.id}&sku=like.RI-${SUFFIX}-%`).catch(() => {});
  // La tienda piloto la elimina el teardown global del run (hard-delete).
});

// ═══════════════ S1: recepción 100% CUP ═══════════════════════════════════
test('S1 — recepción completamente en CUP: total = Σ qty·uc (sin conversión)', async ({ request }) => {
  const res = await createReception(request, {
    p_store_id: store.id,
    p_supplier: 'Prov CUP',
    p_reception_date: `${TODAY}T12:00:00.000Z`,
    p_invoice_number: INV.cup,
    p_items: [item(pCup, 2, 250), item(pCup, 1, 100)],
  });
  expect([200, 201], `crear CUP: ${await res.text()}`).toContain(res.status());
  const body = await res.json();
  const receiptId = body.receiptId ?? body.id;

  const r = await receiptByInvoice(INV.cup);
  expect(r, 'la recepción debe existir por su factura').toBeDefined();
  expect(r.id).toBe(receiptId);
  console.log('[S1] receipt', receiptId, '| ref_doc =', r.reference_doc, '| store =', r.store_id);
  expect(r.status).toBe('active'); // creada canónicamente
  // La factura del proveedor viaja a reference_doc (clave del chequeo de duplicados)
  expect(r.reference_doc).toBe(INV.cup);
  // Σ(q·uc) = 2·250 + 1·100 = 600 CUP, tasa implícita 1 por línea
  expect(Number(r.total_cost)).toBe(600);
  const items = await itemsOf(receiptId);
  expect(items).toHaveLength(2);
  for (const i of items as any[]) {
    expect(i.moneda_recepcion).toBe('CUP');
    expect(Number(i.tasa_cambio_recepcion)).toBe(1);
  }
});

// ═══════════════ S2: recepción 100% USD ══════════════════════════════════
test('S2 — recepción completamente en USD: total CUP = Σ qty·uc·tasa (UNA sola conversión)', async () => {
  await createReceptionRpc({
    p_store_id: store.id,
    p_supplier: 'Prov USD',
    p_reception_date: `${TODAY}T12:00:00.000Z`,
    p_invoice_number: INV.usd,
    p_items: [item(pUsd, 2, 100, 'USD', 680), item(pUsd, 1, 50, 'USD', 680)],
  });

  const r = await receiptByInvoice(INV.usd);
  // 2·100·680 + 1·50·680 = 136000 + 34000 = 170000 CUP (conversión EXACTAMENTE una vez)
  expect(Number(r.total_cost)).toBe(170000);
  const items = await itemsOf(r.id);
  for (const i of items as any[]) {
    expect(i.moneda_recepcion).toBe('USD');
    expect(Number(i.tasa_cambio_recepcion)).toBe(680);
  }
});

// ═══════════════ S3: monedas mezcladas por línea ══════════════════════════
test('S3 — líneas en monedas diferentes: cada línea conserva su snapshot y el total suma equivalentes CUP', async () => {
  await createReceptionRpc({
    p_store_id: store.id,
    p_supplier: 'Prov Mixto',
    p_reception_date: `${TODAY}T12:00:00.000Z`,
    p_invoice_number: INV.mix,
    p_items: [item(pMixedA, 2, 250), item(pMixedB, 1, 100, 'USD', 680)],
  });

  const r = await receiptByInvoice(INV.mix);
  // CUP: 2·250·1 = 500 | USD: 1·100·680 = 68000 → total 68500 CUP
  expect(Number(r.total_cost)).toBe(68500);
  const items = (await itemsOf(r.id)) as any[];
  const cup = items.find((i) => i.moneda_recepcion === 'CUP')!;
  const usd = items.find((i) => i.moneda_recepcion === 'USD')!;
  expect(Number(cup.tasa_cambio_recepcion)).toBe(1);
  expect(Number(usd.tasa_cambio_recepcion)).toBe(680);
  // Subtotales en moneda original (lo que el modal debe etiquetar por moneda)
  expect(Number(cup.quantity) * Number(cup.unit_cost)).toBe(500);
  expect(Number(usd.quantity) * Number(usd.unit_cost)).toBe(100);
});

// ═══════════════ S4: tasa ≠ vigente (histórica congelada) ═════════════════
test('S4 — tasa de cambio distinta de la actual: queda congelada por línea (no se reconvertiza al consultar)', async () => {
  await createReceptionRpc({
    p_store_id: store.id,
    p_supplier: 'Prov Histórica',
    p_reception_date: BACKDATE,
    p_invoice_number: INV.hist,
    p_items: [item(pBack, 3, 200, 'USD', 500)], // 500 ≠ tasa vigente de hoy
  });

  const r = await receiptByInvoice(INV.hist);
  expect(String(r.reception_date).slice(0, 10)).toBe('2026-06-15');
  expect(Number(r.total_cost)).toBe(3 * 200 * 500); // 300000 CUP a la tasa HISTÓRICA del documento
  const [line] = (await itemsOf(r.id)) as any[];
  expect(Number(line.tasa_cambio_recepcion)).toBe(500); // congelada

  // La tasa ACTUAL del mercado no reescribe el documento (no hay re-conversión al consultar)
  const r2 = await receiptByInvoice(INV.hist);
  expect(Number(r2.total_cost)).toBe(300000);
});

// ═══════════════ S5+S6: editar el producto NO reescribe la historia ═══════
test('S5/S6 — cambio posterior de costo y moneda del producto: la recepción activa NO cambia', async () => {
  await createReceptionRpc({
    p_store_id: store.id,
    p_supplier: 'Prov Snapshot',
    p_reception_date: `${TODAY}T12:00:00.000Z`,
    p_invoice_number: INV.snap,
    p_items: [item(pCup, 1, 250)],
  });

  const before = await receiptByInvoice(INV.snap);
  const itemsBefore = await itemsOf(before.id);

  // S5: cambiar costo/precio actuales del producto
  await sb.update('products', `id=eq.${pCup}`, { cost_price: 999999, price: 888888 });
  // S6: cambiar la MONEDA del producto
  await sb.update('products', `id=eq.${pCup}`, { price_currency: 'USD' });

  const after = await receiptByInvoice(INV.snap);
  const itemsAfter = await itemsOf(before.id);
  expect(Number(after.total_cost)).toBe(Number(before.total_cost)); // 250 CUP intacto
  expect(JSON.stringify(itemsAfter)).toBe(JSON.stringify(itemsBefore)); // snapshot de línea intacto

  // Restaurar el producto (higiene del fixture)
  await sb.update('products', `id=eq.${pCup}`, { cost_price: 100, price: 1000, price_currency: 'CUP' });
});

// ═══════════════ S7: modificación de un BORRADOR (pending) ════════════════
test('S7 — borrador: cambiar moneda/tasa por línea recalcula la cabecera', async ({ request }) => {
  // Sembrar borrador como lo hace useSavePendingReception (cliente del usuario)
  const INS = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const rres = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/receipts`, {
    method: 'POST', headers: INS,
    body: JSON.stringify({ store_id: store.id, supplier: 'Prov Borrador', reception_date: TODAY, reference_doc: INV.draft, status: 'pending', total_cost: 200, payment_status: 'unpaid', payment_terms_days: 30 }),
  });
  expect(rres.status, `insertar borrador: HTTP ${rres.status}`).toBe(201);
  const [draft] = await rres.json();

  const ires = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/receipt_items`, {
    method: 'POST', headers: INS,
    body: JSON.stringify({ receipt_id: draft.id, product_id: pDraft, quantity: 2, unit_cost: 100, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }),
  });
  expect(ires.status, `insertar item borrador: HTTP ${ires.status}`).toBe(201);
  const [draftItem] = await ires.json();

  // El borrador total_cost calculado client-side era 200 CUP
  expect(Number((await receiptByInvoice(INV.draft)).total_cost)).toBe(200);

  // Editar la línea: CUP→USD a 700 — la ruta debe aceptarlo (pending) y RECALCULAR
  const pres = await request.patch(`/api/inventory/receptions/${draft.id}/items/${draftItem.id}`, {
    headers: apiHeaders(admin.token),
    data: { moneda_recepcion: 'USD', tasa_cambio_recepcion: 700, motivo: 'E2E: corrección de borrador' },
  });
  expect(pres.status(), `editar borrador: ${await pres.text()}`).toBe(200);
  const pdata = await pres.json();
  expect(pdata.receipt_total_cost_cup).toBe(2 * 100 * 700); // 140000

  // La cabecera quedó persistida con el total recalculado
  expect(Number((await receiptByInvoice(INV.draft)).total_cost)).toBe(140000);
  // Y existe auditoría de la mutación
  const audit = await sb.select('receipt_tasa_audit', `receipt_item_id=eq.${draftItem.id}&select=*`);
  expect(audit.length).toBe(1);
  expect(audit[0].moneda_nueva).toBe('USD');
});

// ═══════════════ S8: recepción CONFIRMADA es inmutable ═══════════════════
test('S8 — recepción confirmada: 409 ERR_NOT_EDITABLE + trigger bloquea service_role + cabecera solo notes', async ({ request }) => {
  const active = await receiptByInvoice(INV.usd);
  expect(active, 'S2 debe existir').toBeDefined();
  const [line] = (await itemsOf(active.id)) as any[];
  const before = active;
  const lineBefore = JSON.stringify(line);

  // (a) La ruta rechaza con 409 y remedio
  const pres = await request.patch(`/api/inventory/receptions/${active.id}/items/${line.id}`, {
    headers: apiHeaders(admin.token),
    data: { tasa_cambio_recepcion: 999, motivo: 'E2E: intento prohibido' },
  });
  expect(pres.status(), `editar confirmada: ${await pres.text()}`).toBe(409);
  const pdata = await pres.json();
  expect(pdata.code).toBe('ERR_NOT_EDITABLE');
  expect(pdata.remedio).toBeDefined();

  // (b) El trigger bloquea incluso service_role (escritura directa de la línea)
  await expect(sb.update('receipt_items', `id=eq.${line.id}`, { tasa_cambio_recepcion: 999 }))
    .rejects.toThrow(/ERR_RECEIPT_ITEM_IMMUTABLE/);

  // (c) La cabecera PATCH rechaza campos económicos (solo notes)
  const hres = await request.patch(`/api/inventory/receptions/${active.id}`, {
    headers: apiHeaders(admin.token),
    data: { referenceDoc: 'E2E-FACTURA-FALSA' },
  });
  expect(hres.status()).toBe(409);
  const nres = await request.patch(`/api/inventory/receptions/${active.id}`, {
    headers: apiHeaders(admin.token),
    data: { notes: 'Nota posterior sin efecto económico' },
  });
  expect(nres.status()).toBe(200);

  // (d) NADA cambió
  const after = await receiptByInvoice(INV.usd);
  expect(Number(after.total_cost)).toBe(Number(before.total_cost));
  expect(JSON.stringify((await itemsOf(active.id))[0])).toBe(lineBefore);
  expect(after.reference_doc).toBe(before.reference_doc);
});

// ═══════════════ S9: anulación de borrador + correctiva ══════════════════
test('S9 — anulación de borrador (voided) + recepción correctiva nueva', async () => {
  const draft = await receiptByInvoice(INV.draft);
  expect(draft, 'el borrador de S7 debe existir').toBeDefined();

  // Anular el borrador por la RPC canónica (como la UI)
  const voided = await rpcAsUser('void_pending_reception', admin.token, {
    p_receipt_id: draft.id,
    p_user_id: admin.userId,
    p_reason: 'E2E: anulación para correctiva',
  });
  expect(voided.ok, `void: ${voided.error}`).toBe(true);

  const v = await receiptByInvoice(INV.draft);
  expect(v.status).toBe('voided');
  // Preserva las líneas (auditoría) — no las destruye
  expect((await itemsOf(draft.id)).length).toBe(1);

  // Recepción CORRECTIVA nueva con los valores correctos
  await createReceptionRpc({
    p_store_id: store.id,
    p_supplier: 'Prov Correctiva',
    p_reception_date: `${TODAY}T12:00:00.000Z`,
    p_invoice_number: INV.corr,
    p_items: [item(pCorrective, 2, 100, 'USD', 700)],
  });
  expect(Number((await receiptByInvoice(INV.corr)).total_cost)).toBe(140000);
});

// ═══════════════ S10: recalculo desde los detalles (todas) ═══════════════
test('S10 — recalculo independiente desde receipt_items: cabecera == Σ qty·uc·tasa en todas', async () => {
  const rows = await sb.select('receipts', `store_id=eq.${store.id}&reference_doc=like.E2E-RI-*${SUFFIX}*&select=id,reference_doc,status,total_cost&order=created_at.asc`);
  expect(rows.length).toBeGreaterThanOrEqual(7);
  for (const r of rows as any[]) {
    const sum = await sumCup(r.id);
    expect(Number(r.total_cost), `receipt ${r.reference_doc} (${r.status})`).toBe(sum);
  }
});

// ═══════════════ S11: correspondencia con inventario ═════════════════════
test('S11 — inventario: movimientos vinculados por uuid con unit_cost YA convertido y cantidades exactas', async () => {
  // La recepción S1 (CUP, 3 unidades de pCup en dos líneas: 2@250 + 1@100)
  const s1 = await receiptByInvoice(INV.cup);
  const movs = await sb.select('stock_movements', `notes=eq.${s1.id}&select=*&order=created_at.asc`);
  expect(movs.length).toBe(2); // una por línea
  const items = (await itemsOf(s1.id)) as any[];
  const qtySum = movs.reduce((s: number, m: any) => s + Number(m.quantity_change), 0);
  const itemsQty = items.reduce((s, i) => s + Number(i.quantity), 0);
  expect(qtySum).toBe(itemsQty); // 3
  // unit_cost de los movimientos en CUP = uc·tasa (matching por producto Y cantidad:
  // dos líneas del mismo producto no son intercambiables)
  for (const m of movs as any[]) {
    const li = items.find((i) => i.product_id === m.product_id && Number(i.quantity) === Number(m.quantity_change));
    expect(li, 'movimiento ↔ línea por (producto, cantidad)').toBeDefined();
    expect(Number(m.unit_cost)).toBe(Number(li.unit_cost) * Number(li.tasa_cambio_recepcion ?? 1));
    expect(m.movement_type).toBe('purchase');
  }

  // La recepción S2 (USD): movimientos vinculados con la conversión aplicada
  const s2 = await receiptByInvoice(INV.usd);
  const movs2 = await sb.select('stock_movements', `notes=eq.${s2.id}&select=*&order=created_at.asc`);
  expect(movs2.length).toBe(2);
  const items2 = (await itemsOf(s2.id)) as any[];
  // Conversión exactamente una vez: unit_cost del movimiento = uc·tasa (NO uc·tasa²)
  const movUsd = movs2.find((m: any) => Number(m.unit_cost) === 100 * 680) as any;
  expect(movUsd).toBeTruthy();
  const line100 = items2.find((i) => Number(i.unit_cost) === 100)!;
  expect(Number(movUsd.unit_cost)).toBe(Number(line100.unit_cost) * 680); // 68000, no 680·680·100
});

// ═══════════════ S12: efecto en WAC y CP-FIN ═════════════════════════════
test('S12 — WAC registra uc_in = uc·tasa (conversión única) y CP-FIN contabiliza ΣCUP de las líneas', async () => {
  // WAC: la recepción USD (S2) alimentó el promedio con uc_in CUP = uc·680
  // (una fila por línea; el conjunto debe calzar con los costos CUP de las líneas)
  const s2 = await receiptByInvoice(INV.usd);
  const wacRows = await sb.select('wac_change_log', `product_id=eq.${pUsd}&event=eq.reception_in&select=*&order=created_at.desc&limit=10`);
  const fromReceipt = wacRows.filter((w: any) => (w.source_ref as any)?.receipt_id === s2.id);
  expect(fromReceipt.length).toBe(2);
  const ucInSet = fromReceipt.map((w: any) => Number(w.uc_in)).sort((a: number, b: number) => a - b);
  expect(ucInSet).toEqual([50 * 680, 100 * 680]); // [34000, 68000] — conversión única

  // CP-FIN: si el motor está activo en la BD aislada, el asiento de
  // reconocimiento debe valer exactamente ΣCUP de las líneas
  const rows = await sb.select('receipts', `store_id=eq.${store.id}&reference_doc=like.E2E-RI-*${SUFFIX}*&select=id&order=created_at.asc`);
  for (const r of rows as any[]) {
    const entries = await sb.select('fin_entries', `document_type=eq.RECEPCION&document_id=eq.${r.id}&select=*&limit=5`);
    if (entries.length === 0) {
      test.info().annotations.push({ type: 'note', description: `receipt ${r.id}: sin motor CP-FIN activo en la BD aislada (sin asiento) — verificación omitida` });
      continue;
    }
    const recog = entries.find((e: any) => e.event === 'reconocimiento');
    if (!recog) continue;
    const amount = Number((recog as any).movements_snapshot[0].amount);
    expect(amount, `CP-FIN receipt ${r.id}`).toBe(await sumCup(r.id));
  }
});

// ═══════════════ S13: reintento e idempotencia ═══════════════════════════
test('S13 — factura duplicada rechazada y PATCH no-op devuelve no_change sin alterar totales', async ({ request }) => {
  // (a) Duplicado de factura del S1 — la RPC debe rechazarlo (ERR_INVOICE_DUPLICATE)
  const dup = await rpcAsUser('register_reception', admin.token, {
    p_store_id: store.id,
    p_supplier: 'Prov CUP',
    p_reception_date: `${TODAY}T12:00:00.000Z`,
    p_invoice_number: INV.cup, // MISMA factura (sufijo estable del run) → rechazo
    p_items: [item(pCup, 1, 250)],
    p_user_id: admin.userId,
  });
  expect(dup.ok, `duplicado debe rechazarse: ${JSON.stringify(dup)}`).toBe(false);
  if (dup.ok) {
    // Telemetría forense del fallo: fila creada, fila de S1 y conteo global.
    const dupRow = await sb.select('receipts', `id=eq.${dup.data}&select=id,store_id,reference_doc,status,total_cost`);
    console.log('[S13] FILA CREADA POR EL DUPLICADO:', JSON.stringify(dupRow));
    const s1Row = await sb.select('receipts', `reference_doc=eq.${INV.cup}&select=id,store_id,reference_doc`);
    console.log('[S13] TODAS las receipts con esa factura (global):', JSON.stringify(s1Row));
    console.log('[S13] store del módulo =', store.id, '| E2E_TEST_STORE_ID =', process.env.E2E_TEST_STORE_ID);
  }
  expect(dup.error || '').toMatch(/INVOICE_DUPLICATE|duplicate|unique/i);
  // El rechazo NO creó una segunda recepción con esa factura
  const byRef = await sb.select('receipts', `store_id=eq.${store.id}&reference_doc=eq.${INV.cup}&select=id`);
  expect(byRef.length).toBe(1);

  // (b) PATCH no-op sobre un borrador VIVO: mismo valor → no_change, totales estables
  const INS = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const rres = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/receipts`, {
    method: 'POST', headers: INS,
    body: JSON.stringify({ store_id: store.id, supplier: 'Prov Idempotencia', reception_date: TODAY, reference_doc: INV.idem, status: 'pending', total_cost: 200, payment_status: 'unpaid', payment_terms_days: 30 }),
  });
  expect(rres.status, `insertar borrador idem: HTTP ${rres.status}`).toBe(201);
  const [idem] = await rres.json();
  const ires = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/receipt_items`, {
    method: 'POST', headers: INS,
    body: JSON.stringify({ receipt_id: idem.id, product_id: pDraft, quantity: 2, unit_cost: 100, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }),
  });
  expect(ires.status, `insertar item idem: HTTP ${ires.status}`).toBe(201);
  const [idemItem] = await ires.json();

  const before = await receiptByInvoice(INV.idem);
  const nop = await request.patch(`/api/inventory/receptions/${idem.id}/items/${idemItem.id}`, {
    headers: apiHeaders(admin.token),
    data: { tasa_cambio_recepcion: 1 }, // mismo valor → no-op
  });
  expect(nop.status(), `no-op: ${await nop.text()}`).toBe(200);
  const nd = await nop.json();
  expect(nd.status).toBe('no_change');
  const after = await receiptByInvoice(INV.idem);
  expect(Number(after.total_cost)).toBe(Number(before.total_cost)); // 200 estable
});
