/**
 * E2E — CP-CAT-MAESTRO-002: INICIALIZACIÓN DEL CATÁLOGO MAESTRO (BACKFILL)
 * ============================================================================
 * Batería de la misión §9 (tabla de pruebas) para los flujos NUEVOS:
 *   incorporación fiel 1:1 de un catálogo local existente al maestro
 *   (incorporate_store_products_to_master) + creación de tienda FERRO en el
 *   mismo tenant + conexión al MISMO catálogo + creación simétrica.
 *
 * Complementa e2e/flows/master-catalog-full.spec.ts (12 casos CP-CAT-MAESTRO-003),
 * que cubre: conexión, alta compartida, búsqueda, activación, independencia
 * comercial, imagen compartida, duplicado concurrente, desconexión,
 * aislamiento cross-org y permisos. Esta batería NO repite esos casos:
 * verifica la INICIALIZACIÓN con productos preexistentes (sin segunda copia
 * local) y la simetría de alta desde la tienda nueva.
 *
 * Casos (misión §9 → evidencia):
 *   B01  Cargar catálogo de ENERVIDA (simulada: piloto A con 7 productos
 *        sintéticos de formas diversas) → correspondencia fiel 1:1 (misión §3).
 *   B02  Fidelidad literal campo a campo: sku, nombre, descripción, barcode,
 *        barcode_type, unidad, is_service, estado, imagen por REFERENCIA.
 *   B03  Datos comerciales intactos: precio/costo/existencia de A NO cambian
 *        por la incorporación (misión §11).
 *   B04  Dry-run: proyección exacta SIN escrituras (manifiesto previo §3.4).
 *   B05  Idempotencia: segunda ejecución → 0 maestros nuevos, 0 duplicados.
 *   B06  SKU en conflicto (identidad contradictoria) → se detecta, NO se
 *        fusiona silenciosamente, no se crea duplicado (misión §7.3).
 *   B07  Identidad coincidente → reutiliza el maestro existente (vincula).
 *   B08  Usuario sin permisos (cajero) → ERR_UNAUTHORIZED.
 *   B09  Crear FERRO (vía API real POST /api/stores) → pertenece al MISMO
 *        tenant del run; conectada al MISMO catálogo.
 *   B10  Buscar producto antiguo (incorporado) desde FERRO → visible.
 *   B11  Crear producto nuevo desde FERRO → maestro compartido, visible desde
 *        ENERVIDA (simétrico §7.2), sin segunda identidad maestra.
 *   B12  POS y búsqueda siguen funcionando tras los vínculos (get_products_for_pos).
 *
 * Arquitectura: RPCs reales vía rpcAsUser() (JWT autenticado — misión §9 exige
 * pruebas con usuarios auténticos, no service_role); verificación de estado
 * persistido con service-role (sb.select) como los specs de inventario.
 * Datos 100% sintéticos del run aislado. Limpieza afterAll FK-safe.
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import {
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS, signIn, rpcAsUser, sb,
} from '../fixtures/session.fixture';
import { readRunContext } from '../fixtures/run-env';

test.describe.configure({ mode: 'serial' });

const RUN_TAG = `BF${Date.now().toString(36)}`;
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

// Catálogo sintético del piloto A (formas diversas como el real de ENERVIDA)
const CATALOGO_A = [
  { sku: `BF-${RUN_TAG}-001`, name: 'Tornillo autoperforante 1"', description: 'Tornillo autoperforante de acero galvanizado de una pulgada.', barcode: `INT${RUN_TAG}01`, barcode_type: 'INTERNAL', unit_of_measure: 'unidad', is_service: false, is_active: true, image_url: `product-images/e2e/${RUN_TAG}-tornillo.webp`, price: 5.5, cost_price: 3.2, stock_current: 800, min_stock: 100 },
  { sku: `BF-${RUN_TAG}-002`, name: 'Cable solar 6mm²', description: 'Cable fotovoltaico de 6 mm² doble aislamiento.', barcode: `40${RUN_TAG}02`, barcode_type: 'EAN13', unit_of_measure: 'metro', is_service: false, is_active: true, image_url: null, price: 210, cost_price: 150, stock_current: 450, min_stock: 50 },
  { sku: `BF-${RUN_TAG}-003`, name: 'Instalación de sistema fotovoltaico', description: 'Servicio de instalación y puesta en marcha.', barcode: `SVC${RUN_TAG}03`, barcode_type: 'CODE128', unit_of_measure: 'unidad', is_service: true, is_active: true, image_url: null, price: 5000, cost_price: 0, stock_current: 0, min_stock: 1 },
  { sku: `BF-${RUN_TAG}-004`, name: 'Manguera riego 1/2"', description: null, barcode: `INT${RUN_TAG}04`, barcode_type: 'INTERNAL', unit_of_measure: 'rollo', is_service: false, is_active: true, image_url: null, price: 320, cost_price: 260, stock_current: 25, min_stock: 5 },
  { sku: `BF-${RUN_TAG}-005`, name: 'Panel solar 550W monocristalino', description: 'Panel fotovoltaico monocristalino 550W con marco de aluminio.', barcode: `40${RUN_TAG}05`, barcode_type: 'EAN13', unit_of_measure: 'unidad', is_service: false, is_active: true, image_url: `product-images/e2e/${RUN_TAG}-panel.webp`, price: 42000, cost_price: 35000, stock_current: 12, min_stock: 2 },
  { sku: `BF-${RUN_TAG}-006`, name: 'Producto descontinuado simétrico', description: 'Producto inactivo para verificar mapeo de estado.', barcode: `INT${RUN_TAG}06`, barcode_type: 'INTERNAL', unit_of_measure: 'unidad', is_service: false, is_active: false, image_url: null, price: 99, cost_price: 70, stock_current: 3, min_stock: 1 },
  { sku: `BF-${RUN_TAG}-007`, name: 'Abrazadera intermedia', description: 'Abrazadera intermedia para riel de montaje solar.', barcode: `INT${RUN_TAG}07`, barcode_type: 'INTERNAL', unit_of_measure: 'unidad', is_service: false, is_active: true, image_url: `product-images/e2e/${RUN_TAG}-abrazadera.jpeg`, price: 85, cost_price: 55, stock_current: 120, min_stock: 20 },
];
// Piloto B: conflicto (mismo SKU, nombre DIFERENTE) y reutilización (mismo SKU, identidad igual)
const SKU_CONFlicto = `BF-${RUN_TAG}-005`;
const SKU_REUSE = `BF-${RUN_TAG}-001`;

let adminToken: string;
let adminId: string;
let cajeroToken: string;
let tenantId: string;
let storeA: { id: string; name: string };
let storeB: { id: string; name: string };
let storeFerro: { id: string; name: string };
let ferroCreated = false;
const seededA: Array<Record<string, unknown> & { id: string }> = [];
const seededB: Array<Record<string, unknown> & { id: string }> = [];

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

  // Sembrar el catálogo local de A (7 formas diversas) — antes de CUALQUIER conexión
  const rows = CATALOGO_A.map(p => ({
    store_id: storeA.id,
    tenant_id: tenantId,
    name: p.name,
    description: p.description,
    sku: p.sku,
    price: p.price,
    price_currency: 'CUP',
    cost_price: p.cost_price,
    unit_of_measure: p.unit_of_measure,
    supplier: 'E2E BF Supplier',
    is_active: p.is_active,
    status: 'ACTIVE',
    barcode: p.barcode,
    barcode_type: p.barcode_type,
    is_service: p.is_service,
    image_url: p.image_url,
    stock_current: p.stock_current,
    min_stock: p.min_stock,
    is_complete: true,
  }));
  const createdA = await sb.insert('products', rows);
  for (const c of createdA) seededA.push(c as any);

  // Sembrar en B: conflicto (SKU 005 con nombre distinto) y reutilizable (SKU 001 igual)
  const createdB = await sb.insert('products', [
    { store_id: storeB.id, tenant_id: tenantId, name: 'Panel DIFERENTE conflicto', description: 'Nombre contradictorio para el conflicto.', sku: SKU_CONFlicto, price: 1, price_currency: 'CUP', cost_price: 1, unit_of_measure: 'unidad', is_active: true, status: 'ACTIVE', barcode: `INT${RUN_TAG}C9`, barcode_type: 'INTERNAL', is_service: false, stock_current: 1, min_stock: 1 },
    { store_id: storeB.id, tenant_id: tenantId, name: CATALOGO_A[0].name, description: CATALOGO_A[0].description, sku: SKU_REUSE, price: 7, price_currency: 'CUP', cost_price: 4, unit_of_measure: 'unidad', is_active: true, status: 'ACTIVE', barcode: null, barcode_type: null, is_service: false, stock_current: 9, min_stock: 1 },
  ]);
  for (const c of createdB) seededB.push(c as any);
});

test.afterAll(async () => {
  // Limpieza FK-safe del run (best-effort por paso)
  const paso = async (nombre: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { console.warn(`[backfill-m002] cleanup ${nombre}:`, e); }
  };
  if (tenantId) {
    // best-effort con reintento (500 transitorios de Cloudflare no abortan la limpieza)
    let ms: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        ms = (await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=like.BF-${RUN_TAG}*&select=id`)) as any[];
        break;
      } catch (e) {
        console.warn(`[backfill-m002] cleanup lectura masters intento ${attempt + 1}:`, e);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    for (const m of ms) {
      await paso('change_log', () => sb.delete('master_change_log', `master_product_id=eq.${m.id}`));
      await paso('proposals', () => sb.delete('master_change_proposals', `master_product_id=eq.${m.id}`));
    }
    await paso('products-seed', () => sb.delete('products', `sku=like.BF-${RUN_TAG}*`));
    await paso('masters', () => sb.delete('master_products', `tenant_id=eq.${tenantId}&sku=like.BF-${RUN_TAG}*`));
  }
  if (storeFerro?.id && ferroCreated) {
    await paso('links-ferro', () => sb.delete('catalog_store_links', `store_id=eq.${storeFerro.id}`));
    await paso('memberships-ferro', () => sb.delete('user_store_memberships', `store_id=eq.${storeFerro.id}`));
    await paso('ferro', () => sb.delete('stores', `id=eq.${storeFerro.id}`));
  }
  if (tenantId) {
    await paso('links', () => sb.delete('catalog_store_links', `tenant_id=eq.${tenantId}`));
  }
});

test.describe('CP-CAT-MAESTRO-002 — inicialización del catálogo (backfill 1:1)', () => {

  test('B04 — dry-run: proyección exacta SIN escrituras (manifiesto previo)', async () => {
    const r = await rpcAsUser('incorporate_store_products_to_master', adminToken, {
      p_store_id: storeA.id, p_dry_run: true, p_user_id: adminId,
    });
    expect(r.ok, `dry-run falló: ${r.error}`).toBeTruthy();
    const d = r.data as any;
    expect(d.status).toBe('success');
    expect(d.dry_run).toBe(true);
    // 7 sintéticos + 1 de referencia del run (E2E-PA-…-001) = 8 candidatos
    expect(Number(d.total_candidates)).toBe(8);
    expect(Number(d.would_create)).toBe(8);
    expect(Number(d.created)).toBe(0);
    expect(Number(d.linked_existing)).toBe(0);
    // SIN escrituras: ningún vínculo tras el dry-run
    const links = await sb.select('products', `store_id=eq.${storeA.id}&master_product_id=not.is.null&select=id`);
    expect(links).toHaveLength(0);
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=like.BF-${RUN_TAG}*&select=id`);
    expect(masters).toHaveLength(0);
  });

  test('B01+B02 — incorporación real: correspondencia fiel 1:1 campo a campo', async () => {
    const r = await rpcAsUser('incorporate_store_products_to_master', adminToken, {
      p_store_id: storeA.id, p_dry_run: false, p_user_id: adminId,
    });
    expect(r.ok, `incorporación falló: ${r.error}`).toBeTruthy();
    const d = r.data as any;
    expect(d.status).toBe('success');
    expect(Number(d.created)).toBe(8); // 7 sintéticos + referencia del run
    expect(Number(d.conflicts)).toBe(0);
    expect(Number(d.skipped)).toBe(0);

    // 1:1: cada producto de A tiene exactamente UN maestro y el vínculo correcto
    for (let i = 0; i < CATALOGO_A.length; i++) {
      const seed = CATALOGO_A[i];
      const fila = (await sb.select('products', `id=eq.${seededA[i].id}&select=id,sku,name,master_product_id,price,cost_price,stock_current,barcode,barcode_type,unit_of_measure,is_service,is_active,image_url`))[0];
      expect(fila.master_product_id, `vínculo ausente para ${seed.sku}`).toBeTruthy();
      const master = (await sb.select('master_products', `id=eq.${fila.master_product_id}&select=tenant_id,sku,name,description,image_path,barcode,barcode_type,unit_of_measure,is_service,status`))[0];
      // Fidelidad literal (misión §3.1)
      expect(master.tenant_id).toBe(tenantId);
      expect(master.sku).toBe(seed.sku);
      expect(master.name).toBe(seed.name);
      expect(master.description).toBe(seed.description ?? null);
      expect(master.barcode).toBe(seed.barcode);
      expect(master.barcode_type).toBe(seed.barcode_type);
      expect(master.unit_of_measure).toBe(seed.unit_of_measure);
      expect(master.is_service).toBe(seed.is_service);
      expect(master.image_path).toBe(seed.image_url ?? null); // por REFERENCIA
      expect(master.status).toBe(seed.is_active ? 'active' : 'archived'); // mapeo documentado
    }

    // Sin maestros huérfanos ni duplicados para el run
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=like.BF-${RUN_TAG}*&select=id,sku`);
    expect(masters).toHaveLength(7);
    const skus = masters.map(m => m.sku).sort();
    expect(new Set(skus).size).toBe(7);
  });

  test('B03 — datos comerciales de A intactos tras la incorporación', async () => {
    for (let i = 0; i < CATALOGO_A.length; i++) {
      const seed = CATALOGO_A[i];
      const fila = (await sb.select('products', `id=eq.${seededA[i].id}&select=price,cost_price,stock_current,min_stock,supplier`))[0];
      expect(Number(fila.price)).toBe(seed.price);
      expect(Number(fila.cost_price)).toBe(seed.cost_price);
      expect(Number(fila.stock_current)).toBe(seed.stock_current);
      expect(Number(fila.min_stock)).toBe(seed.min_stock);
    }
  });

  test('B05 — idempotencia: segunda ejecución → 0 maestros nuevos', async () => {
    const r = await rpcAsUser('incorporate_store_products_to_master', adminToken, {
      p_store_id: storeA.id, p_dry_run: false, p_user_id: adminId,
    });
    expect(r.ok).toBeTruthy();
    const d = r.data as any;
    expect(Number(d.total_candidates)).toBe(0);
    expect(Number(d.created)).toBe(0);
    expect(Number(d.linked_existing)).toBe(0);
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=like.BF-${RUN_TAG}*&select=id`);
    expect(masters).toHaveLength(7);
  });

  test('B06 — SKU en conflicto: se detecta, no se fusiona ni se duplica', async () => {
    const r = await rpcAsUser('incorporate_store_products_to_master', adminToken, {
      p_store_id: storeB.id, p_dry_run: false, p_user_id: adminId,
    });
    expect(r.ok).toBeTruthy();
    const d = r.data as any;
    expect(d.status).toBe('completed_with_exceptions');
    // 1 conflicto + 1 reutilización (+ referencia del run B creada)
    const conflicto = (d.exceptions as any[]).find(e => e.reason === 'ERR_IDENTITY_CONFLICT');
    expect(conflicto, 'debe registrar ERR_IDENTITY_CONFLICT').toBeTruthy();
    expect(conflicto.sku).toBe(SKU_CONFlicto);
    expect(Number(d.linked_existing)).toBe(1);

    // El producto conflictivo NO queda vinculado y NO genera maestro nuevo
    const fila = (await sb.select('products', `id=eq.${seededB[0].id}&select=master_product_id`))[0];
    expect(fila.master_product_id).toBeNull();
    const masters005 = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${SKU_CONFlicto}&select=id,sku`);
    expect(masters005).toHaveLength(1); // solo el creado desde A
  });

  test('B07 — identidad coincidente: reutiliza el maestro existente (vincula)', async () => {
    const fila = (await sb.select('products', `id=eq.${seededB[1].id}&select=id,master_product_id,price,cost_price,stock_current`))[0];
    expect(fila.master_product_id).toBeTruthy();
    const masterA = (await sb.select('products', `id=eq.${seededA[0].id}&select=master_product_id`))[0];
    expect(fila.master_product_id).toBe(masterA.master_product_id); // MISMO maestro
    // Datos comerciales de B intactos (NO copia los de A)
    expect(Number(fila.price)).toBe(7);
    expect(Number(fila.cost_price)).toBe(4);
    expect(Number(fila.stock_current)).toBe(9);
  });

  test('B08 — usuario sin permisos (cajero) → ERR_UNAUTHORIZED', async () => {
    const r = await rpcAsUser('incorporate_store_products_to_master', cajeroToken, {
      p_store_id: storeA.id, p_dry_run: true,
    });
    expect(r.ok).toBeFalsy();
    expect(String(r.error)).toContain('ERR_UNAUTHORIZED');
  });

  test('B09 — crear FERRO en el mismo tenant (API real) y conectarla al MISMO catálogo', async () => {
    // Conectar A y B primero (flujo de gobernanza)
    const rA = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeA.id, p_user_id: adminId });
    expect(rA.ok, `conexión A: ${rA.error}`).toBeTruthy();
    const rB = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeB.id, p_user_id: adminId });
    expect(rB.ok, `conexión B: ${rB.error}`).toBeTruthy();

    // Creación de la tienda vía la API REAL (mecanismo nativo)
    const res = await fetch(`${BASE_URL}/api/stores`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({
        name: `FERRO-E2E-${RUN_TAG}`,
        address: 'Tienda FERRO de prueba E2E (run aislado)',
        phone: '+5355550001',
        email: `ferro-e2e@costpro.test`,
        slug: `ferro-e2e-${RUN_TAG.toLowerCase()}`,
        plantilla: 'construccion',
      }),
    });
    const bodyText = await res.text(); // leer UNA vez (el body no es reutilizable)
    expect(res.ok, `creación FERRO: HTTP ${res.status} ${bodyText}`).toBeTruthy();
    const json = JSON.parse(bodyText) as any;
    storeFerro = { id: String(json?.data?.store_id ?? json?.store_id ?? json?.data?.id), name: `FERRO-E2E-${RUN_TAG}` };
    ferroCreated = true;
    expect(storeFerro.id).toBeTruthy();

    // Pertenece al MISMO tenant del run (misión §5)
    const store = (await sb.select('stores', `id=eq.${storeFerro.id}&select=id,tenant_id,name,is_active`))[0];
    expect(store.tenant_id).toBe(tenantId);
    expect(store.is_active).toBe(true);

    // Conectar FERRO al catálogo de la organización
    const rF = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: storeFerro.id, p_user_id: adminId });
    expect(rF.ok, `conexión FERRO: ${rF.error}`).toBeTruthy();

    // Ambas conexiones comparten el MISMO catálogo (tenant) — misión §6
    const links = await sb.select('catalog_store_links', `tenant_id=eq.${tenantId}&status=eq.connected&select=store_id,tenant_id`);
    const linked = links.map(l => l.store_id);
    expect(linked).toContain(storeA.id);
    expect(linked).toContain(storeFerro.id);
    for (const l of links) expect(l.tenant_id).toBe(tenantId);
  });

  test('B10 — FERRO encuentra los productos existentes (incorporados) de la organización', async () => {
    const r = await rpcAsUser('search_master_products', adminToken, {
      p_store_id: storeFerro.id, p_search: `BF-${RUN_TAG}-005`, p_limit: 20, p_offset: 0, p_user_id: adminId,
    });
    expect(r.ok, `búsqueda desde FERRO: ${r.error}`).toBeTruthy();
    const items = (r.data?.items ?? r.data?.results ?? r.data ?? []) as any[];
    expect(JSON.stringify(items)).toContain(`BF-${RUN_TAG}-005`);

    // FERRO NO tiene existencias de ese producto (solo identidad compartida) — misión §6
    const filasFerro = await sb.select('products', `store_id=eq.${storeFerro.id}&sku=eq.BF-${RUN_TAG}-005&select=id`);
    expect(filasFerro).toHaveLength(0);
  });

  test('B11 — crear producto nuevo desde FERRO → maestro compartido visible desde A (simetría §7.2)', async () => {
    const SKU_NUEVO = `BF-${RUN_TAG}-F01`;
    const r = await rpcAsUser('create_master_product', adminToken, {
      p_store_id: storeFerro.id,
      p_sku: SKU_NUEVO,
      p_name: 'Producto creado desde FERRO E2E',
      p_description: 'Simetría de alta: nace en FERRO, visible en ENERVIDA.',
      p_barcode: `INT${RUN_TAG}F01`,
      p_barcode_type: 'INTERNAL',
      p_unit_of_measure: 'unidad',
      p_is_service: false,
      p_local: { price: '150', price_currency: 'CUP', cost_price: '90', min_stock: '3' },
      p_user_id: adminId,
    });
    expect(r.ok, `alta desde FERRO: ${r.error}`).toBeTruthy();
    expect(r.data?.status).toBe('success');
    const masterId = String((r.data as any)?.master_product_id);

    // Exactamente UNA identidad maestra (sin duplicado)
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${SKU_NUEVO}&select=id`);
    expect(masters).toHaveLength(1);

    // Visible desde A (ENERVIDA simulada) ANTES de activarlo
    const porSku = await rpcAsUser('search_master_products', adminToken, {
      p_store_id: storeA.id, p_search: SKU_NUEVO, p_limit: 20, p_offset: 0, p_user_id: adminId,
    });
    expect(porSku.ok).toBeTruthy();
    const items = (porSku.data?.items ?? porSku.data?.results ?? porSku.data ?? []) as any[];
    expect(JSON.stringify(items)).toContain(SKU_NUEVO);

    // La fila local de FERRO tiene defaults del alta manual (sin datos de A) y el vínculo
    const filaFerro = (await sb.select('products', `store_id=eq.${storeFerro.id}&sku=eq.${SKU_NUEVO}&select=master_product_id,price,stock_current`))[0];
    expect(filaFerro.master_product_id).toBe(masterId);
    expect(Number(filaFerro.stock_current)).toBe(0);
  });

  test('B12 — POS y búsqueda siguen funcionando tras los vínculos', async () => {
    // Búsqueda por SKU (firma real: p_search_term; retorno plano)
    const r = await rpcAsUser('get_products_for_pos', adminToken, {
      p_store_id: storeA.id, p_search_term: `BF-${RUN_TAG}-001`, p_limit: 20, p_offset: 0,
    });
    expect(r.ok, `POS: ${r.error}`).toBeTruthy();
    const items = (Array.isArray(r.data) ? r.data : (r.data?.items ?? [])) as any[];
    const found = items.find((x: any) => x.sku === `BF-${RUN_TAG}-001`);
    expect(found, 'el producto vinculado debe seguir encontrándose por SKU en el POS').toBeTruthy();
    expect(Number(found.price)).toBe(CATALOGO_A[0].price);

    // Escaneo por BARCODE: en filas vinculadas el código canónico vive en el
    // maestro (migración 20261028120000) — la búsqueda debe resolverlo
    const rb = await rpcAsUser('get_products_for_pos', adminToken, {
      p_store_id: storeA.id, p_search_term: CATALOGO_A[0].barcode, p_limit: 20, p_offset: 0,
    });
    expect(rb.ok, `POS por barcode: ${rb.error}`).toBeTruthy();
    const itemsB = (Array.isArray(rb.data) ? rb.data : (rb.data?.items ?? [])) as any[];
    expect(itemsB.some((x: any) => x.sku === `BF-${RUN_TAG}-001`),
      'el barcode debe resolver vía master_products para filas vinculadas').toBeTruthy();
  });
});
