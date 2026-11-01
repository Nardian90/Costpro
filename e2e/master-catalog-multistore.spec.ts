/**
 * E2E — CATÁLOGO MAESTRO MULTITIENDA — MISIÓN COSTPRO-CATALOG-MASTER-002
 * ============================================================================
 * Defecto corregido: get_paginated_products_v2 paginaba SOLO filas locales
 * (FROM products WHERE store_id = ...) — una tienda CONECTADA al catálogo
 * maestro sin filas locales (caso Ferricarril: 0 products vs 188 maestros)
 * veía 0 productos en Inventario → CATALOGO.
 *
 * Modelo demostrado: UN PRODUCTO MAESTRO, UNA IDENTIDAD GLOBAL, UNA FUENTE DE
 * IMAGEN Y MÚLTIPLES INVENTARIOS LOCALES INDEPENDIENTES.
 *
 * Casos (misión §9):
 *   E2E-1 Conexión (catalog_store_links + lectura RLS de maestros)
 *   E2E-2 Visibilidad completa (todos los maestros activos, paginado real)
 *   E2E-3 Solo-maestro: visibles sin stock/precio falso
 *   E2E-4 Incorporación idempotente (activate_master_product)
 *   E2E-5 Imágenes compartidas (mismo archivo; cambio propagado; sin copias)
 *   E2E-6 Atributos locales intactos tras cambio global
 *   E2E-7 Seguridad (tienda no conectada, no-gobernador, cross-tenant, payload)
 *   E2E-8 Regresión: altas locales puras siguen visibles al estar conectada
 *
 * Entorno: BD aislada CostproE2E (guard fail-closed) + tiendas piloto del run.
 * Pre-fix: E2E-2/E2E-3/E2E-8 FALLAN (la tienda conectada sin filas locales
 * veía 0). Post-fix: todos pasan.
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import {
  signIn, sb, rpcAsUser, SUPABASE_REST_URL,
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
} from './fixtures/session.fixture';
import { readRunContext } from './fixtures/run-env';

/** Headers de storage con service-role — SOLO seeding/verificación de imágenes. */
const storageHeaders = (): Record<string, string> => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
  'Content-Type': 'application/octet-stream',
  'x-upsert': 'true',
});

let adminToken = '';
let adminId = '';
let clerkToken = '';
let tenantId = '';
let storeA = ''; // tienda dueña del catálogo (conectada)
let storeB = ''; // tienda conectada consumidora (empieza SIN filas locales)
let storeC = ''; // tienda NO conectada (negativa de visibilidad)
let otherTenantMaster = ''; // maestro de OTRA organización (negativa cross-tenant)
let otherTenantId = '';     // tenant ajeno creado para las negativas
let otherStoreId = '';      // tienda ajena creada para las negativas

const SFX = Date.now().toString(36);
const MASTER_A = { sku: `CM2-A-${SFX}`, name: `Martillo E2E maestro ${SFX}`, image: `cm2-${SFX}-a.jpg` };
const MASTER_B = { sku: `CM2-B-${SFX}`, name: `Taladro E2E maestro ${SFX}`, image: `cm2-${SFX}-b.jpg` };
const MASTER_C = { sku: `CM2-C-${SFX}`, name: `Tornillo E2E maestro ${SFX}`, image: `cm2-${SFX}-c.jpg` };
const MASTER_D = { sku: `CM2-D-${SFX}`, name: `Lija E2E maestro ${SFX}`, image: `cm2-${SFX}-d.jpg` };
let ids: Record<string, string> = {}; // sku → master id

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

  // Tienda C del MISMO tenant pero NO conectada (negativa E2E-7a) — service-role.
  const [c] = await sb.insert('stores', [{
    name: `E2E80 CATMAESTRO-C ${SFX}`,
    tenant_id: tenantId,
    is_active: true,
  }]);
  storeC = String(c.id);

  // Conectar A y B al catálogo de la organización (gobernador = owner del run).
  const cA = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeA });
  const cB = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeB });
  if (!cA.ok || !cB.ok) throw new Error(`connect_store_catalog falló: ${cA.error} / ${cB.error}`);

  // Maestro de OTRA organización (negativa E2E-7c) — service-role.
  const [t2] = await sb.insert('tenants', [{ name: `E2E OTHER-TENANT CM2 ${SFX}`, plan: 'free', is_active: true }]);
  const [s2] = await sb.insert('stores', [{ name: `E2E OTHER-STORE CM2 ${SFX}`, tenant_id: String(t2.id), is_active: true }]);
  const [m2] = await sb.insert('master_products', [{
    tenant_id: String(t2.id), sku: `CM2-EXT-${SFX}`, name: `Maestro ajeno ${SFX}`, status: 'active',
  }]);
  otherTenantMaster = String(m2.id);
  otherTenantId = String(t2.id);
  otherStoreId = String(s2.id);

  // Imágenes maestras sembradas en el bucket product-images (service-role).
  for (const m of [MASTER_A, MASTER_B, MASTER_C, MASTER_D]) {
    const res = await fetch(`${SUPABASE_REST_URL}/storage/v1/object/product-images/${m.image}`, {
      method: 'POST',
      headers: storageHeaders(),
      body: Buffer.from(`PNG-${m.sku}-${SFX}-${'x'.repeat(64)}`),
    });
    if (!res.ok && res.status !== 409) throw new Error(`seed imagen ${m.image}: ${res.status} ${await res.text()}`);
  }

  // Maestros de la organización creados por el gobernador vía RPC real.
  for (const m of [MASTER_A, MASTER_B, MASTER_C, MASTER_D]) {
    const r = await rpcAsUser('create_master_product', adminToken, {
      p_store_id: storeA, p_sku: m.sku, p_name: m.name, p_image_path: m.image,
      p_unit_of_measure: 'unidad', p_is_service: false, p_local: {},
    });
    if (!r.ok) throw new Error(`create_master_product ${m.sku}: ${r.status} ${r.error}`);
    const json = r.data as { master_product_id?: string; id?: string };
    ids[m.sku] = json.master_product_id || json.id || '';
    expect(ids[m.sku], `master id para ${m.sku}`).toBeTruthy();
  }
});

test.afterAll(async () => {
  // Limpieza acotada a los registros de ESTA ejecución (higiene net-zero).
  // ORDEN: links → change-logs (actor) → masters → stores → tenant ajeno.
  // Siempre por ID capturado en el setup (los patrones con espacios rompen
  // la URL de PostgREST y dejan residuos que bloquean el teardown).
  try {
    if (storeA && storeB) await sb.delete('catalog_store_links', `store_id=in.(${storeA},${storeB})`);
    if (adminId) await sb.delete('catalog_store_links', `created_by=eq.${adminId}`);
  } catch { /* best-effort */ }
  try {
    if (adminId) {
      await sb.delete('master_change_log', `actor_id=eq.${adminId}`);
      await sb.delete('audit_logs', `user_id=eq.${adminId}`);
    }
  } catch { /* best-effort */ }
  try {
    const masterIds = [...Object.values(ids).filter(Boolean), otherTenantMaster].filter(Boolean);
    if (masterIds.length) await sb.delete('master_products', `id=in.(${masterIds.join(',')})`);
  } catch { /* best-effort */ }
  try {
    if (storeC) await sb.delete('stores', `id=eq.${storeC}`);
    if (otherStoreId) await sb.delete('stores', `id=eq.${otherStoreId}`);
    if (otherTenantId) await sb.delete('tenants', `id=eq.${otherTenantId}`);
  } catch { /* best-effort: el sweep del run cubre el resto */ }
});

/** Página del catálogo v2 vía RPC, como un usuario autenticado real. */
async function paginaCatalogo(token: string, storeId: string, offset = 0, limit = 200) {
  const r = await rpcAsUser('get_paginated_products_v2', token, {
    p_limit: limit, p_offset: offset, p_store_id: storeId,
    p_search_term: '', p_category: '', p_sort_key: 'name', p_sort_dir: 'asc',
    p_stock_filter: 'all', p_active_filter: 'all',
  });
  expect(r.ok, `RPC v2 falló: ${r.error}`).toBeTruthy();
  return (r.data ?? []) as Array<Record<string, any>>;
}

test.describe.serial('Catálogo maestro multitienda', () => {

  test('E2E-1 — Conexión: A y B conectadas; miembros leen los maestros (RLS)', async () => {
    const links = await sb.select<{ store_id: string; status: string }>(
      'catalog_store_links', `tenant_id=eq.${tenantId}&select=store_id,status`,
    );
    expect(links.find(l => l.store_id === storeA)?.status).toBe('connected');
    expect(links.find(l => l.store_id === storeB)?.status).toBe('connected');

    // RLS: un usuario miembro de una tienda conectada lee los maestros del tenant.
    const ver = await fetch(`${SUPABASE_REST_URL}/rest/v1/master_products?tenant_id=eq.${tenantId}&select=id,sku&status=eq.active`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', Authorization: `Bearer ${clerkToken}` },
    });
    expect(ver.ok).toBeTruthy();
    const filas = await ver.json();
    expect(filas.length).toBeGreaterThanOrEqual(4);
  });

  test('E2E-2 — Visibilidad completa: B ve TODOS los maestros activos (paginado real)', async () => {
    const maestros = await sb.select<{ id: string }>(
      'master_products', `tenant_id=eq.${tenantId}&status=eq.active&select=id`,
    );
    const esperados = new Set(maestros.map(m => m.id));

    // Recorrido paginado REAL (offset), no el total en pantalla.
    const vistos = new Set<string>();
    let offset = 0;
    for (let i = 0; i < 20; i++) {
      const pagina = await paginaCatalogo(adminToken, storeB, offset, 50);
      if (!pagina.length) break;
      for (const fila of pagina) vistos.add(String(fila.id));
      offset += pagina.length;
      if (vistos.size >= (pagina[0]?.total_count ?? 0)) break;
    }
    for (const id of esperados) {
      expect(vistos.has(id), `maestro ${id} invisible desde B (ausencia de fila local no debe ocultarlo)`).toBe(true);
    }
  });

  test('E2E-3 — Solo-maestro: visible sin stock/precio falso e is_complete honesto', async () => {
    const pagina = await paginaCatalogo(adminToken, storeB, 0, 500);
    const fila = pagina.find(r => String(r.master_product_id) === ids[MASTER_A.sku]);
    expect(fila, 'el maestro sin fila local debe aparecer').toBeTruthy();
    expect(fila.source).toBe('master');
    expect(Number(fila.stock_current)).toBe(0);
    expect(Number(fila.price)).toBe(0);
    expect(fila.is_complete).toBe(false);
    expect(fila.image_url).toBe(MASTER_A.image);
  });

  test('E2E-4 — Incorporación idempotente al inventario de B', async () => {
    const r1 = await rpcAsUser('activate_master_product', adminToken, {
      p_master_id: ids[MASTER_B.sku], p_store_id: storeB,
    });
    expect(r1.ok, `activate falló: ${r1.error}`).toBeTruthy();
    expect((r1.data as any).already_active).toBe(false);
    const productId = String((r1.data as any).product_id);

    const r2 = await rpcAsUser('activate_master_product', adminToken, {
      p_master_id: ids[MASTER_B.sku], p_store_id: storeB,
    });
    expect(r2.ok).toBeTruthy();
    expect((r2.data as any).already_active).toBe(true);
    expect(String((r2.data as any).product_id)).toBe(productId);

    // Sin duplicados: exactamente 1 fila local (maestro, tienda).
    const locales = await sb.select<{ id: string; image_url: string | null; price: number }>(
      'products', `master_product_id=eq.${ids[MASTER_B.sku]}&store_id=eq.${storeB}&select=id,image_url,price`,
    );
    expect(locales.length).toBe(1);
    // El maestro no se duplica: sigue existiendo UNO.
    const masters = await sb.select<{ id: string }>('master_products', `sku=eq.${MASTER_B.sku}&select=id`);
    expect(masters.length).toBe(1);
    // La fila local apunta al MISMO archivo del maestro (puntero, no copia).
    expect(locales[0].image_url).toBe(MASTER_B.image);
    // Sin precios de otras tiendas (misión §10): alta local en cero.
    expect(Number(locales[0].price)).toBe(0);

    // Configuración LOCAL de la fila recién incorporada.
    await sb.update('products', `id=eq.${productId}`, { price: 55.5, cost_price: 30.25, min_stock: 4 });
  });

  test('E2E-5 — Imágenes compartidas: mismo archivo y cambio propagado', async () => {
    // 1) Ambas tiendas ven la MISMA referencia de imagen del maestro C.
    const a1 = await paginaCatalogo(adminToken, storeA, 0, 500);
    const b1 = await paginaCatalogo(adminToken, storeB, 0, 500);
    const enA = a1.find(r => String(r.master_product_id) === ids[MASTER_C.sku]);
    const enB = b1.find(r => String(r.master_product_id) === ids[MASTER_C.sku]);
    expect(enA?.image_url).toBe(MASTER_C.image);
    expect(enB?.image_url).toBe(MASTER_C.image);

    // 2) Cambio de imagen GLOBAL por el gobernador (RPC gobernada real).
    const nueva = `cm2-${SFX}-c2.jpg`;
    const up = await fetch(`${SUPABASE_REST_URL}/storage/v1/object/product-images/${nueva}`, {
      method: 'POST',
      headers: storageHeaders(),
      body: Buffer.from(`PNG-nueva-${SFX}-${'y'.repeat(64)}`),
    });
    expect([200, 201, 409]).toContain(up.status);
    const upd = await rpcAsUser('update_master_product', adminToken, {
      p_master_id: ids[MASTER_C.sku],
      p_changes: { image_path: nueva },
      p_origin_store_id: storeA,
    });
    expect(upd.ok, `update_master_product falló: ${upd.error}`).toBeTruthy();

    // 3) Ambas tiendas reflejan la NUEVA imagen (sin editarlas manualmente).
    const a2 = await paginaCatalogo(adminToken, storeA, 0, 500);
    const b2 = await paginaCatalogo(adminToken, storeB, 0, 500);
    expect(a2.find(r => String(r.master_product_id) === ids[MASTER_C.sku])?.image_url).toBe(nueva);
    expect(b2.find(r => String(r.master_product_id) === ids[MASTER_C.sku])?.image_url).toBe(nueva);

    // 4) El archivo nuevo existe (referencia viva, no rota).
    const head = await fetch(`${SUPABASE_REST_URL}/storage/v1/object/public/product-images/${nueva}`, { method: 'HEAD' });
    expect(head.status).toBe(200);

    // 5) Sin copias por tienda: la fila local de B (si existe) comparte puntero.
    const localesB = await sb.select<{ image_url: string | null }>(
      'products', `master_product_id=eq.${ids[MASTER_C.sku]}&store_id=eq.${storeB}&select=image_url`,
    );
    for (const l of localesB) expect(l.image_url).toBe(nueva);
  });

  test('E2E-6 — Atributos locales intactos tras cambio global', async () => {
    // Cambio GLOBAL del nombre del maestro B.
    const upd = await rpcAsUser('update_master_product', adminToken, {
      p_master_id: ids[MASTER_B.sku],
      p_changes: { name: `${MASTER_B.name} GLOBAL` },
      p_origin_store_id: storeA,
    });
    expect(upd.ok, `update_master_product falló: ${upd.error}`).toBeTruthy();

    const pagina = await paginaCatalogo(adminToken, storeB, 0, 500);
    const fila = pagina.find(r => String(r.master_product_id) === ids[MASTER_B.sku]);
    expect(fila, 'fila local de B visible').toBeTruthy();
    expect(fila.source).toBe('local');
    expect(fila.name).toBe(`${MASTER_B.name} GLOBAL`);      // identidad global propagada
    expect(Number(fila.price)).toBe(55.5);                  // precio local INTACTO
    expect(Number(fila.cost_price)).toBe(30.25);            // costo local INTACTO
    expect(Number(fila.min_stock)).toBe(4);                 // mínimo local INTACTO
  });

  test('E2E-7 — Seguridad: negativas de autorización', async () => {
    // (a) Tienda NO conectada: no ve maestros (solo sus filas locales).
    const enC = await paginaCatalogo(adminToken, storeC, 0, 500);
    expect(enC.length).toBe(0);

    // (b) No-gobernador intenta editar identidad global → rechazado.
    const clerkUpd = await rpcAsUser('update_master_product', clerkToken, {
      p_master_id: ids[MASTER_A.sku], p_changes: { name: 'HACK' }, p_origin_store_id: storeB,
    });
    expect(clerkUpd.ok, 'un no-gobernador NO debe editar el maestro').toBeFalsy();

    // (c) Maestro de OTRA organización → ERR_STORE_MISMATCH.
    const cross = await rpcAsUser('activate_master_product', adminToken, {
      p_master_id: otherTenantMaster, p_store_id: storeA,
    });
    expect(cross.ok, 'activar un maestro cross-tenant debe fallar').toBeFalsy();
    expect(String(cross.error)).toContain('ERR_STORE_MISMATCH');

    // (d) Manipulación del payload: claves ajenas a la identidad compartida.
    const payload = await rpcAsUser('update_master_product', adminToken, {
      p_master_id: ids[MASTER_A.sku],
      p_changes: { store_id: storeB, tenant_id: tenantId },
      p_origin_store_id: storeA,
    });
    expect(payload.ok, 'manipular store_id/tenant_id en el payload debe fallar').toBeFalsy();
    expect(String(payload.error)).toContain('ERR_INVALID_CHANGES');

    // (e) El maestro A conserva su identidad tras los intentos.
    const masters = await sb.select<{ name: string }>('master_products', `id=eq.${ids[MASTER_A.sku]}&select=name`);
    expect(masters[0].name).toBe(MASTER_A.name);
  });

  test('E2E-8 — Regresión: altas locales puras siguen visibles estando conectada', async () => {
    // Producto local SIN vínculo al maestro en B (alta local pura).
    const [local] = await sb.insert('products', [{
      store_id: storeB,
      tenant_id: tenantId,
      sku: `CM2-LOCAL-${SFX}`,
      name: `Producto local puro ${SFX}`,
      price: 12.5,
      cost_price: 7,
      unit_of_measure: 'unidad',
      is_active: true,
      is_complete: true,
    }]) as Array<{ id: string }>;

    const pagina = await paginaCatalogo(adminToken, storeB, 0, 500);
    const fila = pagina.find(r => String(r.id) === String(local.id));
    expect(fila, 'el producto local puro debe seguir visible en la tienda conectada').toBeTruthy();
    expect(fila.source).toBe('local');
    expect(Number(fila.price)).toBe(12.5);

    // Limpieza inmediata del registro propio de este test.
    await sb.delete('products', `id=eq.${local.id}`);
  });
});
