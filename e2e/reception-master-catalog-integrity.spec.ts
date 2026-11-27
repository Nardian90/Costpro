/**
 * E2E — CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 (2026-11-16)
 * ============================================================================
 * Batería OBLIGATORIA de la misión (§11): 20 escenarios sobre el flujo de
 * importación Excel de recepciones en tiendas conectadas al Catálogo Maestro.
 *
 * Motor bajo prueba (migraciones 20261116140000 + 20261116140100):
 *   · classify_reception_import_rows (clasificación READ-ONLY, resumen backend)
 *   · resolve_reception_import_rows (escritor canónico por fila, idempotente)
 *   · reactivate_master_product (gobernador-only, alcance global)
 *   · activate_master_product (activación local de fila vinculada inactiva)
 *   · register_reception fail-closed A5/A6/A7 + rol para crear maestro
 *   · trg_products_master_link_guard (regla estructural anti-huérfanos)
 *   · create_transfer espejo con identidad maestra (no cubierto por los 20)
 *
 * Entorno: BD aislada CostproE2E (guard fail-closed) + pilotos del run.
 * Cleanup: delta neto cero (patrón master-catalog-receptions-sync).
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import {
  signIn, sb, rpcAsUser,
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
  ensureEncargadoSession,
} from './fixtures/session.fixture';
import { readRunContext } from './fixtures/run-env';

let adminToken = '';
// CP-BRA-R06: token de ENCARGADO por tienda (creación = encargado|superadmin).
const encTokens = new Map<string, string>();
async function encTokenFor(storeId: string): Promise<string> {
  if (!encTokens.has(storeId)) {
    encTokens.set(storeId, (await ensureEncargadoSession(storeId)).token);
  }
  return encTokens.get(storeId)!;
}
let adminId = '';
let clerkToken = '';
let clerkId = '';
let tenantId = '';
let storeA = ''; // conectada (principal)
let storeB = ''; // conectada (multitienda / concurrencia)
let storeC = ''; // NO conectada (comportamiento histórico)
let storeD = ''; // conectada DESPUÉS de tener productos (huérfanos históricos)

const SFX = Date.now().toString(36);
const NS = `RMCI-${SFX}`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.E2E_SUPABASE_ANON_KEY || '';

/** SKU literal con sufijo del run. */
const sku = (n: string) => `${NS}-${n}`;

/** Fila estándar del Excel de recepciones. */
function row(s: string, name: string, quantity = 10, unit_cost = 5, sale_price: number | null = 0) {
  return { sku: s, name, quantity, unit_cost, unit_of_measure: 'unidad', sale_price };
}

interface ClassifyRow {
  index: number; sku: string; name: string; status: string;
  product_id: string | null; master_product_id: string | null;
  master_status: string | null; local_is_active?: boolean;
  orphan_local?: boolean; can_create_master?: boolean;
  reasons: string[];
}
interface ClassifyRes {
  catalog_connected: boolean;
  rows: ClassifyRow[];
  summary: {
    total: number; identified: number; activate_local: number; reactivate_master: number;
    new_master: number; new_master_blocked: number; new_local: number; review: number;
    error: number; valid_lines: number; valid_lines_with_reactivation: number;
  };
}
interface ResolveRes {
  status: string;
  summary: {
    identified: number; masters_created: number; masters_reactivated: number;
    locals_created: number; locals_activated: number; blocked: number; valid_lines: number;
  };
  results: Array<{ index: number; sku: string; status: string; action: string; product_id: string | null; reasons?: string[] }>;
}

test.beforeAll(async () => {
  const ctx = readRunContext();
  test.skip(!ctx, 'Requiere modo aislado (E2E_ISOLATION=1 con run provisionado)');
  if (!ctx) return;
  tenantId = ctx.tenantId;
  storeA = ctx.pilotStoreA.id;
  storeB = ctx.pilotStoreB.id;

  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
  clerkToken = clerk.token;
  clerkId = clerk.userId;

  // storeC: misma organización, NO conectada (escenario 17).
  const [c] = await sb.insert('stores', [{ name: `E2E80 RMCI-C ${SFX}`, tenant_id: tenantId, is_active: true }]);
  storeC = String(c.id);
  // storeD: misma organización; se conecta DESPUÉS de sembrar huérfanos
  // históricos (escenario 15: refleja el caso real de tiendas conectadas a
  // posteriori con catálogo local previo).
  const [d] = await sb.insert('stores', [{ name: `E2E80 RMCI-D ${SFX}`, tenant_id: tenantId, is_active: true }]);
  storeD = String(d.id);

  // Huérfanos históricos en storeD ANTES de conectar (active + inactive).
  await sb.insert('products', [
    { store_id: storeD, tenant_id: tenantId, sku: sku('H15'), name: 'Historico Activo sin maestro', is_active: true, is_complete: true, stock_current: 3, cost_price: 2, price: 4, cost_average: 1, min_stock: 1 },
    { store_id: storeD, tenant_id: tenantId, sku: sku('H15B'), name: 'Historico Inactivo sin maestro', is_active: false, is_complete: true, stock_current: 0, cost_price: 2, price: 4, cost_average: 1, min_stock: 1 },
  ]);

  // Conectar A, B y D al catálogo de la organización (gobernador = owner).
  for (const sid of [storeA, storeB, storeD]) {
    const r = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: sid });
    if (!r.ok) throw new Error(`connect_store_catalog falló para ${sid}: ${r.error}`);
  }
});

test.afterAll(async () => {
  // Higiene net-zero acotada a los artefactos de ESTA ejecución.
  try {
    if (adminId) {
      await sb.delete('audit_logs', `user_id=eq.${adminId}`);
      await sb.delete('master_change_log', `actor_id=eq.${adminId}`);
    }
    if (clerkId) await sb.delete('audit_logs', `user_id=eq.${clerkId}`);
  } catch { /* best-effort */ }
  try {
    for (const sid of [storeA, storeB, storeC, storeD].filter(Boolean)) {
      const recs = await sb.select<{ id: string }>('receipts', `store_id=eq.${sid}&select=id`);
      if (recs.length) {
        const ids = recs.map(r => r.id).join(',');
        await sb.delete('receipt_items', `receipt_id=in.(${ids})`).catch(() => {});
        await sb.delete('receipts', `id=in.(${ids})`);
      }
      const prods = await sb.select<{ id: string }>('products', `store_id=eq.${sid}&select=id`);
      if (prods.length) {
        const pids = prods.map(p => p.id).join(',');
        await sb.delete('stock_movements', `product_id=in.(${pids})`).catch(() => {});
        await sb.delete('inventory_batches', `product_id=in.(${pids})`).catch(() => {});
        await sb.delete('product_lots', `product_id=in.(${pids})`).catch(() => {});
      }
      await sb.delete('products', `store_id=eq.${sid}`);
      await sb.delete('catalog_store_links', `store_id=eq.${sid}`).catch(() => {});
    }
  } catch { /* best-effort */ }
  try {
    // Maestros del tenant del run creados por esta ejecución (namespace).
    await sb.delete('master_products', `tenant_id=eq.${tenantId}&sku=like.${NS}*`);
  } catch { /* best-effort */ }
  try {
    for (const sid of [storeC, storeD].filter(Boolean)) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/rpc/e2e_hard_delete_store`, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_store_id: sid }),
      });
      if (!del.ok) await sb.delete('stores', `id=eq.${sid}`).catch(() => {});
    }
  } catch { /* best-effort: el sweep del run cubre el resto */ }
});

/** INSERT directo REST como usuario (emula el INSERT del navegador, RLS real). */
async function restInsertAsUser(token: string, table: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 400) };
}

/** PATCH directo REST como service-role que puede FALLAR (guards de trigger). */
async function patchProductsExpectError(query: string, patch: unknown): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?${query}`, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  return res.ok ? '' : (await res.text());
}

async function classify(token: string, storeId: string, rows: unknown[]) {
  const r = await rpcAsUser<ClassifyRes>('classify_reception_import_rows', token, { p_store_id: storeId, p_rows: rows });
  if (!r.ok) throw new Error(`classify falló: ${r.error}`);
  return r.data as ClassifyRes;
}

async function resolve(token: string, storeId: string, rows: unknown[], confirm: string[] = []) {
  const r = await rpcAsUser<ResolveRes>('resolve_reception_import_rows', token, {
    p_store_id: storeId, p_rows: rows, p_confirm_reactivation: confirm,
  });
  if (!r.ok) throw new Error(`resolve falló: ${r.error}`);
  return r.data as ResolveRes;
}

async function registerReception(token: string, storeId: string, items: unknown[], invoice: string) {
  return rpcAsUser<string>('register_reception', token, {
    p_store_id: storeId,
    p_supplier: 'Proveedor E2E RMCI',
    p_invoice_number: invoice,
    p_items: items,
  });
}

/** Crea un maestro + fila local vinculada ACTIVA en storeId (setup). */
async function seedMasterAndLocal(storeId: string, s: string, name: string, opts: { inactive?: boolean } = {}) {
  const r = await rpcAsUser<{ master_product_id: string; product_id: string }>('create_master_product', adminToken, {
    p_store_id: storeId, p_sku: s, p_name: name, p_unit_of_measure: 'unidad',
  });
  if (!r.ok) throw new Error(`seedMasterAndLocal falló: ${r.error}`);
  if (opts.inactive) {
    await sb.update('products', `id=eq.${r.data!.product_id}`, { is_active: false });
  }
  return r.data!;
}

test.describe.serial('CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 — 20 escenarios', () => {

  // ═══ 1. Producto activo en maestro y tienda: se identifica, sin duplicación ═══
  test('01 — identificado: activo en maestro y tienda, sin duplicación', async () => {
    const S = sku('E01');
    const seed = await seedMasterAndLocal(storeA, S, 'Producto Activo Vinculado');
    const c = await classify(adminToken, storeA, [row(S, 'Producto Activo Vinculado')]);
    expect(c.catalog_connected).toBe(true);
    const r0 = c.rows[0];
    expect(r0.status).toBe('identified');
    expect(r0.product_id).toBe(seed.product_id);
    expect(r0.master_product_id).toBe(seed.master_product_id);
    expect(c.summary.identified).toBe(1);
    expect(c.summary.new_master).toBe(0);
    expect(c.summary.valid_lines).toBe(1);

    // resolve NO crea nada (idempotente sobre identificados).
    const res = await resolve(adminToken, storeA, [row(S, 'Producto Activo Vinculado')]);
    expect(res.summary.masters_created).toBe(0);
    expect(res.summary.locals_created).toBe(0);
    expect(res.summary.identified).toBe(1);
    // Sin duplicación en BD:
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(1);
    const prods = await sb.select('products', `store_id=eq.${storeA}&sku=eq.${S}&select=id`);
    expect(prods.length).toBe(1);
  });

  // ═══ 2. Maestro + asociación local INACTIVA: se activa localmente ═══
  test('02 — asociación local inactiva: «Se activará en esta tienda»', async () => {
    const S = sku('E02');
    const seed = await seedMasterAndLocal(storeA, S, 'Producto Local Inactivo', { inactive: true });

    const c = await classify(adminToken, storeA, [row(S, 'Producto Local Inactivo')]);
    expect(c.rows[0].status).toBe('activate_local');
    expect(c.rows[0].master_product_id).toBe(seed.master_product_id);
    expect(c.summary.activate_local).toBe(1);

    const res = await resolve(adminToken, storeA, [row(S, 'Producto Local Inactivo')]);
    expect(res.summary.locals_activated).toBe(1);
    expect(res.summary.locals_created).toBe(0);
    expect(res.summary.masters_created).toBe(0);

    // La MISMA fila se re-activó (sin duplicado) y quedó activa:
    const prods = await sb.select<{ id: string; is_active: boolean; master_product_id: string }>(
      'products', `store_id=eq.${storeA}&sku=eq.${S}&select=id,is_active,master_product_id`);
    expect(prods.length).toBe(1);
    expect(prods[0].id).toBe(seed.product_id);
    expect(prods[0].is_active).toBe(true);
    expect(prods[0].master_product_id).toBe(seed.master_product_id);
  });

  // ═══ 3. Maestro SIN asociación local: se vincula y activa ═══
  test('03 — sin asociación local: se vincula y activa (fila nueva vinculada)', async () => {
    const S = sku('E03');
    const seed = await seedMasterAndLocal(storeB, S, 'Producto Solo Otra Tienda'); // existe en B, no en A

    const c = await classify(adminToken, storeA, [row(S, 'Producto Solo Otra Tienda')]);
    expect(c.rows[0].status).toBe('activate_local');
    expect(c.rows[0].master_product_id).toBe(seed.master_product_id);
    expect(c.rows[0].product_id).toBeNull();

    const res = await resolve(adminToken, storeA, [row(S, 'Producto Solo Otra Tienda', 10, 5, 25)]);
    expect(res.summary.locals_created).toBe(1);
    expect(res.summary.masters_created).toBe(0); // el maestro YA existía: reutilizado
    const pid = res.results[0].product_id;
    expect(pid).toBeTruthy();

    const prods = await sb.select<{ master_product_id: string; is_active: boolean; price: number; cost_average: number }>(
      'products', `store_id=eq.${storeA}&sku=eq.${S}&select=master_product_id,is_active,price,cost_average`);
    expect(prods.length).toBe(1);
    expect(prods[0].master_product_id).toBe(seed.master_product_id);
    expect(prods[0].is_active).toBe(true);
    expect(Number(prods[0].price)).toBe(25);       // precio PROPIO de esta tienda (del Excel)
    expect(Number(prods[0].cost_average)).toBe(1); // nominal 1 CUP hasta la primera recepción real
    // Un solo maestro (sin duplicación):
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(1);
  });

  // ═══ 4. Producto globalmente INACTIVO (archivado): reactivación explícita ═══
  test('04 — maestro archivado: identificado como existente + reactivación global explícita', async () => {
    const S = sku('E04');
    const seed = await seedMasterAndLocal(storeA, S, 'Producto Archivado Global');
    // Archivar el maestro (setup: no existe RPC de archivado; el estado
    // histórico 'archived' se simula por service-role, único writer permitido
    // para el fixture).
    await sb.update('master_products', `id=eq.${seed.master_product_id}`, { status: 'archived' });

    const c = await classify(adminToken, storeA, [row(S, 'Producto Archivado Global')]);
    const r0 = c.rows[0];
    expect(r0.status).toBe('reactivate_master');       // EXISTENTE, jamás «nuevo»
    expect(r0.master_product_id).toBe(seed.master_product_id);
    expect(c.summary.new_master).toBe(0);
    expect(c.summary.reactivate_master).toBe(1);
    // La previsualización explica el alcance global:
    expect(r0.reasons.join(' ')).toContain('GLOBAL');

    // a) Sin confirmación explícita → bloqueada:
    const resNoConfirm = await resolve(adminToken, storeA, [row(S, 'Producto Archivado Global')]);
    expect(resNoConfirm.results[0].action).toBe('blocked');
    expect(resNoConfirm.results[0].reasons?.[0]).toContain('ERR_REACTIVATION_NOT_CONFIRMED');

    // b) Usuario sin permiso de gobernanza (clerk) → bloqueada con motivo:
    const resClerk = await resolve(clerkToken, storeA, [row(S, 'Producto Archivado Global')], [S]);
    expect(resClerk.results[0].action).toBe('blocked');
    expect(resClerk.results[0].reasons?.[0]).toContain('ERR_UNAUTHORIZED_REACTIVATE');

    // c) Confirmada + gobernador (admin = owner) → reactivación global + activación local:
    const res = await resolve(adminToken, storeA, [row(S, 'Producto Archivado Global')], [S]);
    expect(res.summary.masters_reactivated).toBe(1);
    expect(res.results[0].product_id).toBeTruthy();

    const master = await sb.select<{ status: string }>('master_products', `id=eq.${seed.master_product_id}&select=status`);
    expect(master[0].status).toBe('active');
    // Trazabilidad de la reactivación global:
    const audit = await sb.select('audit_logs', `user_id=eq.${adminId}&action=eq.REACTIVATE_MASTER_PRODUCT&record_id=eq.${seed.master_product_id}&select=id,metadata`);
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit[0])).toContain('"scope":"global"');
  });

  // ═══ 5. Producto verdaderamente nuevo: maestro PRIMERO, luego la tienda ═══
  test('05 — nuevo: se crea primero en el Catálogo Maestro y luego se activa en la tienda', async () => {
    const S = sku('E05');
    const c = await classify(adminToken, storeA, [row(S, 'Producto Verdaderamente Nuevo', 10, 5, 30)]);
    expect(c.rows[0].status).toBe('new_master');
    expect(c.rows[0].can_create_master).toBe(true);
    expect(c.summary.new_master).toBe(1);
    expect(c.summary.new_master_blocked).toBe(0);

    const res = await resolve(adminToken, storeA, [row(S, 'Producto Verdaderamente Nuevo', 10, 5, 30)]);
    expect(res.summary.masters_created).toBe(1);
    expect(res.summary.locals_created).toBe(1);
    const masterId = res.results[0].master_product_id as unknown as string;
    expect(masterId).toBeTruthy();

    // El maestro nació con SOLO identidad (sin datos comerciales):
    const master = await sb.select<{ sku: string; name: string; unit_of_measure: string }>(
      'master_products', `id=eq.${masterId}&select=sku,name,unit_of_measure`);
    expect(master[0].sku).toBe(S);
    expect(master[0].name).toBe('Producto Verdaderamente Nuevo');
    // La fila local quedó VINCULADA con los datos comerciales propios:
    const prods = await sb.select<{ master_product_id: string; price: number; cost_price: number }>(
      'products', `store_id=eq.${storeA}&sku=eq.${S}&select=master_product_id,price,cost_price`);
    expect(prods.length).toBe(1);
    expect(prods[0].master_product_id).toBe(masterId);
    expect(Number(prods[0].price)).toBe(30);
    expect(Number(prods[0].cost_price)).toBe(5);
    // Trazabilidad de origen (importación de recepción):
    const audit = await sb.select('audit_logs', `user_id=eq.${adminId}&action=eq.RECEPTION_IMPORT_MASTER_CREATED&record_id=eq.${masterId}&select=id,metadata`);
    expect(audit.length).toBe(1);
    expect(JSON.stringify(audit[0])).toContain('reception_import');
  });

  // ═══ 6. SKU duplicado en el archivo: bloqueado por ambigüedad ═══
  test('06 — SKU duplicado en archivo: error, sin selección arbitraria', async () => {
    const S = sku('E06');
    const c = await classify(adminToken, storeA, [
      row(S, 'Primera Fila Duplicada'),
      row(S, 'Segunda Fila Duplicada'),
    ]);
    expect(c.rows[0].status).not.toBe('error');
    expect(c.rows[1].status).toBe('error');
    expect(c.rows[1].reasons.join(' ')).toContain('ERR_SKU_DUPLICATE_FILE');
    expect(c.summary.error).toBe(1);
    // El bloqueo es real en el escritor:
    const res = await resolve(adminToken, storeA, [
      row(S, 'Primera Fila Duplicada'),
      row(S, 'Segunda Fila Duplicada'),
    ]);
    const blocked = res.results.find(r => r.action === 'blocked');
    expect(blocked).toBeTruthy();
    expect(blocked!.reasons?.[0]).toContain('ERR_SKU_DUPLICATE_FILE');
  });

  // ═══ 7. Código de barras contradictorio / ajeno: bloqueado ═══
  test('07 — barcode contradictorio y barcode ajeno: revisión', async () => {
    // Maestro existente con barcode B1:
    const S7 = sku('E07');
    const seed7 = await seedMasterAndLocal(storeB, S7, 'Producto Con Barcode');
    await sb.update('master_products', `id=eq.${seed7.master_product_id}`, { barcode: `${SFX}-B1`, barcode_type: 'EAN13' });

    // (a) mismo SKU con barcode DISTINTO → contradictorio:
    const cA = await classify(adminToken, storeA, [{ ...row(S7, 'Producto Con Barcode'), barcode: `${SFX}-B2` }]);
    expect(cA.rows[0].status).toBe('review');
    expect(cA.rows[0].reasons.join(' ')).toContain('ERR_BARCODE_CONTRADICTS');

    // (b) SKU nuevo con barcode que pertenece a OTRO maestro:
    const cB = await classify(adminToken, storeA, [{ ...row(sku('E07X'), 'Otro Producto'), barcode: `${SFX}-B1` }]);
    expect(cB.rows[0].status).toBe('review');
    expect(cB.rows[0].reasons.join(' ')).toContain('ERR_BARCODE_EXISTS');

    // El escritor NO crea nada para estas filas:
    const res = await resolve(adminToken, storeA, [
      { ...row(S7, 'Producto Con Barcode'), barcode: `${SFX}-B2` },
      { ...row(sku('E07X'), 'Otro Producto'), barcode: `${SFX}-B1` },
    ]);
    expect(res.summary.blocked).toBe(2);
    expect(res.summary.masters_created).toBe(0);
  });

  // ═══ 8. Datos obligatorios incompletos: no se crea ═══
  test('08 — datos incompletos: fila inválida, no se crea nada', async () => {
    const c = await classify(adminToken, storeA, [
      { ...row(sku('E08A'), ''), name: '' },              // sin nombre
      { sku: '', name: 'Sin SKU en conectada', quantity: 1, unit_cost: 5 }, // sin SKU
      { ...row(sku('E08C'), 'Cantidad cero'), quantity: 0 },   // cantidad inválida
      { ...row(sku('E08D'), 'Costo cero'), unit_cost: 0 },     // costo inválido (B4)
    ]);
    for (const r of c.rows) {
      expect(r.status).toBe('error');
      expect(r.reasons.length).toBeGreaterThan(0);
    }
    expect(c.summary.error).toBe(4);
    expect(c.summary.valid_lines).toBe(0);

    const res = await resolve(adminToken, storeA, [
      { ...row(sku('E08A'), ''), name: '' },
      { ...row(sku('E08C'), 'Cantidad cero'), quantity: 0 },
    ]);
    expect(res.summary.blocked).toBe(2);
    expect(res.summary.masters_created).toBe(0);
    expect(res.summary.locals_created).toBe(0);
  });

  // ═══ 9. Reimportación del mismo Excel: cero duplicados ═══
  test('09 — reimportación: sin maestros, asociaciones ni recepciones duplicadas', async () => {
    const S = sku('E09');
    const rows = [row(S, 'Producto Reimportable', 10, 5, 20)];

    // Primera pasada: crea maestro + local + recepción.
    const res1 = await resolve(adminToken, storeA, rows);
    expect(res1.summary.masters_created).toBe(1);
    const pid = res1.results[0].product_id!;
    const rec1 = await registerReception(await encTokenFor(storeA), storeA, [{
      product_id: pid, sku: S, quantity: 10, unit_cost: 5, unit_of_measure: 'unidad',
      moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
    }], `${NS}-F9`);
    expect(rec1.ok).toBeTruthy();

    // SEGUNDA pasada (reimport del mismo Excel): todo identificado, cero escrituras.
    const c2 = await classify(adminToken, storeA, rows);
    expect(c2.rows[0].status).toBe('identified');
    expect(c2.summary.new_master).toBe(0);
    const res2 = await resolve(adminToken, storeA, rows);
    expect(res2.summary.masters_created).toBe(0);
    expect(res2.summary.locals_created).toBe(0);
    expect(res2.summary.locals_activated).toBe(0);
    expect(res2.summary.identified).toBe(1);

    // BD sin duplicados:
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(1);
    const prods = await sb.select('products', `store_id=eq.${storeA}&sku=eq.${S}&select=id`);
    expect(prods.length).toBe(1);

    // La MISMA factura no puede registrarse dos veces (recepciones sin duplicado):
    const recDup = await registerReception(await encTokenFor(storeA), storeA, [{
      product_id: pid, sku: S, quantity: 10, unit_cost: 5, unit_of_measure: 'unidad',
      moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
    }], `${NS}-F9`);
    expect(recDup.ok).toBeFalsy();
    expect(recDup.error).toContain('ERR_INVOICE_DUPLICATE');

    // Y una segunda recepción con factura distinta NO duplica productos:
    const rec2 = await registerReception(await encTokenFor(storeA), storeA, [{
      product_id: pid, sku: S, quantity: 10, unit_cost: 5, unit_of_measure: 'unidad',
      moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
    }], `${NS}-F9B`);
    expect(rec2.ok).toBeTruthy();
    const prodsAfter = await sb.select('products', `store_id=eq.${storeA}&sku=eq.${S}&select=id`);
    expect(prodsAfter.length).toBe(1);
  });

  // ═══ 10. Dos tiendas conectadas importan simultáneamente el mismo nuevo ═══
  test('10 — importación concurrente del mismo SKU nuevo: UN solo maestro', async () => {
    const S = sku('E10');
    const rowsA = [row(S, 'Producto Concurrente', 10, 5, 15)];
    const rowsB = [row(S, 'Producto Concurrente', 10, 6, 16)];

    // Ambas tiendas resuelven el mismo SKU nuevo en paralelo:
    const [resA, resB] = await Promise.all([
      resolve(adminToken, storeA, rowsA),
      resolve(adminToken, storeB, rowsB),
    ]);

    // Exactamente UN maestro para el SKU en la organización:
    const masters = await sb.select<{ id: string }>('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(1);

    // Cada tienda tiene SU fila local vinculada al mismo maestro:
    const pa = await sb.select<{ master_product_id: string; price: number }>('products', `store_id=eq.${storeA}&sku=eq.${S}&select=master_product_id,price`);
    const pb = await sb.select<{ master_product_id: string; price: number }>('products', `store_id=eq.${storeB}&sku=eq.${S}&select=master_product_id,price`);
    expect(pa.length).toBe(1);
    expect(pb.length).toBe(1);
    expect(pa[0].master_product_id).toBe(masters[0].id);
    expect(pb[0].master_product_id).toBe(masters[0].id);
    // (precios propios por tienda — ver escenario 11)
    void resA; void resB;
  });

  // ═══ 11. Dos tiendas, mismo maestro: costos y precios propios ═══
  test('11 — mismo maestro en dos tiendas: costos/precios/existencias independientes', async () => {
    const S = sku('E11');
    const resA = await resolve(adminToken, storeA, [row(S, 'Compartido Multitienda', 10, 5, 50)]);
    const resB = await resolve(adminToken, storeB, [row(S, 'Compartido Multitienda', 10, 8, 80)]);
    const pidA = resA.results[0].product_id!;
    const pidB = resB.results[0].product_id!;

    // Recepciones con costos distintos por tienda:
    const rA = await registerReception(await encTokenFor(storeA), storeA, [{ product_id: pidA, sku: S, quantity: 4, unit_cost: 5, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }], `${NS}-F11A`);
    const rB = await registerReception(await encTokenFor(storeB), storeB, [{ product_id: pidB, sku: S, quantity: 2, unit_cost: 8, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }], `${NS}-F11B`);
    expect(rA.ok && rB.ok).toBeTruthy();

    const [pa] = await sb.select<{ price: number; cost_average: number; stock_current: number; master_product_id: string }>(
      'products', `id=eq.${pidA}&select=price,cost_average,stock_current,master_product_id`);
    const [pb] = await sb.select<{ price: number; cost_average: number; stock_current: number; master_product_id: string }>(
      'products', `id=eq.${pidB}&select=price,cost_average,stock_current,master_product_id`);

    // Mismo maestro, datos comerciales INDEPENDIENTES:
    expect(pa.master_product_id).toBe(pb.master_product_id);
    expect(Number(pa.price)).toBe(50);
    expect(Number(pb.price)).toBe(80);
    expect(Number(pa.cost_average)).toBe(5); // WAC propio de A (primera recepción real)
    expect(Number(pb.cost_average)).toBe(8); // WAC propio de B
    expect(Number(pa.stock_current)).toBe(4);
    expect(Number(pb.stock_current)).toBe(2);
  });

  // ═══ 12. Primera recepción sobre WAC nominal: cálculo real exacto ═══
  test('12 — primera recepción sustituye el nominal 1 CUP por el costo real exacto', async () => {
    const S = sku('E12');
    const res = await resolve(adminToken, storeA, [row(S, 'Producto WAC Primera', 10, 1, 0)]);
    const pid = res.results[0].product_id!;

    // Estado inicial: nominal 1 CUP (política del propietario).
    const [before] = await sb.select<{ cost_average: number }>('products', `id=eq.${pid}&select=cost_average`);
    expect(Number(before.cost_average)).toBe(1);

    // Primera recepción REAL: 10 × 4.50 CUP → WAC exacto 4.50 (el nominal NO contamina).
    const rec = await registerReception(await encTokenFor(storeA), storeA, [{ product_id: pid, sku: S, quantity: 10, unit_cost: 4.5, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }], `${NS}-F12`);
    expect(rec.ok).toBeTruthy();

    const [after] = await sb.select<{ cost_average: number; stock_current: number }>('products', `id=eq.${pid}&select=cost_average,stock_current`);
    expect(Number(after.cost_average)).toBe(4.5);
    expect(Number(after.stock_current)).toBe(10);
  });

  // ═══ 13. Segunda recepción: ponderación WAC correcta ═══
  test('13 — segunda recepción: ponderación WAC correcta', async () => {
    const S = sku('E13');
    const res = await resolve(adminToken, storeA, [row(S, 'Producto WAC Segunda', 10, 1, 0)]);
    const pid = res.results[0].product_id!;

    await registerReception(await encTokenFor(storeA), storeA, [{ product_id: pid, sku: S, quantity: 10, unit_cost: 5, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }], `${NS}-F13A`);
    await registerReception(await encTokenFor(storeA), storeA, [{ product_id: pid, sku: S, quantity: 10, unit_cost: 10, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }], `${NS}-F13B`);

    // WAC = (10×5 + 10×10) / 20 = 7.5
    const [p] = await sb.select<{ cost_average: number; stock_current: number }>('products', `id=eq.${pid}&select=cost_average,stock_current`);
    expect(Number(p.cost_average)).toBe(7.5);
    expect(Number(p.stock_current)).toBe(20);
  });

  // ═══ 14. Producto histórico vinculado: reconocimiento y conservación de datos ═══
  test('14 — histórico vinculado: se reconoce y conserva sus datos económicos', async () => {
    const S = sku('E14');
    const seed = await seedMasterAndLocal(storeA, S, 'Historico Vinculado');
    // Dato económico preexistente de la tienda (sin tocar cost_average: el
    // guard WAC solo permite fn_recalc_wac como escritor; el stock se siembra
    // por la vía canónica —una recepción previa— porque stock_current se
    // deriva de los movimientos).
    await sb.update('products', `id=eq.${seed.product_id}`, { price: 123.45, cost_price: 100 });
    const recSeed = await registerReception(await encTokenFor(storeA), storeA, [{ product_id: seed.product_id, sku: S, quantity: 5, unit_cost: 4, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }], `${NS}-F14SEED`);
    expect(recSeed.ok).toBeTruthy();

    const c = await classify(adminToken, storeA, [row(S, 'Historico Vinculado', 2, 7, 123.45)]);
    expect(c.rows[0].status).toBe('identified');
    expect(c.rows[0].product_id).toBe(seed.product_id);

    const res = await resolve(adminToken, storeA, [row(S, 'Historico Vinculado', 2, 7, 123.45)]);
    expect(res.summary.locals_created).toBe(0);
    expect(res.summary.locals_activated).toBe(0);

    const rec = await registerReception(await encTokenFor(storeA), storeA, [{ product_id: seed.product_id, sku: S, quantity: 2, unit_cost: 7, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }], `${NS}-F14`);
    expect(rec.ok).toBeTruthy();

    // Precio de venta INTACTO (no se contamina con el costo de recepción):
    const [p] = await sb.select<{ price: number; stock_current: number; master_product_id: string }>('products', `id=eq.${seed.product_id}&select=price,stock_current,master_product_id`);
    expect(Number(p.price)).toBe(123.45);
    expect(Number(p.stock_current)).toBe(7);
    expect(p.master_product_id).toBe(seed.master_product_id);
    // Identidad del maestro intacta:
    const [m] = await sb.select<{ sku: string; name: string }>('master_products', `id=eq.${seed.master_product_id}&select=sku,name`);
    expect(m.sku).toBe(S);
    expect(m.name).toBe('Historico Vinculado');
  });

  // ═══ 15. Producto local huérfano: identificación y bloqueo de duplicación ═══
  test('15 — huérfano local: se identifica, NO se duplica, NO se auto-vincula', async () => {
    // H15 (activo) y H15B (inactivo) se sembraron en storeD ANTES de conectar.
    const cAct = await classify(adminToken, storeD, [row(sku('H15'), 'Historico Activo sin maestro')]);
    const rAct = cAct.rows[0];
    expect(rAct.status).toBe('identified');            // usa la fila existente
    expect(rAct.orphan_local).toBe(true);              // bandera de auditoría
    expect(rAct.product_id).toBeTruthy();
    expect(rAct.reasons.join(' ')).toContain('INFO_ORPHAN_LOCAL');

    // El escritor NO crea maestro ni fila nueva (bloqueo de duplicación):
    const res = await resolve(adminToken, storeD, [row(sku('H15'), 'Historico Activo sin maestro')]);
    expect(res.summary.masters_created).toBe(0);
    expect(res.summary.locals_created).toBe(0);
    const prods = await sb.select('products', `store_id=eq.${storeD}&sku=eq.${sku('H15')}&select=id`);
    expect(prods.length).toBe(1);
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${sku('H15')}&select=id`);
    expect(masters.length).toBe(0); // sin auto-vínculo (§7: revisión explícita)

    // Huérfano INACTIVO → revisión (activarlo violaría la regla estructural):
    const cInact = await classify(adminToken, storeD, [row(sku('H15B'), 'Historico Inactivo sin maestro')]);
    expect(cInact.rows[0].status).toBe('review');
    expect(cInact.rows[0].reasons.join(' ')).toContain('ERR_INACTIVE_ORPHAN_LOCAL');

    // register_reception con new_product del SKU huérfano → bloqueado (sin duplicado):
    const rec = await registerReception(await encTokenFor(storeD), storeD, [{
      product_id: null, sku: sku('H15'), quantity: 1, unit_cost: 1, unit_of_measure: 'unidad',
      moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
      new_product: { sku: sku('H15'), name: 'Historico Activo sin maestro', cost_price: 1, price: 0, unit_of_measure: 'unidad', is_complete: false },
    }], `${NS}-F15`);
    expect(rec.ok).toBeFalsy();
    expect(rec.error).toContain('ERR_SKU_EXISTS');
  });

  // ═══ 16. Alta local directa en tienda conectada: DENEGADA (regla estructural) ═══
  test('16 — INSERT directo sin maestro en tienda conectada: denegado por el guard', async () => {
    // (a) INSERT del navegador (RLS real del clerk) → trigger fail-closed:
    const ins = await restInsertAsUser(clerkToken, 'products', [{
      store_id: storeA, tenant_id: tenantId, sku: sku('E16'),
      name: 'Alta Directa Ilegal', is_active: true, is_complete: true,
      stock_current: 0, cost_price: 1, price: 1, cost_average: 1, min_stock: 1,
    }]);
    expect(ins.ok).toBeFalsy();
    expect(ins.text).toContain('ERR_ORPHAN_PRODUCT_IN_CONNECTED_STORE');

    // (b) service-role tampoco puede (el guard es de BD, no de RLS):
    const insSr = await restInsertAsUser(process.env.SUPABASE_SERVICE_ROLE_KEY || '', 'products', [{
      store_id: storeA, tenant_id: tenantId, sku: sku('E16B'),
      name: 'Alta Directa Ilegal SR', is_active: true, is_complete: true,
      stock_current: 0, cost_price: 1, price: 1, cost_average: 1, min_stock: 1,
    }]);
    expect(insSr.ok).toBeFalsy();
    expect(insSr.text).toContain('ERR_ORPHAN_PRODUCT_IN_CONNECTED_STORE');

    // (c) UPDATE que ACTIVA un huérfano inactivo en tienda conectada → bloqueado:
    const errUp = await patchProductsExpectError(
      `store_id=eq.${storeD}&sku=eq.${sku('H15B')}`,
      { is_active: true },
    );
    expect(errUp).toContain('ERR_ORPHAN_PRODUCT_IN_CONNECTED_STORE');

    // (d) con maestro válido el INSERT directo SÍ pasa (flujo controlado):
    const seedRef = await seedMasterAndLocal(storeB, sku('E16REF'), 'Referencia Para Alta Directa');
    // eliminar la fila local de B para re-crearla con vínculo vía path directo:
    await sb.delete('products', `id=eq.${seedRef.product_id}`);
    const insOk = await restInsertAsUser(adminToken, 'products', [{
      store_id: storeB, tenant_id: tenantId, master_product_id: seedRef.master_product_id,
      sku: sku('E16REF'), name: 'Referencia Para Alta Directa', is_active: true, is_complete: true,
      stock_current: 0, cost_price: 1, price: 1, cost_average: 1, min_stock: 1,
    }]);
    expect(insOk.ok).toBeTruthy();
  });

  // ═══ 17. Tienda NO conectada: comportamiento histórico preservado ═══
  test('17 — tienda no conectada: alta local pura sin maestro (legacy)', async () => {
    const S = sku('E17');
    const c = await classify(adminToken, storeC, [row(S, 'Producto Local Historico')]);
    expect(c.catalog_connected).toBe(false);
    expect(c.rows[0].status).toBe('new_local');
    expect(c.summary.new_local).toBe(1);
    expect(c.summary.new_master).toBe(0);

    // resolve NO escribe en tienda no conectada (legacy: register_reception):
    const res = await resolve(adminToken, storeC, [row(S, 'Producto Local Historico')]);
    expect(res.summary.masters_created).toBe(0);
    expect(res.summary.locals_created).toBe(0);

    const rec = await registerReception(await encTokenFor(storeC), storeC, [{
      product_id: null, sku: S, quantity: 3, unit_cost: 2, unit_of_measure: 'unidad',
      moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
      new_product: { sku: S, name: 'Producto Local Historico', cost_price: 2, price: 4, unit_of_measure: 'unidad', is_complete: true },
    }], `${NS}-F17`);
    expect(rec.ok).toBeTruthy();

    // Fila local SIN maestro (comportamiento anterior intacto):
    const prods = await sb.select<{ master_product_id: string | null }>('products', `store_id=eq.${storeC}&sku=eq.${S}&select=master_product_id`);
    expect(prods.length).toBe(1);
    expect(prods[0].master_product_id).toBeNull();
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(0);

    // Identificación posterior por nombre (legacy) — sin conexión se mantiene:
    const c2 = await classify(adminToken, storeC, [{ ...row(S, 'Producto Local Historico') }]);
    expect(['identified', 'new_local']).toContain(c2.rows[0].status);
  });

  // ═══ 18. Usuario sin permisos: creación y reactivación denegadas ═══
  test('18 — clerk (sin rol): creación de maestro y reactivación denegadas', async () => {
    const S = sku('E18');
    // (a) previsualización: new_master BLOQUEADO con razón:
    const c = await classify(clerkToken, storeA, [row(S, 'Producto Sin Permiso')]);
    expect(c.rows[0].status).toBe('new_master');
    expect(c.rows[0].can_create_master).toBe(false);
    expect(c.rows[0].reasons.join(' ')).toContain('ERR_UNAUTHORIZED_MASTER_CREATE');
    expect(c.summary.new_master_blocked).toBe(1);

    // (b) escritor: bloqueada, sin escrituras:
    const res = await resolve(clerkToken, storeA, [row(S, 'Producto Sin Permiso')]);
    expect(res.results[0].action).toBe('blocked');
    expect(res.summary.masters_created).toBe(0);

    // (c) register_reception directo con new_product en conectada → denegado.
    // CP-BRA-R06: el clerk es rechazado ANTES por el gate de CREACIÓN
    // (migración 20261128120000): no llega al permiso de crear maestros. El
    // rechazo A5 del rol de maestro sigue demostrado en (a)/(b) vía
    // classify/resolve; «nada se creó» (d) es la invariante de este caso:
    const rec = await registerReception(clerkToken, storeA, [{
      product_id: null, sku: S, quantity: 1, unit_cost: 2, unit_of_measure: 'unidad',
      moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
      new_product: { sku: S, name: 'Producto Sin Permiso', cost_price: 2, price: 3, unit_of_measure: 'unidad', is_complete: true },
    }], `${NS}-F18`);
    expect(rec.ok).toBeFalsy();
    expect(rec.error).toContain('ERR_FORBIDDEN_ROLE');

    // (d) nada se creó:
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(0);
    const prods = await sb.select('products', `store_id=eq.${storeA}&sku=eq.${S}&select=id`);
    expect(prods.length).toBe(0);
  });

  // ═══ 19. Fallo durante el flujo: sin estados parciales inconsistentes ═══
  test('19 — fallo en el flujo: aislamiento por fila y atomicidad de la recepción', async () => {
    const S1 = sku('E19A');
    const S2 = sku('E19B');

    // (a) Aislamiento por fila en resolve: una fila con cast inválido NO aborta
    // el lote ni deja medios estados; la fila sana se procesa:
    const res = await resolve(adminToken, storeA, [
      row(S1, 'Fila Sana Del Lote'),
      { ...row(S2, 'Fila Rota'), quantity: 'abc' as unknown as number },
    ]);
    expect(res.summary.masters_created).toBe(1);           // la fila sana se creó
    expect(res.summary.blocked).toBe(1);                   // la rota quedó bloqueada
    const blocked = res.results.find(r => r.action === 'blocked');
    expect(blocked?.reasons?.[0]).toContain('ERR_ROW_PROCESSING');
    // El maestro de la fila rota NO existe (sin estado parcial):
    const m2 = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S2}&select=id`);
    expect(m2.length).toBe(0);

    // (b) Atomicidad de register_reception: si un item falla, NO queda NADA
    // (ni maestro, ni fila local, ni recepción):
    const S3 = sku('E19C');
    const rec = await registerReception(await encTokenFor(storeA), storeA, [
      { product_id: null, sku: S3, quantity: 1, unit_cost: 2, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
        new_product: { sku: S3, name: 'Producto Que Revertira', cost_price: 2, price: 3, unit_of_measure: 'unidad', is_complete: true } },
      { product_id: null, sku: S1, quantity: 1, unit_cost: 2, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0,
        new_product: { sku: S1, name: 'SKU Ya Existente', cost_price: 2, price: 3, unit_of_measure: 'unidad', is_complete: true } },
    ], `${NS}-F19`);
    expect(rec.ok).toBeFalsy(); // segundo item choca con ERR_SKU_EXISTS
    // El maestro del PRIMER item se revirtió con la transacción:
    const m3 = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S3}&select=id`);
    expect(m3.length).toBe(0);
    const p3 = await sb.select('products', `store_id=eq.${storeA}&sku=eq.${S3}&select=id`);
    expect(p3.length).toBe(0);
    const recs = await sb.select('receipts', `store_id=eq.${storeA}&reference_doc=eq.${`${NS}-F19`}&select=id`);
    expect(recs.length).toBe(0);
  });

  // ═══ 20. Trazabilidad y auditoría de las operaciones ═══
  test('20 — trazabilidad: master_change_log + audit_logs del importador', async () => {
    const S = sku('E20');
    const res = await resolve(adminToken, storeA, [row(S, 'Producto Trazable', 10, 5, 40)]);
    const masterId = res.results[0].master_product_id as unknown as string;
    const pid = res.results[0].product_id!;
    expect(masterId).toBeTruthy();

    // (a) master_change_log: creación de identidad con origen en la tienda:
    const mcl = await sb.select<{ field: string; new_value: string; origin_store_id: string; actor_id: string }>(
      'master_change_log', `master_product_id=eq.${masterId}&select=field,new_value,origin_store_id,actor_id`);
    const fields = mcl.map(e => e.field).sort();
    expect(fields).toEqual(['name', 'sku']);
    expect(mcl[0].origin_store_id).toBe(storeA);
    expect(mcl[0].actor_id).toBe(adminId);

    // (b) audit_logs: alta de maestro con origen de importación de recepción:
    const audits = await sb.select<{ action: string; metadata: Record<string, unknown> }>(
      'audit_logs', `user_id=eq.${adminId}&record_id=in.("${masterId}","${pid}")&select=action,metadata&order=created_at.asc`);
    const actions = audits.map(a => a.action);
    expect(actions).toContain('RECEPTION_IMPORT_MASTER_CREATED');
    expect(actions).toContain('RECEPTION_IMPORT_ACTIVATE_LOCAL');
    const created = audits.find(a => a.action === 'RECEPTION_IMPORT_MASTER_CREATED');
    expect(created?.metadata?.origin).toBe('reception_import');
    expect(created?.metadata?.sku).toBe(S);

    // (c) recepción posterior con contadores canónicos:
    const rec = await registerReception(await encTokenFor(storeA), storeA, [{ product_id: pid, sku: S, quantity: 5, unit_cost: 5, unit_of_measure: 'unidad', moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 }], `${NS}-F20`);
    expect(rec.ok).toBeTruthy();
    const regAudit = await sb.select<{ action: string; metadata: Record<string, unknown> }>(
      'audit_logs', `user_id=eq.${adminId}&action=eq.REGISTER_RECEPTION&record_id=eq.${rec.data}&select=action,metadata`);
    expect(regAudit.length).toBe(1);
    expect(regAudit[0].metadata.supplier).toBe('Proveedor E2E RMCI');
    expect(Number(regAudit[0].metadata.items_count)).toBe(1);
  });
});
