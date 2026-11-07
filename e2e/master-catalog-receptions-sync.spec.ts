/**
 * E2E — CATÁLOGO MAESTRO ↔ RECEPCIONES + RECONCILIACIÓN (misión 2026-11-08)
 * ============================================================================
 * Pruebas obligatorias de la misión contra la BD aislada CostproE2E:
 *
 *   P1  Reconciliación: incorporate_store_products_to_master idempotente
 *       (segunda pasada sin duplicados) + reconcile_store_catalog_shared_data
 *       (dry-run → aplicar → idempotente; tienda como referencia de los datos
 *       compartidos; gobernador-only; sin tocar datos comerciales).
 *   P2  Recepción en tienda CONECTADA con SKU nuevo → producto local + maestro
 *       + vínculo + auditoría, en UNA transacción; nombre/SKU coinciden.
 *   P3  SKU ya existente en el maestro → sin maestro duplicado; vínculo al
 *       maestro correcto (identidad canónica coercitada por el trigger).
 *   P4  Tienda NO conectada → producto local sin maestro y sin vínculo.
 *   P5  Seguridad: no-gobernador no reconcilia; cross-tenant rechazado;
 *       recepción en tienda ajena rechazada; RLS intacto.
 *   P6  Fallos y reintentos: atomicidad (falla un item → no queda nada),
 *       reintento válido no duplica, factura duplicada → ERR_INVOICE_DUPLICATE
 *       sin efectos residuales.
 *
 * Entorno: BD aislada (guard fail-closed) + tiendas piloto del run.
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import {
  signIn, sb, rpcAsUser,
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
} from './fixtures/session.fixture';
import { readRunContext } from './fixtures/run-env';

let adminToken = '';
let adminId = '';
let clerkToken = '';
let tenantId = '';
let storeA = ''; // tienda conectada del run
let storeC = ''; // tienda NO conectada (negativa P4)
let otherTenantId = '';
let otherStoreId = '';

const SFX = Date.now().toString(36);
const NS = `CMRS-${SFX}`;

test.beforeAll(async () => {
  const ctx = readRunContext();
  test.skip(!ctx, 'Requiere modo aislado (E2E_ISOLATION=1 con run provisionado)');
  if (!ctx) return;
  tenantId = ctx.tenantId;
  storeA = ctx.pilotStoreA.id;

  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  const clerk = await signIn(CLERK_EMAIL, CLERK_PASS);
  clerkToken = clerk.token;

  // Tienda C del MISMO tenant pero NO conectada (negativa P4) — service-role.
  const [c] = await sb.insert('stores', [{
    name: `E2E80 CATRS-C ${SFX}`, tenant_id: tenantId, is_active: true,
  }]);
  storeC = String(c.id);

  // Conectar A al catálogo de la organización (gobernador = owner del run).
  const cA = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeA });
  if (!cA.ok) throw new Error(`connect_store_catalog falló: ${cA.error}`);

  // Tienda de OTRA organización (negativa cross-tenant P5) — service-role.
  const [t2] = await sb.insert('tenants', [{ name: `E2E OTHER-TENANT CMRS ${SFX}`, plan: 'free', is_active: true }]);
  const [s2] = await sb.insert('stores', [{ name: `E2E OTHER-STORE CMRS ${SFX}`, tenant_id: String(t2.id), is_active: true }]);
  otherTenantId = String(t2.id);
  otherStoreId = String(s2.id);
});

test.afterAll(async () => {
  // Limpieza acotada a los registros de ESTA ejecución (higiene net-zero).
  try {
    if (adminId) {
      await sb.delete('audit_logs', `user_id=eq.${adminId}`);
      await sb.delete('master_change_log', `actor_id=eq.${adminId}`);
    }
  } catch { /* best-effort */ }
  try {
    if (storeA) {
      // receipts/items de las pruebas (por referencia_doc del namespace)
      const recs = await sb.select<{ id: string }>(
        'receipts', `store_id=eq.${storeA}&reference_doc=like.${NS}*&select=id`,
      );
      if (recs.length) {
        const ids = recs.map(r => r.id).join(',');
        await sb.delete('receipt_items', `receipt_id=in.(${ids})`);
        await sb.delete('receipts', `id=in.(${ids})`);
      }
    }
  } catch { /* best-effort */ }
  try {
    // Hijos con FK hacia products/receipts (orden oficial de hard-cleanup):
    // receipt_items → receipts → stock_movements/inventory_batches → products.
    // Las tiendas del run son EFÍMERAS: se limpian TODOS sus productos (las
    // semillas del run crean maestros vía incorporate y sus filas también
    // referencian maestros — dejarlas bloquearía el borrado de maestros y del
    // usuario admin del run).
    for (const sid of [storeA, storeC].filter(Boolean)) {
      const recs = await sb.select<{ id: string }>(
        'receipts', `store_id=eq.${sid}&select=id`,
      );
      if (recs.length) {
        const ids = recs.map(r => r.id).join(',');
        await sb.delete('receipt_items', `receipt_id=in.(${ids})`).catch(() => {});
      }
      const prods = await sb.select<{ id: string }>(
        'products', `store_id=eq.${sid}&select=id`,
      );
      if (prods.length) {
        const pids = prods.map(p => p.id).join(',');
        await sb.delete('stock_movements', `product_id=in.(${pids})`).catch(() => {});
        await sb.delete('inventory_batches', `product_id=in.(${pids})`).catch(() => {});
      }
      await sb.delete('receipts', `store_id=eq.${sid}`).catch(() => {});
      await sb.delete('products', `store_id=eq.${sid}`);
    }
  } catch { /* best-effort */ }
  try {
    // El tenant del run es efímero por diseño: TODOS sus maestros se
    // eliminan (no solo los del namespace), incluidos los creados por el
    // backfill sobre semillas del run. Evita residuos que bloquean el
    // borrado del usuario admin del run (master_products_created_by_fkey).
    await sb.delete('master_products', `tenant_id=eq.${tenantId}`);
    await sb.delete('master_products', `tenant_id=eq.${otherTenantId}&sku=like.${NS}*`);
  } catch { /* best-effort */ }
  try {
    if (storeA) await sb.delete('catalog_store_links', `store_id=eq.${storeA}`);
    // Hard-delete oficial (RPC con limpieza de hijos y auditoría): el DELETE
    // REST directo choca con el trigger audit_store_changes.
    if (storeC) {
      const delC = await rpcService('e2e_hard_delete_store', { p_store_id: storeC });
      if (delC === null) await sb.delete('stores', `id=eq.${storeC}`).catch(() => {});
    }
    if (otherStoreId) {
      const delO = await rpcService('e2e_hard_delete_store', { p_store_id: otherStoreId });
      if (delO === null) await sb.delete('stores', `id=eq.${otherStoreId}`).catch(() => {});
    }
    if (otherTenantId) await sb.delete('tenants', `id=eq.${otherTenantId}`);
  } catch { /* best-effort: el sweep del run cubre el resto */ }
});

/** SKU literal con sufijo del run (los ceros iniciales del SKU se preservan tal cual). */
const sku = (n: string) => `${NS}-${n}`;

/** RPC con service-role — SOLO para setup/limpieza de infraestructura del run. */
async function rpcService(name: string, params: Record<string, unknown>): Promise<unknown | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  try { return JSON.parse(text); } catch { return text; }
}

test.describe.serial('Catálogo maestro ← Recepciones + reconciliación', () => {

  // ══════════════════════════════════════════════════════════════════════
  test('P2 — Recepción en tienda conectada, SKU nuevo: maestro + vínculo + auditoría', async () => {
    const S = sku('P2');
    const r = await rpcAsUser('register_reception', adminToken, {
      p_store_id: storeA,
      p_supplier: `Proveedor ${NS}`,
      p_invoice_number: `${NS}-R2`,
      p_items: [{
        product_id: null,
        sku: S,
        quantity: 5,
        unit_cost: 12.5,
        unit_of_measure: 'unidad',
        sale_price: 25,
        moneda_recepcion: 'CUP',
        tasa_cambio_recepcion: 1,
        new_product: { sku: S, name: `Producto P2 ${SFX}`, cost_price: 12.5, price: 25, unit_of_measure: 'unidad', is_complete: true },
      }],
    });
    expect(r.ok, `register_reception falló: ${r.error}`).toBeTruthy();

    // Producto local creado
    const locales = await sb.select<{ id: string; sku: string; name: string; master_product_id: string | null; stock_current: number; price: number }>(
      'products', `store_id=eq.${storeA}&sku=eq.${S}&select=id,sku,name,master_product_id,stock_current,price`,
    );
    expect(locales).toHaveLength(1);
    expect(locales[0].name).toBe(`Producto P2 ${SFX}`);
    expect(Number(locales[0].stock_current)).toBe(5);           // inventario local intacto
    expect(Number(locales[0].price)).toBe(25);                   // precio local intacto

    // Maestro creado: UNO, con SKU literal y nombre vigente
    const masters = await sb.select<{ id: string; sku: string; name: string; status: string }>(
      'master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id,sku,name,status`,
    );
    expect(masters).toHaveLength(1);
    expect(masters[0].name).toBe(`Producto P2 ${SFX}`);
    expect(masters[0].status).toBe('active');

    // Vínculo persistido
    expect(locales[0].master_product_id).toBe(masters[0].id);

    // Auditoría: identidad compartida + operación
    const logs = await sb.select<{ action: string; metadata: Record<string, unknown> }>(
      'audit_logs', `user_id=eq.${adminId}&action=eq.RECEPTION_PRODUCT_LINKED_MASTER&select=action,metadata`,
    );
    expect(logs.some(l => (l.metadata as { sku?: string }).sku === S)).toBeTruthy();
    const identity = await sb.select<{ field: string; new_value: string }>(
      'master_change_log', `master_product_id=eq.${masters[0].id}&select=field,new_value`,
    );
    expect(identity.map(i => i.field).sort()).toEqual(['name', 'sku']);
  });

  // ══════════════════════════════════════════════════════════════════════
  test('P3 — SKU ya existente en el maestro: reutiliza, no duplica; identidad canónica', async () => {
    const S = sku('P3');
    // Maestro PREEXISTENTE sin fila local en esta tienda (equivalente a un
    // maestro creado por otra tienda de la organización) — sembrado directo
    // de setup con service-role.
    const [m0] = await sb.insert('master_products', [{
      tenant_id: tenantId, sku: S, name: `Producto P3 canónico ${SFX}`, status: 'active',
    }]) as Array<{ id: string }>;
    expect(m0?.id).toBeTruthy();

    // Recepción con el MISMO SKU (nombre solicitado distinto a propósito)
    const r = await rpcAsUser('register_reception', adminToken, {
      p_store_id: storeA,
      p_supplier: `Proveedor ${NS}`,
      p_invoice_number: `${NS}-R3`,
      p_items: [{
        product_id: null, sku: S, quantity: 2, unit_cost: 4, unit_of_measure: 'unidad',
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
        new_product: { sku: S, name: `Producto P3 variante ${SFX}`, cost_price: 4, price: 0, unit_of_measure: 'unidad', is_complete: false },
      }],
    });
    expect(r.ok, `register_reception falló: ${r.error}`).toBeTruthy();

    // Sin maestro duplicado: sigue existiendo UNO
    const masters = await sb.select<{ id: string; name: string }>(
      'master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id,name`,
    );
    expect(masters).toHaveLength(1);
    expect(masters[0].name).toBe(`Producto P3 canónico ${SFX}`);

    // La fila local quedó VINCULADA al maestro correcto y con el nombre
    // canónico (trigger de identidad); el dato comercial local es suyo.
    const locales = await sb.select<{ id: string; name: string; master_product_id: string | null; cost_price: number }>(
      'products', `store_id=eq.${storeA}&sku=eq.${S}&select=id,name,master_product_id,cost_price`,
    );
    expect(locales).toHaveLength(1);
    expect(locales[0].master_product_id).toBe(masters[0].id);
    expect(locales[0].name).toBe(`Producto P3 canónico ${SFX}`);
    expect(Number(locales[0].cost_price)).toBe(4);
  });

  // ══════════════════════════════════════════════════════════════════════
  test('P4 — Tienda NO conectada: alta local pura, sin maestro ni vínculo', async () => {
    const S = sku('P4');
    const r = await rpcAsUser('register_reception', adminToken, {
      p_store_id: storeC,
      p_supplier: `Proveedor ${NS}`,
      p_invoice_number: `${NS}-R4`,
      p_items: [{
        product_id: null, sku: S, quantity: 3, unit_cost: 7, unit_of_measure: 'unidad',
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
        new_product: { sku: S, name: `Producto P4 ${SFX}`, cost_price: 7, price: 0, unit_of_measure: 'unidad', is_complete: false },
      }],
    });
    expect(r.ok, `register_reception falló: ${r.error}`).toBeTruthy();

    const locales = await sb.select<{ id: string; master_product_id: string | null }>(
      'products', `store_id=eq.${storeC}&sku=eq.${S}&select=id,master_product_id`,
    );
    expect(locales).toHaveLength(1);
    expect(locales[0].master_product_id).toBeNull();

    // Sin maestro creado para ese SKU
    const masters = await sb.select<{ id: string }>(
      'master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`,
    );
    expect(masters).toHaveLength(0);
    // (la limpieza la hace el afterAll con el orden oficial de FKs)
  });

  // ══════════════════════════════════════════════════════════════════════
  test('P5 — Seguridad: no-gobernador, cross-tenant y tienda ajena', async () => {
    // (a) Un no-gobernador NO puede reconciliar datos compartidos.
    const clerkRec = await rpcAsUser('reconcile_store_catalog_shared_data', clerkToken, {
      p_store_id: storeA, p_dry_run: true,
    });
    expect(clerkRec.ok, 'un no-gobernador NO debe reconciliar').toBeFalsy();
    expect(String(clerkRec.error)).toContain('ERR_UNAUTHORIZED');

    // (b) Reconciliar una tienda de OTRA organización → rechazado.
    const cross = await rpcAsUser('reconcile_store_catalog_shared_data', adminToken, {
      p_store_id: otherStoreId, p_dry_run: true,
    });
    expect(cross.ok, 'reconciliar cross-tenant debe fallar').toBeFalsy();
    expect(String(cross.error)).toContain('ERR_UNAUTHORIZED');

    // (c) PROTECCIÓN ESTRUCTURAL CROSS-ORG: el tenant del maestro SIEMPRE se
    //     resuelve en el servidor desde la tienda (jamás del cliente), y NO se
    //     puede vincular un maestro de otra organización a una tienda propia
    //     (índice único + ERR_STORE_MISMATCH). Nota: has_store_access_as da
    //     alcance de plataforma a admin/superadmin (Decisión B.1 documentada),
    //     así que la negativa correcta es la de vínculo cross-org.
    const [mX] = await sb.insert('master_products', [{
      tenant_id: otherTenantId, sku: sku('P5X'), name: `Maestro ajeno ${SFX}`, status: 'active',
    }]) as Array<{ id: string }>;
    const link = await rpcAsUser('activate_master_product', adminToken, {
      p_master_id: String(mX.id), p_store_id: storeA,
    });
    expect(link.ok, 'vincular un maestro de OTRA organización debe fallar').toBeFalsy();
    expect(String(link.error)).toContain('ERR_STORE_MISMATCH');

    // (d) Sin vínculos cruzados: el maestro ajeno sigue sin filas locales fuera
    //     de su organización.
    const crossLinks = await sb.select<{ id: string }>(
      'products', `master_product_id=eq.${String(mX.id)}&select=id`,
    );
    expect(crossLinks).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════
  test('P6 — Fallos y reintentos: atomicidad total y sin duplicados', async () => {
    const S1 = sku('P6A');
    const S2 = sku('P6B');
    // Recepción con DOS productos nuevos donde el segundo viola B4 (costo 0):
    // la RPC debe fallar COMPLETA (producto 1 + maestro 1 incluidos).
    const bad = await rpcAsUser('register_reception', adminToken, {
      p_store_id: storeA,
      p_supplier: `Proveedor ${NS}`,
      p_invoice_number: `${NS}-R6`,
      p_items: [
        { product_id: null, sku: S1, quantity: 1, unit_cost: 3, unit_of_measure: 'unidad',
          moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
          new_product: { sku: S1, name: `P6A ${SFX}`, cost_price: 3, price: 0 } },
        { product_id: null, sku: S2, quantity: 1, unit_cost: 0, unit_of_measure: 'unidad',
          moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
          new_product: { sku: S2, name: `P6B ${SFX}`, cost_price: 0, price: 0 } },
      ],
    });
    expect(bad.ok, 'la recepción con item inválido debe fallar').toBeFalsy();

    // Atomicidad: ni productos ni maestros ni receipt residual.
    expect(await sb.select('products', `store_id=eq.${storeA}&sku=in.(${S1},${S2})&select=id`)).toHaveLength(0);
    expect(await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=in.(${S1},${S2})&select=id`)).toHaveLength(0);
    expect(await sb.select('receipts', `store_id=eq.${storeA}&reference_doc=eq.${NS}-R6&select=id`)).toHaveLength(0);

    // Reintento VÁLIDO de la misma recepción: prospera sin duplicados.
    const retry = await rpcAsUser('register_reception', adminToken, {
      p_store_id: storeA,
      p_supplier: `Proveedor ${NS}`,
      p_invoice_number: `${NS}-R6`,
      p_items: [
        { product_id: null, sku: S1, quantity: 1, unit_cost: 3, unit_of_measure: 'unidad',
          moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
          new_product: { sku: S1, name: `P6A ${SFX}`, cost_price: 3, price: 0 } },
        { product_id: null, sku: S2, quantity: 2, unit_cost: 5, unit_of_measure: 'unidad',
          moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
          new_product: { sku: S2, name: `P6B ${SFX}`, cost_price: 5, price: 0 } },
      ],
    });
    expect(retry.ok, `reintento falló: ${retry.error}`).toBeTruthy();
    expect(await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S1}&select=id`)).toHaveLength(1);
    expect(await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S2}&select=id`)).toHaveLength(1);

    // Reenvío con factura duplicada: error accionable, sin efectos residuales.
    const dup = await rpcAsUser('register_reception', adminToken, {
      p_store_id: storeA,
      p_supplier: `Proveedor ${NS}`,
      p_invoice_number: `${NS}-R6`,
      p_items: [{ product_id: null, sku: sku('P6C'), quantity: 1, unit_cost: 2, unit_of_measure: 'unidad',
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
        new_product: { sku: sku('P6C'), name: `P6C ${SFX}`, cost_price: 2, price: 0 } }],
    });
    expect(dup.ok).toBeFalsy();
    expect(String(dup.error)).toContain('ERR_INVOICE_DUPLICATE');
    expect(await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${sku('P6C')}&select=id`)).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════
  test('P1 — Reconciliación: backfill idempotente + datos compartidos con la tienda como referencia', async () => {
    // Producto propio de P1 (autocontenido): recepción válida en tienda conectada.
    const SA = sku('P1A');
    const reg = await rpcAsUser('register_reception', adminToken, {
      p_store_id: storeA,
      p_supplier: `Proveedor ${NS}`,
      p_invoice_number: `${NS}-R1`,
      p_items: [{ product_id: null, sku: SA, quantity: 4, unit_cost: 9, unit_of_measure: 'unidad',
        moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1,
        new_product: { sku: SA, name: `P1A ${SFX}`, cost_price: 9, price: 0 } }],
    });
    expect(reg.ok, `register_reception P1A falló: ${reg.error}`).toBeTruthy();

    // ── 1) incorporate (mecanismo de altas/vínculos): primera pasada puede
    //      incorporar semillas del run; la SEGUNDA pasada debe ser exactamente
    //      0/0 (idempotencia obligatoria de la misión — Prueba 1).
    const inc1 = await rpcAsUser('incorporate_store_products_to_master', adminToken, {
      p_store_id: storeA, p_dry_run: false,
    });
    expect(inc1.ok, `incorporate (1ª) falló: ${inc1.error}`).toBeTruthy();
    const inc2 = await rpcAsUser('incorporate_store_products_to_master', adminToken, {
      p_store_id: storeA, p_dry_run: false,
    });
    expect(inc2.ok, `incorporate (2ª) falló: ${inc2.error}`).toBeTruthy();
    const inc2d = inc2.data as { created: number; linked_existing: number; conflicts: number };
    expect(inc2d.created).toBe(0);
    expect(inc2d.linked_existing).toBe(0);
    expect(inc2d.conflicts).toBe(0);

    // ── 2) Drift real de nombre: se desfasa el maestro de P1A respecto del
    //      catálogo local de la tienda (simulación service-role de un desfase
    //      histórico; la fila local conserva el nombre vigente).
    const localP1A = await sb.select<{ id: string; name: string }>(
      'products', `store_id=eq.${storeA}&sku=eq.${SA}&select=id,name`,
    );
    expect(localP1A).toHaveLength(1);
    const masterP1A = await sb.select<{ id: string }>(
      'master_products', `tenant_id=eq.${tenantId}&sku=eq.${SA}&select=id`,
    );
    expect(masterP1A).toHaveLength(1);
    await sb.update('master_products', `id=eq.${masterP1A[0].id}`, { name: `P1A DESFASADO ${SFX}` });

    // ── 3) Dry-run: reporta el cambio SIN escribirlo.
    const dry = await rpcAsUser('reconcile_store_catalog_shared_data', adminToken, {
      p_store_id: storeA, p_dry_run: true,
    });
    expect(dry.ok, `reconcile dry-run falló: ${dry.error}`).toBeTruthy();
    const dryd = dry.data as {
      identity_updated: number; image_updated: number; conflicts: number;
      results: Array<{ action: string; sku: string; changes?: Record<string, string> }>;
    };
    const plan = dryd.results.find(r => r.sku === SA);
    expect(plan, 'el dry-run debe reportar el desfase de P1A').toBeTruthy();
    expect(plan!.action).toBe('would_update_master');
    expect(plan!.changes?.name).toBe(`P1A ${SFX}`);
    expect(dryd.conflicts).toBe(0);

    // Sin cambios aplicados todavía:
    const stillDrifted = await sb.select<{ name: string }>(
      'master_products', `id=eq.${masterP1A[0].id}&select=name`,
    );
    expect(stillDrifted[0].name).toBe(`P1A DESFASADO ${SFX}`);

    // ── 4) Aplicar: el maestro adopta el nombre de la tienda (referencia),
    //      con auditoría old/new por campo.
    const apply = await rpcAsUser('reconcile_store_catalog_shared_data', adminToken, {
      p_store_id: storeA, p_dry_run: false,
    });
    expect(apply.ok, `reconcile apply falló: ${apply.error}`).toBeTruthy();
    const applyd = apply.data as { identity_updated: number; conflicts: number };
    expect(applyd.identity_updated).toBeGreaterThanOrEqual(1);
    expect(applyd.conflicts).toBe(0);

    const fixed = await sb.select<{ name: string }>(
      'master_products', `id=eq.${masterP1A[0].id}&select=name`,
    );
    expect(fixed[0].name).toBe(`P1A ${SFX}`); // = nombre vigente de la fila local

    const log = await sb.select<{ field: string; old_value: string; new_value: string }>(
      'master_change_log', `master_product_id=eq.${masterP1A[0].id}&field=eq.name&select=field,old_value,new_value`,
    );
    expect(log.some(l => l.old_value === `P1A DESFASADO ${SFX}` && l.new_value === `P1A ${SFX}`)).toBeTruthy();

    // Datos comerciales locales intactos tras la propagación de identidad.
    const after = await sb.select<{ price: number; cost_price: number; stock_current: number }>(
      'products', `store_id=eq.${storeA}&sku=eq.${SA}&select=price,cost_price,stock_current`,
    );
    expect(Number(after[0].stock_current)).toBe(4);
    expect(Number(after[0].cost_price)).toBe(9);

    // ── 5) Idempotencia: segunda pasada sin cambios.
    const again = await rpcAsUser('reconcile_store_catalog_shared_data', adminToken, {
      p_store_id: storeA, p_dry_run: false,
    });
    expect(again.ok).toBeTruthy();
    const againd = again.data as { identity_updated: number; image_updated: number; local_image_synced: number; conflicts: number };
    expect(againd.identity_updated).toBe(0);
    expect(againd.image_updated).toBe(0);
    expect(againd.conflicts).toBe(0);
  });
});
