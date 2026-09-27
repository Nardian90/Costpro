/**
 * SESSION FIXTURE E2E — CostPro (FASE E2E-80)
 * ============================================================================
 * Helpers compartidos para los specs E2E nuevos:
 *
 *   - signIn()           → sesión real contra Supabase Auth (REST)
 *   - apiHeaders()       → headers Authorization Bearer + Origin (CSRF)
 *   - injectSession()    → inyecta sesión Supabase en localStorage del browser
 *                          (patrón ya validado en reverse-duplicate-ui.spec.ts)
 *   - signInViaUI()      → login REAL mediante el formulario de la app
 *   - sb.service*()      → acceso REST con SERVICE_ROLE: SOLO para seeding de
 *                          datos de prueba, verificación de estado persistido
 *                          (integridad) y cleanup. Los flujos probados pasan
 *                          por la API real de la app — nunca se bypasea.
 *   - createTestStore()  → tienda aislada vía POST /api/stores (flujo real)
 *   - seedProduct()      → producto + inventory conocidos (setup determinista)
 *
 * NOTA sobre mocks: este fixture NO intercepta ni mockea nada. Todas las
 * operaciones de negocio bajo prueba viajan Browser/UI → API → RPC → DB real.
 * ============================================================================
 */
import { type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Exportados para que los specs repliquen llamadas RPC igual que el browser */
export const SUPABASE_REST_URL = SUPABASE_URL;
export const SUPABASE_ANON = ANON_KEY;

/**
 * Invoca un RPC de Supabase exactamente como lo hace el cliente del browser
 * (supabase.rpc → POST /rest/v1/rpc/<name> con Bearer del usuario).
 */
export async function rpcAsUser<T = any>(name: string, token: string, params: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let data: any = null;
  let error: string | null = null;
  try {
    data = JSON.parse(text);
    if (typeof data === 'object' && data && 'message' in data && !res.ok) {
      error = String((data as any).message);
      data = null;
    }
  } catch {
    error = text.slice(0, 200);
  }
  return { ok: res.ok, status: res.status, data, error };
}
export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@costpro.com';
export const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123';
export const CLERK_EMAIL = process.env.E2E_USER_EMAIL || 'cajero@demo.com';
export const CLERK_PASS = process.env.E2E_USER_PASS || 'demo123';

/** Sufijo único para datos de prueba (evita colisiones entre ejecuciones) */
export function testSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Autenticación ───────────────────────────────────────────────────────────

export interface Session { token: string; userId: string; email: string; }

/** Inicia sesión real contra Supabase Auth (password grant) */
export async function signIn(email: string, password: string): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`signIn falló para ${email}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { token: data.access_token, userId: data.user.id, email };
}

/** Headers para llamadas API autenticadas (Bearer + Origin para CSRF) */
export function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Origin: BASE_URL,
  };
}

/** Inyecta la sesión de Supabase en localStorage (restaura sesión real) */
export async function injectSession(page: Page, session: Session): Promise<void> {
  const projectRef = SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || '';
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionData = JSON.stringify({
    access_token: session.token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'mock-refresh',
    user: { id: session.userId, email: session.email },
  });
  await page.addInitScript(([key, val]) => {
    window.localStorage.setItem(key, val);
  }, [storageKey, sessionData]);
}

/**
 * Login REAL mediante el formulario de la aplicación (/?login=1).
 * Valida el flujo completo: UI → Supabase Auth → profile → shell autenticado.
 */
export async function signInViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/?login=1');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  // El shell autenticado renderiza el sidebar con "Cerrar sesión"
  await page.locator('[aria-label="Cerrar sesión"]').first().waitFor({ state: 'visible', timeout: 30_000 });
}

/** Cierra sesión desde la UI (botón del sidebar) */
export async function signOutViaUI(page: Page): Promise<void> {
  await page.locator('[aria-label="Cerrar sesión"]').first().click();
}

/**
 * Descarta el banner de consentimiento de cookies si está presente.
 * El banner (fixed, z-50) intercepta los pointer events de elementos del
 * sidebar inferior (p.ej. "Cerrar sesión") → debe descartarse antes de
 * interactuar con la UI autenticada.
 */
export async function dismissCookieConsent(page: Page): Promise<void> {
  const banner = page.locator('[aria-label="Consentimiento de cookies"]');
  if (await banner.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.locator('[aria-label="Rechazar cookies opcionales"]').click().catch(() => {});
    await banner.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

// ── Supabase service-role REST (seeding / verificación / cleanup) ───────────

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

export const sb = {
  /** SELECT con service-role (verificación de estado persistido) */
  async select<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
    const res = await svc('GET', `/${table}?${query}`);
    if (!res.ok) throw new Error(`sb.select ${table} falló: ${res.status} ${await res.text()}`);
    return res.json();
  },

  /** INSERT con service-role (seeding determinista) */
  async insert<T = Record<string, unknown>>(table: string, rows: unknown): Promise<T[]> {
    const res = await svc('POST', `/${table}`, rows);
    if (!res.ok) throw new Error(`sb.insert ${table} falló: ${res.status} ${await res.text()}`);
    return res.json();
  },

  /** PATCH con service-role (ajustes de setup) */
  async update(table: string, query: string, patch: unknown): Promise<void> {
    const res = await svc('PATCH', `/${table}?${query}`, patch);
    if (!res.ok) throw new Error(`sb.update ${table} falló: ${res.status} ${await res.text()}`);
  },

  /** DELETE con service-role (cleanup de datos de prueba) */
  async delete(table: string, query: string): Promise<void> {
    const res = await svc('DELETE', `/${table}?${query}`);
    if (!res.ok) throw new Error(`sb.delete ${table} falló: ${res.status}`);
  },
};

// ── Datos de prueba deterministas ───────────────────────────────────────────

export interface TestStore { id: string; name: string; slug: string; }

/**
 * Crea una tienda aislada para el spec vía la API REAL (POST /api/stores,
 * RPC create_store_with_membership → membership admin automática).
 * Cleanup: soft-delete vía DELETE /api/stores en afterAll del spec.
 */
export async function createTestStore(
  request: import('@playwright/test').APIRequestContext,
  adminToken: string,
  label: string,
): Promise<TestStore> {
  const suffix = testSuffix();
  const payload = {
    name: `E2E80 ${label} ${suffix}`,
    address: `Calle Test ${suffix}`,
    phone: '+5355550000',
    email: `e2e80-${suffix}@costpro.test`,
    slug: `e2e80_${label.toLowerCase().replace(/\s+/g, '_')}_${suffix}`,
    plantilla: 'construccion',
  };
  // Higiene: archivar tiendas E2E80 huérfanas de ejecuciones fallidas
  // (evita agotar el límite de tiendas activas del tenant).
  await sb.update('stores', 'name=like.E2E80*', { is_active: false, is_archived: true }).catch(() => {});

  const res = await request.post('/api/stores', {
    headers: apiHeaders(adminToken),
    data: payload,
  });
  if (!res.ok()) {
    throw new Error(`createTestStore falló: ${res.status()} ${await res.text()}`);
  }
  const json = await res.json();
  // Respuesta real: { data: { success, store_id, tenant_id } }
  const id = json?.data?.store_id ?? json?.data?.id ?? json?.store_id;
  if (!id) {
    throw new Error(`createTestStore: respuesta sin store_id — ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { id, name: payload.name, slug: json?.data?.slug ?? payload.slug };
}

/** Soft-delete de la tienda de prueba (cleanup) */
export async function deleteTestStore(
  request: import('@playwright/test').APIRequestContext,
  adminToken: string,
  storeId: string,
): Promise<void> {
  await request.delete('/api/stores', {
    headers: apiHeaders(adminToken),
    data: { storeId },
  }).catch(() => {});
}

export interface SeededProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  initialStock: number;
}

/**
 * Siembra un producto con stock conocido en una tienda de prueba.
 * Es SETUP de datos (no el flujo bajo prueba): las operaciones posteriores
 * (venta, ajuste, transferencia…) pasan por la API/RPC real de la app.
 */
export async function seedProduct(
  store: TestStore,
  opts: { name: string; price: number; cost: number; quantity: number; sku?: string },
): Promise<SeededProduct> {
  const sku = opts.sku ?? `E2E80-${testSuffix()}`;
  const [product] = await sb.insert<{ id: string }>('products', [{
    store_id: store.id,
    name: opts.name,
    description: `Producto E2E ${opts.name}`,
    sku,
    price: opts.price,
    cost_price: opts.cost,
    category: 'E2E',
    unit_of_measure: 'unidad',
    supplier: 'E2E Supplier',
    is_active: true,
    status: 'ACTIVE',
    price_currency: 'CUP',
    stock_current: opts.quantity,
    cost_average: opts.cost,
    min_stock: 1, // check constraint products_min_stock_check exige > 0
  }]);
  await sb.insert('inventory', [{
    store_id: store.id,
    product_id: product.id,
    quantity: opts.quantity,
    low_stock_threshold: 0,
    version: 1,
  }]);
  return { id: product.id, name: opts.name, sku, price: opts.price, cost: opts.cost, initialStock: opts.quantity };
}

/** Lee el estado de inventario actual (quantity + versión) */
export async function getInventory(storeId: string, productId: string) {
  const rows = await sb.select<{ quantity: number; version: number }>(
    'inventory',
    `store_id=eq.${storeId}&product_id=eq.${productId}&select=quantity,version`,
  );
  if (rows.length === 0) return null;
  return rows[0];
}

/** Lee los movimientos de stock de un producto */
export async function getStockMovements(storeId: string, productId: string) {
  return sb.select('stock_movements', `store_id=eq.${storeId}&product_id=eq.${productId}&select=*&order=created_at.asc`);
}

/** Lee una transacción (venta) por id */
export async function getTransaction(id: string) {
  const rows = await sb.select('transactions', `id=eq.${id}&select=*&limit=1`);
  return rows[0] ?? null;
}

/** Lee los items de una transacción */
export async function getTransactionItems(transactionId: string) {
  return sb.select('transaction_items', `transaction_id=eq.${transactionId}&select=*&order=created_at.asc`);
}

/** Limpia los artefactos de datos de un spec (productos + inventario) */
export async function cleanupProducts(storeId: string, productIds: string[]): Promise<void> {
  for (const pid of productIds) {
    await sb.delete('inventory', `store_id=eq.${storeId}&product_id=eq.${pid}`).catch(() => {});
    await sb.delete('stock_movements', `store_id=eq.${storeId}&product_id=eq.${pid}`).catch(() => {});
  }
  if (productIds.length > 0) {
    const list = productIds.map((id) => `"${id}"`).join(',');
    await sb.delete('products', `id=in.(${list})`).catch(() => {});
  }
}

// ── Assertion helpers ───────────────────────────────────────────────────────

export function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

/** Convierte posibles valores null/undefined de Supabase en número seguro */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
