/**
 * E2E — CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 (2026-11-17)
 * ============================================================================
 * Batería OBLIGATORIA de la misión (§11): 16 escenarios + test específico de
 * UPDATE no autorizado, sobre el flujo de importación Excel de recepciones.
 *
 * DECISIÓN VINCULANTE bajo prueba (misión §1): el nombre del Catálogo Maestro
 * es la autoridad del producto. El Excel de recepción NO renombra productos
 * maestros existentes; SOLO un producto verdaderamente nuevo (clase D) toma
 * su nombre inicial del Excel.
 *
 * Motor bajo prueba (migración 20261117120000_cp_reception_import_name_
 * authority.sql + trg_products_master_identity_guard, 2ª barrera):
 *   · fn_classify_reception_import_row / classify_reception_import_rows
 *     (salida ADITIVA effective_name con autoridad del maestro).
 *   · resolve_reception_import_rows (fila local SIEMPRE con el nombre
 *     canónico; carrera multitienda con el nombre del GANADOR; product_name).
 *   · register_reception (CASO A4/A5 con v_master_name).
 *   · reactivate_master_product (solo status; nombre intacto).
 *
 * El E2E demuestra el RESULTADO DE LAS ESCRITURAS REALES DEL BACKEND (misión
 * §11): estados en master_products / products / receipt_items leídos vía REST
 * con service-role tras ejecutar las RPC con auth real de usuario.
 *
 * Entorno: BD aislada CostproE2E (guard fail-closed) + pilotos del run.
 * Cleanup: delta neto cero (patrón reception-master-catalog-integrity).
 * ============================================================================
 */
import { test, expect, type Page } from '@playwright/test';
import {
  signIn, sb, rpcAsUser,
  ADMIN_EMAIL, ADMIN_PASS, CLERK_EMAIL, CLERK_PASS,
} from './fixtures/session.fixture';
import { readRunContext } from './fixtures/run-env';

let adminToken = '';
let adminId = '';
let clerkToken = '';
let clerkId = '';
let tenantId = '';
let storeA = ''; // conectada (principal)
let storeB = ''; // conectada (multitienda §9)
let storeC = ''; // NO conectada (alta local histórica)

const SFX = Date.now().toString(36);
const NS = `RNAU-${SFX}`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.E2E_SUPABASE_ANON_KEY || '';

/** SKU literal con sufijo del run. */
const sku = (n: string) => `${NS}-${n}`;

/** Fila estándar del Excel de recepciones (fidelidad: sin reformateos). */
function row(s: string, name: string, quantity = 10, unit_cost = 5, sale_price: number | null = 0, extra: Record<string, unknown> = {}) {
  return { sku: s, name, quantity, unit_cost, unit_of_measure: 'unidad', sale_price, ...extra };
}

interface ClassifyRow {
  index: number; sku: string; name: string; status: string;
  effective_name?: string | null;
  master_name?: string | null;
  product_id: string | null; master_product_id: string | null;
  can_create_master?: boolean;
  reasons: string[];
}
interface ClassifyRes {
  catalog_connected: boolean;
  rows: ClassifyRow[];
}
interface ResolveRes {
  status: string;
  summary: {
    identified: number; masters_created: number; masters_reactivated: number;
    locals_created: number; locals_activated: number; blocked: number; valid_lines: number;
  };
  results: Array<{ index: number; sku: string; status: string; action: string; product_id: string | null; product_name?: string | null; reasons?: string[] }>;
}

/** Lee el nombre actual de un maestro (service-role, verificación de estado). */
async function masterName(id: string): Promise<string | null> {
  const rows = await sb.select<{ name: string }>('master_products', `id=eq.${id}&select=name`);
  return rows[0]?.name ?? null;
}

/** Lee nombre/campos de la fila local de una tienda. */
async function localProduct(storeId: string, s: string) {
  const rows = await sb.select<{ id: string; name: string; cost_price: number; price: number; stock_current: number; cost_average: number; is_active: boolean }>(
    'products', `store_id=eq.${storeId}&sku=eq.${s}&select=id,name,cost_price,price,stock_current,cost_average,is_active`,
  );
  return rows[0] ?? null;
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

  // storeC: misma organización, NO conectada (alta local histórica).
  const [c] = await sb.insert('stores', [{ name: `E2E80 RNAU-C ${SFX}`, tenant_id: tenantId, is_active: true }]);
  storeC = String(c.id);

  // Conectar A y B al catálogo de la organización (gobernador = owner del run).
  for (const sid of [storeA, storeB]) {
    const r = await rpcAsUser('connect_store_catalog', adminToken, { p_store_id: sid });
    if (!r.ok) throw new Error(`connect_store_catalog falló para ${sid}: ${r.error}`);
  }
});

test.afterAll(async () => {
  // Higiene net-zero acotada a los artefactos de ESTA ejecución (namespace NS).
  try {
    if (adminId) {
      await sb.delete('audit_logs', `user_id=eq.${adminId}`);
      await sb.delete('master_change_log', `actor_id=eq.${adminId}`);
    }
    if (clerkId) await sb.delete('audit_logs', `user_id=eq.${clerkId}`);
  } catch { /* best-effort */ }
  try {
    for (const sid of [storeA, storeB, storeC].filter(Boolean)) {
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
    await sb.delete('master_products', `tenant_id=eq.${tenantId}&sku=like.${NS}*`);
  } catch { /* best-effort */ }
  try {
    if (storeC) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/rpc/e2e_hard_delete_store`, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_store_id: storeC }),
      });
      if (!del.ok) await sb.delete('stores', `id=eq.${storeC}`).catch(() => {});
    }
  } catch { /* best-effort: el sweep del run cubre el resto */ }
});

/** Clasificación canónica (read-only). */
async function classify(token: string, storeId: string, rows: unknown[]) {
  const r = await rpcAsUser<ClassifyRes>('classify_reception_import_rows', token, { p_store_id: storeId, p_rows: rows });
  if (!r.ok) throw new Error(`classify falló: ${r.error}`);
  return r.data as ClassifyRes;
}

/** Escritor canónico del importador. */
async function resolve(token: string, storeId: string, rows: unknown[], confirm: string[] = []) {
  const r = await rpcAsUser<ResolveRes>('resolve_reception_import_rows', token, {
    p_store_id: storeId, p_rows: rows, p_confirm_reactivation: confirm,
  });
  if (!r.ok) throw new Error(`resolve falló: ${r.error}`);
  return r.data as ResolveRes;
}

/** Registro de la recepción (único escritor del documento). */
async function registerReception(token: string, storeId: string, items: unknown[], invoice: string) {
  return rpcAsUser<string>('register_reception', token, {
    p_store_id: storeId,
    p_supplier: 'Proveedor E2E RNAU',
    p_invoice_number: invoice,
    p_items: items,
  });
}

/** Crea un maestro + fila local vinculada ACTIVA en storeId (setup del caso). */
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

/** Archiva un maestro (service-role: único escritor permitido para el setup). */
async function archiveMaster(id: string) {
  await sb.update('master_products', `id=eq.${id}`, { status: 'archived' });
}

/** Instantánea de identidad: nombres de todos los maestros del namespace. */
async function snapshotMasterNames(): Promise<Map<string, string>> {
  const rows = await sb.select<{ id: string; name: string }>(
    'master_products', `tenant_id=eq.${tenantId}&sku=like.${NS}*&select=id,name`,
  );
  return new Map(rows.map(r => [r.id, r.name]));
}

test.describe.serial('CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 — 16 escenarios + UPDATE no autorizado', () => {

  // ═══ §11.1 · Existente: el Excel trae un nombre diferente; maestro intacto ═══
  test('01 · existente con nombre Excel diferente — maestro PERMANECE intacto', async () => {
    const S = sku('E01');
    const MASTER = 'ABRAZADERA METÁLICA 3/4';
    const EXCEL = 'Abrazadera 3/4';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);

    const c = await classify(adminToken, storeA, [row(S, EXCEL)]);
    const r0 = c.rows[0];
    expect(r0.status).toBe('identified');
    // §6: effective_name = nombre OFICIAL del maestro (no el del Excel).
    expect(r0.effective_name).toBe(MASTER);
    expect(r0.master_name).toBe(MASTER);
    expect(r0.name).toBe(EXCEL); // fidelidad del Excel para trazabilidad

    const res = await resolve(adminToken, storeA, [row(S, EXCEL)]);
    expect(res.summary.masters_created).toBe(0);
    expect(res.summary.locals_created).toBe(0);
    expect(res.summary.identified).toBe(1);
    expect(res.results[0].product_name).toBe(MASTER);

    // ESCRITURAS REALES: el maestro conserva su nombre; no hay duplicados.
    expect(await masterName(seed.master_product_id)).toBe(MASTER);
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(1);
    expect((await localProduct(storeA, S))!.name).toBe(MASTER);
  });

  // ═══ §11.2/§11.14 · La línea de recepción muestra el nombre del maestro ═══
  test('02 · detalle de recepción muestra el nombre canónico (no el del Excel)', async () => {
    const S = sku('E02');
    const MASTER = 'BRIDA NYLON 200MM OFICIAL';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);

    const res = await resolve(adminToken, storeA, [row(S, 'brida 200 generic', 8, 3)]);
    expect(res.summary.identified).toBe(1);
    expect(res.results[0].product_name).toBe(MASTER);

    const reg = await registerReception(adminToken, storeA, [
      { product_id: res.results[0].product_id, quantity: 8, unit_cost: 3 },
    ], `RNAU-02-${SFX}`);
    expect(reg.ok).toBe(true);
    const receiptId = reg.data as string;

    // La línea de recepción referencia el producto cuyo nombre es el canónico.
    const items = await sb.select<{ product_id: string; products: { name: string } }>(
      'receipt_items', `receipt_id=eq.${receiptId}&select=product_id,products(name)`,
    );
    expect(items.length).toBe(1);
    expect(items[0].products.name).toBe(MASTER);
    // La fila local sigue con el nombre canónico tras la recepción.
    expect((await localProduct(storeA, S))!.name).toBe(MASTER);
    void seed;
  });

  // ═══ §11.3 · Local inactiva: se activa conservando el nombre del maestro ═══
  test('03 · asociación local inactiva se activa — nombre del maestro intacto', async () => {
    const S = sku('E03');
    const MASTER = 'TUERCA HEXAGONAL M12 DIN934';
    const seed = await seedMasterAndLocal(storeA, S, MASTER, { inactive: true });

    const c = await classify(adminToken, storeA, [row(S, 'Tuerca M12')]);
    expect(c.rows[0].status).toBe('activate_local');
    expect(c.rows[0].effective_name).toBe(MASTER);

    const res = await resolve(adminToken, storeA, [row(S, 'Tuerca M12')]);
    expect(res.summary.locals_activated).toBe(1);
    expect(res.summary.locals_created).toBe(0);
    expect(res.results[0].product_name).toBe(MASTER);

    const local = await localProduct(storeA, S);
    expect(local!.is_active).toBe(true);
    expect(local!.name).toBe(MASTER); // activación NO copia el nombre del Excel
    expect(await masterName(seed.master_product_id)).toBe(MASTER);
  });

  // ═══ §11.4/§11.13 · Archivado global: reactivación conserva el nombre original ═══
  test('04 · archivado global reactivado (gobernador) — nombre original intacto', async () => {
    const S = sku('E04');
    const MASTER = 'RODAMIENTO 6204 ZZ ORIGINAL';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);
    await archiveMaster(seed.master_product_id);

    const c = await classify(adminToken, storeA, [row(S, 'Rodamiento 6204')]);
    expect(c.rows[0].status).toBe('reactivate_master');
    expect(c.rows[0].effective_name).toBe(MASTER);

    // Reactivación autorizada (gobernador del run = owner) + confirmación explícita.
    const res = await resolve(adminToken, storeA, [row(S, 'Rodamiento 6204')], [S]);
    expect(res.summary.masters_reactivated).toBe(1);
    expect(res.results[0].product_name).toBe(MASTER);

    expect(await masterName(seed.master_product_id)).toBe(MASTER);
    const m = await sb.select<{ status: string }>('master_products', `id=eq.${seed.master_product_id}&select=status`);
    expect(m[0].status).toBe('active');
    // No se creó otro maestro para sustituir al archivado.
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(1);
  });

  // ═══ §11.5 · Verdaderamente nuevo: el Excel nombra el maestro inicial ═══
  test('05 · producto verdaderamente nuevo — nombre del Excel es el inicial del maestro', async () => {
    const S = sku('E05');
    const EXCEL = 'CLAVO TORX 5X90 NOVATO';
    const c = await classify(adminToken, storeA, [row(S, EXCEL)]);
    expect(c.rows[0].status).toBe('new_master');
    expect(c.rows[0].effective_name).toBe(EXCEL);
    expect(c.rows[0].master_name).toBeNull();

    const res = await resolve(adminToken, storeA, [row(S, EXCEL)]);
    expect(res.summary.masters_created).toBe(1);
    expect(res.summary.locals_created).toBe(1);
    expect(res.results[0].product_name).toBe(EXCEL);

    const m = await sb.select<{ id: string; name: string; status: string }>(
      'master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id,name,status`,
    );
    expect(m.length).toBe(1);
    expect(m[0].name).toBe(EXCEL); // ÚNICO caso legítimo: creación inicial
    expect(m[0].status).toBe('active');
    expect((await localProduct(storeA, S))!.name).toBe(EXCEL);
  });

  // ═══ §11.6 · Reimportación del mismo Excel: NO modifica el nombre existente ═══
  test('06 · reimportación del mismo Excel — maestro permanece intacto', async () => {
    const S = sku('E06');
    const MASTER = 'LIJA AL OXIDO 120 OFICIAL';
    const EXCEL = 'Lija al oxido 120';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);

    // Primera importación (identificada).
    await resolve(adminToken, storeA, [row(S, EXCEL)]);
    // Segunda importación idéntica.
    const c2 = await classify(adminToken, storeA, [row(S, EXCEL)]);
    expect(c2.rows[0].status).toBe('identified');
    const res2 = await resolve(adminToken, storeA, [row(S, EXCEL)]);
    expect(res2.summary.masters_created).toBe(0);

    expect(await masterName(seed.master_product_id)).toBe(MASTER);
    expect((await localProduct(storeA, S))!.name).toBe(MASTER);
  });

  // ═══ §11.7 · Misma reimportación con OTRA descripción: conserva el maestro ═══
  test('07 · mismo SKU con otra descripción — conserva el nombre maestro', async () => {
    const S = sku('E07');
    const MASTER = 'SOLVENTE UNIVERSAL 1L';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);

    const c = await classify(adminToken, storeA, [row(S, 'Solvente thinner 1000ml más barato')]);
    expect(c.rows[0].status).toBe('identified');
    expect(c.rows[0].effective_name).toBe(MASTER);
    await resolve(adminToken, storeA, [row(S, 'Solvente thinner 1000ml más barato')]);

    expect(await masterName(seed.master_product_id)).toBe(MASTER);
    expect((await localProduct(storeA, S))!.name).toBe(MASTER);
    void seed;
  });

  // ═══ §11.8/§9 · Dos tiendas, nombres Excel diferentes: ambas canónicas ═══
  test('08 · dos tiendas con nombres Excel distintos — misma identidad canónica', async () => {
    const S = sku('E08');
    const MASTER = 'PINTURA ESMALTE BLANCO GALON';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);

    // Tienda A: identifica (ya tiene fila local activa).
    const resA = await resolve(adminToken, storeA, [row(S, 'Pintura esmalte blanco 4L')]);
    expect(resA.summary.identified).toBe(1);
    // Tienda B: Excel totalmente distinto → maestro existente, sin fila local →
    // activación local cuya fila nace con el nombre CANÓNICO del maestro.
    const resB = await resolve(adminToken, storeB, [row(S, 'Esmalte blanco cubritivo x galón')]);
    expect(resB.summary.locals_created).toBe(1);
    expect(resB.results[0].product_name).toBe(MASTER);

    // Ambas tiendas usan el mismo nombre oficial; ninguno cambia el global.
    const localA = await localProduct(storeA, S);
    const localB = await localProduct(storeB, S);
    expect(localA!.name).toBe(MASTER);
    expect(localB!.name).toBe(MASTER);
    expect(await masterName(seed.master_product_id)).toBe(MASTER);
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(1); // sin maestro duplicado
  });

  // ═══ §11.9 · SKU duplicado en el archivo: bloquea SIN renombrar ═══
  test('09 · SKU duplicado en el archivo — bloqueado sin renombrar productos', async () => {
    const S = sku('E09');
    const MASTER = 'ARANDELA PLANA 3/8 OFICIAL';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);

    const c = await classify(adminToken, storeA, [row(S, 'Arandela 3/8'), row(S, 'Arandela plana zincada')]);
    const statuses = c.rows.map(r => r.status);
    expect(statuses).toContain('error'); // duplicado del archivo → error
    expect(c.rows.some(r => (r.reasons || []).some(x => x.includes('ERR_SKU_DUPLICATE_FILE')))).toBe(true);

    const res = await resolve(adminToken, storeA, [row(S, 'Arandela 3/8'), row(S, 'Arandela plana zincada')]);
    expect(res.summary.blocked).toBe(1); // la fila duplicada queda bloqueada
    expect(res.summary.masters_created).toBe(0);
    expect(await masterName(seed.master_product_id)).toBe(MASTER);
    expect((await localProduct(storeA, S))!.name).toBe(MASTER);
  });

  // ═══ §11.10 · Código de barras contradictorio: bloquea SIN modificar el maestro ═══
  test('10 · código de barras contradictorio — bloqueado sin modificar el maestro', async () => {
    const S = sku('E10');
    const MASTER = 'CANDADO DE SEGURIDAD 50MM';
    const MASTER_BARCODE = '8888888888888';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);
    // El maestro PORTA el código canónico (doctrina 20261028110000); el setup
    // lo asigna por service-role (único escritor permitido para el arranque).
    await sb.update('master_products', `id=eq.${seed.master_product_id}`, { barcode: MASTER_BARCODE });

    // El Excel trae UN barcode DISTINTO → contradicción de identidad → revisión.
    const c = await classify(adminToken, storeA, [row(S, 'Candado 50mm', 10, 5, 0, { barcode: '9999999999999' })]);
    expect(c.rows[0].status).toBe('review');
    expect((c.rows[0].reasons || []).some(x => x.includes('ERR_BARCODE_CONTRADICTS'))).toBe(true);

    const res = await resolve(adminToken, storeA, [row(S, 'Candado 50mm', 10, 5, 0, { barcode: '9999999999999' })]);
    expect(res.summary.blocked).toBe(1);
    expect(res.summary.masters_created).toBe(0);
    expect(res.summary.identified).toBe(0);
    // El maestro NO fue modificado (nombre ni barcode).
    const m = await sb.select<{ name: string; barcode: string | null }>('master_products', `id=eq.${seed.master_product_id}&select=name,barcode`);
    expect(m[0].name).toBe(MASTER);
    expect(m[0].barcode).toBe(MASTER_BARCODE); // el barcode contradictorio NO se escribió
  });

  // ═══ §11.11 · Nombre vacío en producto nuevo: rechaza la creación ═══
  test('11 · nombre vacío en producto nuevo — rechazado con motivo explícito', async () => {
    const S = sku('E11');
    const c = await classify(adminToken, storeA, [row(S, '')]);
    expect(c.rows[0].status).toBe('error');
    expect((c.rows[0].reasons || []).some(x => x.includes('ERR_PRODUCT_WITHOUT_NAME'))).toBe(true);

    const res = await resolve(adminToken, storeA, [row(S, '')]);
    expect(res.summary.masters_created).toBe(0);
    expect(res.summary.blocked).toBe(1);
    const masters = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S}&select=id`);
    expect(masters.length).toBe(0); // nada creado
  });

  // ═══ §11.12 · Maestro con nombre incompleto: el Excel NO lo repara ═══
  test('12 · maestro con nombre incompleto — el Excel no lo repara silenciosamente', async () => {
    const S = sku('E12');
    const INCOMPLETE = 'ABR-';
    const seed = await seedMasterAndLocal(storeA, S, INCOMPLETE);

    const c = await classify(adminToken, storeA, [row(S, 'ABRAZADERA COMPLETA INOXIDABLE 3/4')]);
    expect(c.rows[0].status).toBe('identified');
    expect(c.rows[0].effective_name).toBe(INCOMPLETE); // autoridad del maestro vigente
    await resolve(adminToken, storeA, [row(S, 'ABRAZADERA COMPLETA INOXIDABLE 3/4')]);

    // El nombre incompleto del maestro permanece: la recepción no edita el catálogo.
    expect(await masterName(seed.master_product_id)).toBe(INCOMPLETE);
    expect((await localProduct(storeA, S))!.name).toBe(INCOMPLETE);
  });

  // ═══ §11.14/§11.15 · Costos, precios y stock intactos durante la resolución ═══
  test('15 · resolver el nombre NO toca costos, precios ni stock de la fila existente', async () => {
    const S = sku('E15');
    const MASTER = 'GRAPAS 10X1 OFICIALES';
    const seed = await seedMasterAndLocal(storeA, S, MASTER);
    const before = await localProduct(storeA, S);
    expect(before).toBeTruthy();

    await resolve(adminToken, storeA, [row(S, 'Grapas 10x1 economicas', 7, 2.5, 9)]);

    const after = await localProduct(storeA, S);
    expect(after!.cost_price).toBe(before!.cost_price);
    expect(after!.price).toBe(before!.price);
    expect(after!.stock_current).toBe(before!.stock_current);
    expect(after!.cost_average).toBe(before!.cost_average);
    expect(after!.name).toBe(MASTER);
    expect(await masterName(seed.master_product_id)).toBe(MASTER);
    void seed;
  });

  // ═══ §11.16 · Fallo en la importación: sin cambios parciales de nombres ═══
  test('16 · fallo de una fila del lote — sin cambios parciales de nombres', async () => {
    const S_OK = sku('E16A');
    const MASTER_OK = 'ALAMBRE RECOCIDO 18 OFICIAL';
    const S_BAD = sku('E16B');
    const seed = await seedMasterAndLocal(storeA, S_OK, MASTER_OK);

    // Lote mixto: fila válida identificada + fila con costo inválido (error B4).
    const res = await resolve(adminToken, storeA, [
      row(S_OK, 'Alambre recocido nº18'),
      row(S_BAD, 'Producto con costo invalido', 5, -3),
    ]);
    expect(res.summary.identified).toBe(1);
    expect(res.summary.blocked).toBe(1);
    expect(res.summary.masters_created).toBe(0);

    // La fila fallida NO dejó escrituras parciales de nombres ni productos.
    expect(await masterName(seed.master_product_id)).toBe(MASTER_OK);
    expect((await localProduct(storeA, S_OK))!.name).toBe(MASTER_OK);
    const bad = await localProduct(storeA, S_BAD);
    expect(bad).toBeNull();
    const badMaster = await sb.select('master_products', `tenant_id=eq.${tenantId}&sku=eq.${S_BAD}&select=id`);
    expect(badMaster.length).toBe(0);
  });

  // ═══ TEST ESPECÍFICO §11 — captura de CUALQUIER UPDATE no autorizado ═══
  test('17 · TEST ESPECÍFICO: cero UPDATEs no autorizados de master_products.name en el flujo completo', async () => {
    // Instantánea ANTES del ciclo completo de importación.
    const before = await snapshotMasterNames();
    expect(before.size).toBeGreaterThanOrEqual(7); // maestros sembrados en 01-12/15-16

    // CICLO COMPLETO: clasificar + resolver (A/B/C/D) + registrar recepción.
    const S_EXIST = sku('E01');
    const S_NEW = sku('E17');
    await classify(adminToken, storeA, [row(S_EXIST, 'Abrazadera 3/4 otra variante')]);
    const r = await resolve(adminToken, storeA, [
      row(S_EXIST, 'Abrazadera 3/4 otra variante'),
      row(S_NEW, 'PRODUCTO CICLO COMPLETO 17'),
    ]);
    expect(r.summary.masters_created).toBe(1);
    const reg = await registerReception(adminToken, storeA, [
      { product_id: r.results.find(x => x.sku === S_EXIST)!.product_id, quantity: 4, unit_cost: 6 },
      { product_id: r.results.find(x => x.sku === S_NEW)!.product_id, quantity: 2, unit_cost: 10 },
    ], `RNAU-17-${SFX}`);
    expect(reg.ok).toBe(true);

    // Instantánea DESPUÉS: los maestros PREEXISTENTES conservan su nombre exacto.
    const after = await snapshotMasterNames();
    for (const [id, nameBefore] of before) {
      expect(after.get(id)).toBe(nameBefore); // ningún cambio de nombre
    }
    // El ÚNICO maestro nuevo es el de la clase D (nombre inicial del Excel).
    const newMaster = await sb.select<{ name: string }>(
      'master_products', `tenant_id=eq.${tenantId}&sku=eq.${S_NEW}&select=name`,
    );
    expect(newMaster[0].name).toBe('PRODUCTO CICLO COMPLETO 17');

    // master_change_log: entradas 'name' SOLO como CREACIÓN (old_value=NULL) de
    // maestros nuevos; cero entradas de renombrado de maestros preexistentes.
    const log = await sb.select<{ master_product_id: string; field: string; old_value: string | null; new_value: string | null }>(
      'master_change_log', `tenant_id=eq.${tenantId}&field=eq.name&new_value=not.eq.&order=created_at.desc&limit=200`,
    );
    for (const entry of log) {
      if (before.has(entry.master_product_id)) {
        // Maestro preexistente: CUALQUIER entrada 'name' durante el ciclo sería
        // un renombrado no autorizado — el maestro conserva su nombre original.
        expect(entry.new_value).toBe(before.get(entry.master_product_id));
      } else {
        // Maestro creado en el ciclo: la única entrada válida es la CREACIÓN.
        expect(entry.old_value).toBeNull();
      }
    }
  });

  // ═══ §11.8bis · Tienda NO conectada: alta local histórica intacta (control) ═══
  test('18 · control: tienda NO conectada — alta local con su nombre (sin maestro)', async () => {
    const S = sku('E18');
    const c = await classify(adminToken, storeC, [row(S, 'Producto Local Sin Catalogo')]);
    expect(c.catalog_connected).toBe(false);
    expect(c.rows[0].status).toBe('new_local');
    expect(c.rows[0].effective_name).toBe('Producto Local Sin Catalogo');

    // La recepción legacy crea la fila local con el nombre del alta (no hay maestro).
    const reg = await registerReception(adminToken, storeC, [
      { new_product: { sku: S, name: 'Producto Local Sin Catalogo', cost_price: 2, price: 5, unit_of_measure: 'unidad', is_complete: true }, quantity: 3, unit_cost: 2 },
    ], `RNAU-18-${SFX}`);
    expect(reg.ok).toBe(true);
    const local = await localProduct(storeC, S);
    expect(local!.name).toBe('Producto Local Sin Catalogo');
  });

  // ═══ §6/§7 · UI: previsualización con el nombre oficial como principal ═══
  test('19 · UI — previsualización muestra el nombre oficial del maestro como principal', async ({ page }) => {
    const S = sku('E19');
    const MASTER = 'MARTILLO CARPINTERO 16OZ OFICIAL';
    const EXCEL = 'martillo 16 oz';
    await seedMasterAndLocal(storeA, S, MASTER);

    // Login UI REAL: el CTA «Entrar a COSTPRO» (data-testid path-costpro) abre
    // el modal de login (auth-recovery asíncrona) → esperas explícitas.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    if (!(await page.getByText('OPERACIÓN', { exact: true }).first().isVisible().catch(() => false))) {
      await page.getByTestId('path-costpro').first().click();
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: 20_000 });
      await emailInput.fill(process.env.E2E_ADMIN_EMAIL!);
      await page.locator('input[type="password"]').first().fill(process.env.E2E_ADMIN_PASS!);
      await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
      await page.getByText('OPERACIÓN', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
      const cookie = page.getByText('Aceptar todas', { exact: false }).first();
      if (await cookie.count() && await cookie.isVisible().catch(() => false)) { await cookie.click(); await page.waitForTimeout(800); }
    }
    await page.getByText('OPERACIÓN', { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.getByText('Almacén', { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.getByText('Inventario', { exact: true }).first().click();
    await page.waitForTimeout(4000);
    await page.getByRole('button', { name: /Nueva Recepción/i }).first().click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Importar Excel/i }).first().click();
    await page.waitForTimeout(1000);

    // Genera un Excel real (mismas cabeceras que parsea el wizard).
    const XLSX = await import('@e965/xlsx');
    const ws = XLSX.utils.json_to_sheet([
      { 'SKU': S, 'Nombre': EXCEL, 'Cantidad': 5, 'Costo Unitario': 8, 'Unidad de Medida': 'unidad', 'Precio Venta': 0 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recepcion');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    await page.locator('#reception-import-file').setInputFiles({
      name: `rna-${SFX}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf,
    });
    // Clasificación backend + render de la previsualización.
    await page.waitForTimeout(6000);

    // §6: el nombre OFICIAL es el principal y más visible.
    await expect(page.getByText(MASTER).first()).toBeVisible();
    // §6: la diferencia se informa sin ser error (solo cuando difieren).
    await expect(page.getByText(`Nombre recibido en Excel: «${EXCEL}»`).first()).toBeVisible();
    await expect(page.getByText(/Se utilizará el nombre oficial del Catálogo Maestro/).first()).toBeVisible();
    // Evidencia gráfica de la previsualización §6 (expediente de la misión).
    await page.screenshot({ path: 'audit-evidence/cp-reception-name-authority-001/preview-nombre-oficial.png', fullPage: true });
    // §7 (nombre de la línea canónica tras confirmar) queda demostrado por el
    // E2E backend (test 02: receipt_items → products.name) y por los tests del
    // helper effectiveImportName — aquí la evidencia UI es la PREVISUALIZACIÓN.
  });
});
