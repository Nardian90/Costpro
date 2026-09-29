/**
 * ENTORNO PILOTO MULTI-TIENDA — CostPro (SEC-TS-08)
 * ============================================================================
 * Resolución del entorno piloto dedicado a E2E DENTRO del proyecto Supabase
 * actual (arquitectura decidida: NO nueva BD, NO nuevo proyecto).
 *
 *   SUPABASE ACTUAL
 *         │
 *   ├── ENTORNO OPERATIVO (NO TOCAR POR E2E)
 *   │     ├── TIENDA CENTRAL COSTPRO
 *   │     ├── Puerto Padre VITALLCONS
 *   │     └── ENERVIDA-VITALLCONS
 *   │
 *   └── ENTORNO PILOTO MULTI-TIENDA E2E (dedicado)
 *         ├── PILOT STORE A  (origen / venta / inventario / transferencia)
 *         ├── PILOT STORE B  (destino / venta / inventario / recepción)
 *         └── + tiendas efímeras E2E80-* (flujos aislados, auto-cleanup)
 *
 * Las tiendas A y B se provisionan UNA VEZ (ver e2e/scripts/provision-pilot-env.cjs)
 * y persisten entre corridas. Este módulo SOLO las resuelve (SELECT) y siembra
 * el producto de referencia determinista si faltara (setup idempotente).
 *
 * FAIL-CLOSED: si el entorno piloto no está provisionado, global-setup aborta
 * con instrucciones exactas — NUNCA cae hacia atrás a una tienda real.
 * ============================================================================
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: './.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Nombres exactos e inmutables de las tiendas piloto dedicadas.
 *  ⚠️ SEC-TS-09: 'E2E PILOT *' SÍ colisiona con el patrón de higiene
 *  'E2E *' del sweep de createTestStore (PostgREST traduce '*'→'%').
 *  El sweep ahora las excluye por nombre exacto (pilotGuard en
 *  session.fixture.ts) — mantener ambos en sincronía al renombrar. */
export const PILOT_A_NAME = 'E2E PILOT A CostPro';
export const PILOT_B_NAME = 'E2E PILOT B CostPro';

/** SKU determinista del producto de referencia en cada tienda piloto. */
export const PILOT_SKU_A = 'E2E-PILOT-A-001';
export const PILOT_SKU_B = 'E2E-PILOT-B-001';

export interface PilotStore { id: string; name: string; }
export interface PilotEnv {
  storeA: PilotStore;
  storeB: PilotStore;
  productA: string; // producto de referencia en A (E2E_TEST_PRODUCT_ID)
  productB: string; // producto de referencia en B (E2E_TEST_FOREIGN_PRODUCT_ID)
}

const PROVISION_HINT =
  '  Acción requerida (SEC-TS-08, post-autorización):\n' +
  '    node e2e/scripts/provision-pilot-env.cjs\n' +
  '  (crea las dos tiendas dedicadas vía la API real; ver SEC-TS-08 GATE 18)';

function svc(method: string, path: string, body?: unknown) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: body ? 'return=representation' : 'count=exact',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function findStoreByName(name: string): Promise<PilotStore | null> {
  const res = await svc('GET', `/stores?name=eq.${encodeURIComponent(name)}&select=id,name,is_active,is_archived&limit=5`);
  if (!res.ok) return null;
  const rows: Array<{ id: string; name: string; is_active: boolean; is_archived: boolean }> = await res.json();
  // Válida: activa y no archivada (una tienda archivada no es piloto usable)
  const valid = rows.find((r) => r.is_active && !r.is_archived);
  return valid ? { id: valid.id, name: valid.name } : null;
}

/** Producto de referencia determinista por SKU; lo siembra si no existe (idempotente). */
async function ensurePilotProduct(store: PilotStore, sku: string, label: 'A' | 'B', seedQty = 100): Promise<string> {
  const sel = await svc('GET', `/products?sku=eq.${sku}&store_id=eq.${store.id}&select=id&limit=1`);
  if (sel.ok) {
    const rows: Array<{ id: string }> = await sel.json();
    if (rows.length > 0 && rows[0].id) return rows[0].id;
  }
  // Seed determinista (service-role, patrón E2E-80 seedProduct)
  const ins = await svc('POST', '/products', [{
    store_id: store.id,
    name: `Producto Piloto ${label}`,
    description: 'Producto de referencia del entorno piloto E2E (SEC-TS-08)',
    sku,
    price: 100,
    cost_price: 60,
    category: 'E2E',
    unit_of_measure: 'unidad',
    supplier: 'E2E Pilot Supplier',
    is_active: true,
    status: 'ACTIVE',
    price_currency: 'CUP',
    stock_current: seedQty,
    cost_average: 60,
    min_stock: 1, // check constraint products_min_stock_check exige > 0
  }]);
  if (!ins.ok) throw new Error(`[pilot-env] No se pudo sembrar el producto piloto (${sku}): HTTP ${ins.status}`);
  const created: Array<{ id: string }> = await ins.json();
  const productId = created[0]?.id;
  if (!productId) throw new Error('[pilot-env] Seed de producto piloto sin id en respuesta');
  await svc('POST', '/inventory', [{
    store_id: store.id,
    product_id: productId,
    quantity: seedQty,
    low_stock_threshold: 0,
    version: 1,
  }]).catch(() => {});
  return productId;
}

let cached: PilotEnv | null = null;

/**
 * Resuelve el ENTORNO PILOTO MULTI-TIENDA (fail-closed).
 * Lanza error con instrucciones si A o B no existen — NUNCA degrada a tiendas
 * reales/operativas. La resolución es por NOMBRE EXACTO dentro del Supabase
 * actual: no hay IDs hardcodeados (robusto ante re-provisionamiento).
 */
export async function getPilotEnv(): Promise<PilotEnv> {
  if (cached) return cached;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('[pilot-env] Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  const storeA = await findStoreByName(PILOT_A_NAME);
  const storeB = await findStoreByName(PILOT_B_NAME);
  if (!storeA || !storeB) {
    const missing = [!storeA && PILOT_A_NAME, !storeB && PILOT_B_NAME].filter(Boolean).join(' + ');
    throw new Error(
      `[global-setup] ENTORNO PILOTO MULTI-TIENDA no provisionado: faltan ${missing}.\n` +
      'Los specs E2E NO deben operar sobre tiendas reales (SEC-TS-08: Tienda Central / ' +
      `Puerto Padre / Enervida quedan fuera del banco de pruebas).\n${PROVISION_HINT}`,
    );
  }
  const productA = await ensurePilotProduct(storeA, PILOT_SKU_A, 'A');
  const productB = await ensurePilotProduct(storeB, PILOT_SKU_B, 'B');
  cached = { storeA, storeB, productA, productB };
  return cached;
}
