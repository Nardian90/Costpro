/**
 * E2E — CATÁLOGO MAESTRO: FLUJO COMPLETO DE LA ORGANIZACIÓN (CP-CAT-MAESTRO-003)
 * ============================================================================
 * Batería exigida por la misión §7 (pendiente desde PR #1524): evidencia del
 * flujo funcional completo del catálogo maestro contra la base AISLADA
 * CostproE2E. Complementa (no sustituye) los tests unitarios/de hooks/de
 * contrato ya existentes.
 *
 * Casos (12):
 *   C01  Conectar dos tiendas sintéticas (pilotos A y B del run) al catálogo
 *        de la organización del run.
 *   C02  Crear un producto maestro desde la tienda A (alta con identidad
 *        compartida + fila local en UNA transacción).
 *   C03  Consultarlo desde la tienda B (search_master_products por SKU y
 *        nombre; el maestro es visible antes de activarlo).
 *   C04  Activarlo en la tienda B (fila local con defaults del alta manual:
 *        precio 0/CUP, min_stock 1, existencia 0 — NUNCA copia datos de A).
 *   C05  Identidad común: SKU y nombre idénticos en maestro y filas A/B.
 *   C06  Precios y costos INDEPENDIENTES por tienda (PATCH local en A y B).
 *   C07  Imagen compartida: update_master_product con image_path propaga la
 *        referencia a las filas locales de A y B (migración 20261030120000),
 *        misma referencia (no duplicada por tienda).
 *   C08  Duplicado concurrente: dos create_master_product con el MISMO SKU
 *        desde A y B en paralelo → exactamente 1 éxito, el otro
 *        ERR_MASTER_SKU_EXISTS.
 *   C09  Desconexión y reconexión de B: conservación de filas, vínculos e
 *        imagen; estado del link coherent.
 *   C10  Organización ajena: desde la tienda de OTRA organización no se puede
 *        crear (acceso denegado) ni leer el catálogo del run.
 *   C11  Usuario sin autorización (cajero): update_master_product y
 *        connect_store_catalog → ERR_UNAUTHORIZED (gobernador = owner).
 *   C12  Operaciones comerciales locales no se mezclan: movimiento de stock
 *        en A no altera B; precio de A no toca B.
 *
 * Arquitectura: mismas RPC que invoca el cliente real vía rpcAsUser(); la
 * verificación de estado persistido usa service-role (sb.select) como los
 * specs de inventario. Sin mocks. Datos 100% sintéticos del run aislado.
 * Limpieza afterAll: catálogo del run (products→log→proposals→links→
 * masters) y la organización ajena sintética T2/S2.
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import {
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS, signIn, rpcAsUser, sb,
} from '../fixtures/session.fixture';
import { readRunContext } from '../fixtures/run-env';

test.describe.configure({ mode: 'serial' });

const RUN_TAG = `MC${Date.now().toString(36)}`; // sufijo único por corrida
const SKU_MAESTRO = `SKU-${RUN_TAG}-M1`;
const SKU_DUP = `SKU-${RUN_TAG}-DUP`;
const NOMBRE_MAESTRO = `Producto Maestro E2E ${RUN_TAG}`;
const IMAGEN_V1 = `product-images/e2e/${RUN_TAG}-v1.png`;
const IMAGEN_V2 = `product-images/e2e/${RUN_TAG}-v2.png`;

let adminToken: string;
let adminId: string;
let cajeroToken: string;
let cajeroId: string;
let tenantId: string;
let storeA: { id: string; name: string };
let storeB: { id: string; name: string };
let masterId: string;
let otherTenantId: string;
let otherStoreId: string;

async function getLocalRow(productId: string): Promise<any | undefined> {
  const rows = (await sb.select('products', `id=eq.${productId}&select=id,store_id,sku,name,image_url,price,price_currency,cost_price,stock_current,min_stock,master_product_id`)) as any[];
  return rows[0];
}

async function filaDelMaestro(storeId: string): Promise<any> {
  const rows = (await sb.select('products', `store_id=eq.${storeId}&master_product_id=eq.${masterId}&select=id`)) as any[];
  return rows[0];
}

test.beforeAll(async () => {
  const ctx = readRunContext();
  test.skip(!ctx, 'Requiere modo aislado (E2E_ISOLATION=1 con run-env provisionado)');
  if (!ctx) return;
  tenantId = ctx.tenantId;
  storeA = ctx.pilotStoreA;
  storeB = ctx.pilotStoreB;

  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  adminToken = admin.token;
  adminId = admin.userId;
  const cajero = await signIn(CLERK_EMAIL, CLERK_PASS);
  cajeroToken = cajero.token;
  cajeroId = cajero.userId;

  // Organización ajena sintética (para C10): tenant T2 + tienda S2 vía service-role.
  const [t2] = (await sb.insert('tenants', [{
    name: `E2E OTHER-TENANT ${RUN_TAG}`,
    plan: 'free',
    is_active: true,
  }])) as any[];
  otherTenantId = String(t2.id);
  const [s2] = (await sb.insert('stores', [{
    name: `E2E OTHER-STORE ${RUN_TAG}`,
    tenant_id: otherTenantId,
    is_active: true,
  }])) as any[];
  otherStoreId = String(s2.id);
});

test.afterAll(async () => {
  // Limpieza del catálogo del run (orden FK-safe) y de la organización ajena.
  // Cada paso es best-effort (un paso con 409 no aborta el resto).
  const paso = async (nombre: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { console.warn(`[master-catalog-full] cleanup ${nombre}:`, e); }
  };
  if (tenantId) {
    await paso('log/proposals', async () => {
      const masters = (await sb.select('master_products', `tenant_id=eq.${tenantId}&select=id`)) as any[];
      for (const m of masters) {
        await sb.delete('master_change_log', `master_product_id=eq.${m.id}`);
        await sb.delete('master_change_proposals', `master_product_id=eq.${m.id}`);
      }
    });
    await paso('products vinculados', () => sb.delete('products', `tenant_id=eq.${tenantId}&master_product_id=not.is.null`));
    await paso('masters', () => sb.delete('master_products', `tenant_id=eq.${tenantId}`));
    await paso('links', () => sb.delete('catalog_store_links', `tenant_id=eq.${tenantId}`));
  }
  if (otherStoreId) {
    // borrado defensivo de referencias plausibles (best-effort)
    for (const t of ['products', 'document_sequences', 'user_store_memberships', 'catalog_store_links', 'audit_logs']) {
      await paso(t, () => sb.delete(t, `store_id=eq.${otherStoreId}`));
    }
    await paso('store ajena', () => sb.delete('stores', `id=eq.${otherStoreId}`));
  }
  if (otherTenantId) {
    await paso('tenant ajeno', () => sb.delete('tenants', `id=eq.${otherTenantId}`));
  }
});

test.describe('Catálogo maestro — flujo completo (12 casos)', () => {
  test('C01 — conecta las dos tiendas al catálogo de la organización', async () => {
    const rA = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeA.id, p_user_id: adminId });
    expect(rA.ok, `conexión A falló: ${rA.error}`).toBeTruthy();
    const rB = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeB.id, p_user_id: adminId });
    expect(rB.ok, `conexión B falló: ${rB.error}`).toBeTruthy();

    const links = await sb.select('catalog_store_links', `tenant_id=eq.${tenantId}&status=eq.connected&select=store_id,status`);
    expect(links.map(l => l.store_id)).toEqual(expect.arrayContaining([storeA.id, storeB.id]));
  });

  test('C02 — crea producto maestro desde la tienda A (con fila local)', async () => {
    const r = await rpcAsUser('create_master_product', adminToken, {
      p_store_id: storeA.id,
      p_sku: SKU_MAESTRO,
      p_name: NOMBRE_MAESTRO,
      p_unit_of_measure: 'unidad',
      p_is_service: false,
      p_local: { price: '100', price_currency: 'CUP', cost_price: '80', min_stock: '5' },
      p_user_id: adminId,
    });
    expect(r.ok, `alta falló: ${r.error}`).toBeTruthy();
    expect(r.data?.status).toBe('success');
    masterId = String(r.data?.master_product_id);
    expect(masterId).toBeTruthy();

    const fila = await sb.select('products', `store_id=eq.${storeA.id}&sku=eq.${SKU_MAESTRO}&select=id,price,cost_price,min_stock,stock_current,master_product_id`);
    expect(fila[0]?.master_product_id).toBe(masterId);
    expect(Number(fila[0]?.price)).toBe(100);
    expect(Number(fila[0]?.cost_price)).toBe(80);
    expect(Number(fila[0]?.stock_current)).toBe(0); // alta: existencia 0
  });

  test('C03 — la tienda B consulta el maestro por SKU y por nombre', async () => {
    const porSku = await rpcAsUser('search_master_products', adminToken, {
      p_store_id: storeB.id, p_search: SKU_MAESTRO, p_limit: 20, p_offset: 0, p_user_id: adminId,
    });
    expect(porSku.ok, `búsqueda SKU falló: ${porSku.error}`).toBeTruthy();
    const hitSku = (porSku.data?.items ?? porSku.data?.results ?? porSku.data ?? []) as any[];
    expect(JSON.stringify(hitSku)).toContain(SKU_MAESTRO);

    const porNombre = await rpcAsUser('search_master_products', adminToken, {
      p_store_id: storeB.id, p_search: RUN_TAG, p_limit: 20, p_offset: 0, p_user_id: adminId,
    });
    expect(porNombre.ok).toBeTruthy();
    const hitNom = (porNombre.data?.items ?? porNombre.data?.results ?? porNombre.data ?? []) as any[];
    expect(JSON.stringify(hitNom)).toContain(NOMBRE_MAESTRO);
  });

  test('C04 — activa el maestro en la tienda B con defaults (sin copiar de A)', async () => {
    const r = await rpcAsUser('activate_master_product', adminToken, {
      p_master_id: masterId, p_store_id: storeB.id, p_user_id: adminId,
    });
    expect(r.ok, `activación falló: ${r.error}`).toBeTruthy();

    const filaB = await sb.select('products', `store_id=eq.${storeB.id}&master_product_id=eq.${masterId}&select=id,price,price_currency,min_stock,stock_current`);
    expect(filaB).toHaveLength(1);
    // Defaults del alta manual: NUNCA copia precio/costo/stock de A
    expect(Number(filaB[0].price)).toBe(0);
    expect(filaB[0].price_currency).toBe('CUP');
    expect(Number(filaB[0].min_stock)).toBe(1);
    expect(Number(filaB[0].stock_current)).toBe(0);
  });

  test('C05 — identidad común: SKU y nombre idénticos en maestro y ambas tiendas', async () => {
    const [master] = (await sb.select('master_products', `id=eq.${masterId}&select=sku,name`)) as any[];
    const filaA = await getLocalRow((await filaDelMaestro(storeA.id)).id as string);
    const filaB = await getLocalRow((await filaDelMaestro(storeB.id)).id as string);
    expect(filaA?.sku).toBe(master.sku);
    expect(filaB?.sku).toBe(master.sku);
    expect(filaA?.name).toBe(master.name);
    expect(filaB?.name).toBe(master.name);
    expect(master.sku).toBe(SKU_MAESTRO);
  });

  test('C06 — precios y costos independientes por tienda', async () => {
    const filaA0 = await filaDelMaestro(storeA.id);
    const filaB0 = await filaDelMaestro(storeB.id);
    await sb.update('products', `id=eq.${filaA0.id}`, { price: 150, cost_price: 90 });
    await sb.update('products', `id=eq.${filaB0.id}`, { price: 250, cost_price: 200 });

    const a = await getLocalRow(filaA0.id as string);
    const b = await getLocalRow(filaB0.id as string);
    expect(Number(a?.price)).toBe(150);
    expect(Number(a?.cost_price)).toBe(90);
    expect(Number(b?.price)).toBe(250);
    expect(Number(b?.cost_price)).toBe(200);
    // el maestro no guarda datos comerciales
    const [master] = (await sb.select('master_products', `id=eq.${masterId}&select=sku,name,image_path`)) as any[];
    expect(master).not.toHaveProperty('price');
  });

  test('C07 — imagen compartida: reemplazo se propaga a ambas tiendas (F2)', async () => {
    // imagen inicial v1 vía cambio de identidad gobernado
    const r1 = await rpcAsUser('update_master_product', adminToken, {
      p_master_id: masterId, p_changes: { image_path: IMAGEN_V1 }, p_origin_store_id: storeA.id, p_user_id: adminId,
    });
    expect(r1.ok, `update imagen v1 falló: ${r1.error}`).toBeTruthy();
    const filaA1 = await filaDelMaestro(storeA.id);
    const filaB1 = await filaDelMaestro(storeB.id);
    expect((await getLocalRow(filaA1.id as string))?.image_url).toBe(IMAGEN_V1);
    expect((await getLocalRow(filaB1.id as string))?.image_url).toBe(IMAGEN_V1);

    // reemplazo v2 — propagación de la migración 20261030120000
    const r2 = await rpcAsUser('update_master_product', adminToken, {
      p_master_id: masterId, p_changes: { image_path: IMAGEN_V2 }, p_origin_store_id: storeA.id, p_user_id: adminId,
    });
    expect(r2.ok, `update imagen v2 falló: ${r2.error}`).toBeTruthy();
    const a2 = await getLocalRow(filaA1.id as string);
    const b2 = await getLocalRow(filaB1.id as string);
    expect(a2?.image_url).toBe(IMAGEN_V2);
    expect(b2?.image_url).toBe(IMAGEN_V2);
    // misma referencia compartida (no duplicada por tienda)
    expect(a2?.image_url).toBe(b2?.image_url);
    // datos comerciales intactos tras la propagación
    expect(Number(a2?.price)).toBe(150);
    expect(Number(b2?.price)).toBe(250);
  });

  test('C08 — duplicado concurrente del SKU: exactamente 1 éxito', async () => {
    const [r1, r2] = await Promise.all([
      rpcAsUser('create_master_product', adminToken, {
        p_store_id: storeA.id, p_sku: SKU_DUP, p_name: `Duplicado ${RUN_TAG} A`,
        p_local: { price: '10', price_currency: 'CUP' }, p_user_id: adminId,
      }),
      rpcAsUser('create_master_product', adminToken, {
        p_store_id: storeB.id, p_sku: SKU_DUP, p_name: `Duplicado ${RUN_TAG} B`,
        p_local: { price: '20', price_currency: 'CUP' }, p_user_id: adminId,
      }),
    ]);
    const exitos = [r1, r2].filter(r => r.ok);
    const fallos = [r1, r2].filter(r => !r.ok);
    expect(exitos).toHaveLength(1);
    expect(fallos).toHaveLength(1);
    expect(fallos[0].error).toContain('ERR_MASTER_SKU_EXISTS');
    // un solo maestro con ese SKU en la organización
    const dups = (await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${SKU_DUP}&select=id`)) as any[];
    expect(dups).toHaveLength(1);
    // el maestro perdedor reportado por la RPC ganadora existía
    const ganador = exitos[0].data?.master_product_id ?? exitos[0].data?.existing_master_id;
    expect(ganador).toBeTruthy();
  });

  test('C09 — desconexión de B conserva filas/vínculos; reconexión reactiva', async () => {
    const d = await rpcAsUser('disconnect_store_catalog', adminToken, { p_store_id: storeB.id, p_user_id: adminId, p_reason: 'E2E C09' });
    expect(d.ok, `desconexión falló: ${d.error}`).toBeTruthy();

    const [link] = (await sb.select('catalog_store_links', `store_id=eq.${storeB.id}&select=status,disconnected_at`)) as any[];
    expect(link?.status).toBe('disconnected');

    // conservación: la fila local de B sigue vinculada e intacta
    const filaB = (await sb.select('products', `store_id=eq.${storeB.id}&master_product_id=eq.${masterId}&select=id,price,image_url`))[0] as any;
    expect(filaB).toBeTruthy();
    expect(Number(filaB.price)).toBe(250);
    expect(filaB.image_url).toBe(IMAGEN_V2);

    // reconexión
    const r = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeB.id, p_user_id: adminId });
    expect(r.ok, `reconexión falló: ${r.error}`).toBeTruthy();
    const [link2] = (await sb.select('catalog_store_links', `store_id=eq.${storeB.id}&select=status`)) as any[];
    expect(link2?.status).toBe('connected');
  });

  test('C10 — organización ajena: sin crear ni leer', async () => {
    const crear = await rpcAsUser('create_master_product', adminToken, {
      p_store_id: otherStoreId, p_sku: `SKU-${RUN_TAG}-X`, p_name: `Cruzado ${RUN_TAG}`,
      p_user_id: adminId,
    });
    expect(crear.ok).toBeFalsy();
    // Denegación garantizada: el caller plataforma-admin pasa los checks de
    // acceso (semántica de plataforma) y es rechazado por la puerta de
    // conexión al catálogo (ERR_STORE_NOT_CONNECTED); un caller de tienda
    // ajena sin membresía es rechazado antes (ERR_STORE_NOT_FOUND /
    // ERR_UNAUTHORIZED). En todos los casos la operación NO se ejecuta.
    expect(crear.error).toMatch(/^ERR_/);

    // Confirmación en BD: NADA se creó en la organización ajena
    const cruzados = (await sb.select('master_products', `tenant_id=eq.${otherTenantId}&select=id`)) as any[];
    expect(cruzados).toHaveLength(0);

    const leer = await rpcAsUser('search_master_products', adminToken, {
      p_store_id: otherStoreId, p_search: SKU_MAESTRO, p_limit: 20, p_offset: 0, p_user_id: adminId,
    });
    // denegado (error) o vacío (sin filtración de datos)
    if (leer.ok) {
      const items = (leer.data?.items ?? leer.data?.results ?? leer.data ?? []) as any[];
      expect(JSON.stringify(items)).not.toContain(SKU_MAESTRO);
    } else {
      expect(leer.error).toMatch(/ERR_|permission|denied/i);
    }
  });

  test('C11 — usuario sin autorización no edita identidad ni conecta tiendas', async () => {
    const editar = await rpcAsUser('update_master_product', cajeroToken, {
      p_master_id: masterId, p_changes: { name: `Hack ${RUN_TAG}` }, p_origin_store_id: storeA.id, p_user_id: cajeroId,
    });
    expect(editar.ok).toBeFalsy();
    expect(editar.error).toContain('ERR_UNAUTHORIZED');

    const conectar = await rpcAsUser('connect_store_catalog', cajeroToken, { p_store_id: storeB.id, p_user_id: cajeroId });
    expect(conectar.ok).toBeFalsy();
    expect(conectar.error).toContain('ERR_UNAUTHORIZED');

    // el nombre no cambió
    const [master] = (await sb.select('master_products', `id=eq.${masterId}&select=name`)) as any[];
    expect(master.name).toBe(NOMBRE_MAESTRO);
  });

  test('C12 — operaciones comerciales locales no se mezclan entre tiendas', async () => {
    const filaA = (await filaDelMaestro(storeA.id)) as any;
    const filaB0 = (await sb.select('products', `store_id=eq.${storeB.id}&master_product_id=eq.${masterId}&select=id,stock_current`))[0] as any;
    const stockBantes = Number(filaB0.stock_current);

    const mov = await rpcAsUser('register_stock_movement', adminToken, {
      p_product_id: filaA.id, p_store_id: storeA.id, p_quantity: 10,
      p_movement_type: 'in', p_reason: `E2E C12 ${RUN_TAG}`, p_user_id: adminId,
    });
    expect(mov.ok, `movimiento falló: ${mov.error}`).toBeTruthy();

    const a = await getLocalRow(filaA.id as string);
    const b = await getLocalRow(filaB0.id as string);
    expect(Number(a?.stock_current)).toBe(Number(filaA.stock_current) + 10);
    expect(Number(b?.stock_current)).toBe(stockBantes); // B intacto

    // cambio de precio local en A no toca B (re-verificación con PATCH local)
    await sb.update('products', `id=eq.${filaA.id}`, { price: 175 });
    const a2 = await getLocalRow(filaA.id as string);
    const b2 = await getLocalRow(filaB0.id as string);
    expect(Number(a2?.price)).toBe(175);
    expect(Number(b2?.price)).toBe(250);
    // identidad compartida preservada tras operaciones comerciales
    expect(a2?.sku).toBe(b2?.sku);
  });
});
