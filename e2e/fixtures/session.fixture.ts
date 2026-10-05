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
import { PILOT_A_NAME, PILOT_B_NAME } from './pilot-env';
import { getRunId, getRunTenantId } from './run-env';
import { hardDeleteTestStore } from './hard-cleanup';

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
// E2E-RUNNER-ISOLATION: plantel demo completo por-run (roles-permissions).
// Defaults legacy = usuarios demo compartidos; en modo aislado el
// global-setup exporta las variables por-run antes de lanzar los workers.
export const WAREHOUSE_EMAIL = process.env.E2E_WAREHOUSE_EMAIL || 'almacen@demo.com';
export const WAREHOUSE_PASS = process.env.E2E_WAREHOUSE_PASS || 'demo123';
export const ENCARGADO_EMAIL = process.env.E2E_ENCARGADO_EMAIL || 'encargado@demo.com';
export const ENCARGADO_PASS = process.env.E2E_ENCARGADO_PASS || 'demo123';
export const ENCARGADO_ID = process.env.E2E_ENCARGADO_ID || 'e2222222-2222-2222-2222-222222222222';

/** Sufijo único para datos de prueba (evita colisiones entre ejecuciones) */
export function testSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Autenticación ───────────────────────────────────────────────────────────

export interface Session { token: string; userId: string; email: string; refreshToken?: string; }

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
  // SEC-TS-10: conservar el refresh_token REAL para que la sesión inyectada
  // en el browser pueda auto-sanarse vía supabase-js si el access_token es
  // revocado a mitad de corrida (signOut global de un spec UI previo).
  return { token: data.access_token, userId: data.user.id, email, refreshToken: data.refresh_token };
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
    // SEC-TS-10: refresh_token REAL cuando está disponible (signIn) para que
    // supabase-js pueda refrescar la sesión en el browser. El placeholder
    // 'mock-refresh' solo se usa si el caller no tiene refresh_token.
    refresh_token: session.refreshToken || 'mock-refresh',
    user: { id: session.userId, email: session.email },
  });
  // SEC-TS-10: pre-sembrar el consentimiento de cookies (mismo formato que
  // src/lib/consent.ts) para que el banner GDPR no renderice durante los
  // tests — su [role="dialog"] interfieren con selectores de modales
  // (strict-mode violations) y pueden interceptar clicks.
  const consentData = JSON.stringify({
    essential: true,
    analytics: false,
    functional: true,
    marketing: false,
    timestamp: new Date().toISOString(),
    version: '1.0',
  });
  await page.addInitScript(([k, v, ck, cv]) => {
    window.localStorage.setItem(k, v);
    window.localStorage.setItem(ck, cv);
  }, [storageKey, sessionData, 'costpro_cookie_consent', consentData]);
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
  // E2E-RUNNER-ISOLATION: el nombre incorpora la identidad del run —
  // dos runners simultáneos nunca colisionan en nombre/slug ni se
  // disputan los mismos fixtures (el sweep queda además acotado al tenant).
  const runId = getRunId();
  const name = runId ? `E2E80 ${runId} ${label} ${suffix}` : `E2E80 ${label} ${suffix}`;
  const payload = {
    name,
    address: `Calle Test ${suffix}`,
    phone: '+5355550000',
    email: `e2e80-${suffix}@costpro.test`,
    slug: `e2e80_${label.toLowerCase().replace(/\s+/g, '_')}_${suffix}`,
    plantilla: 'construccion',
  };
  // Higiene: archivar tiendas de PRUEBA huérfanas de ejecuciones fallidas
  // (evita agotar el límite de tiendas activas del tenant). Solo tiendas
  // creadas hace >10 min → nunca archiva stores del run actual.
  // Patrones de artefactos de test de fases previas (audit-evidence/):
  // E2E80* (esta iniciativa), ESEC TEST*, FASE-D TEST*, AUDIT *, HOT *Test*,
  // REM-F4* FIXTURE*, E2E2-*. Las tiendas de negocio reales nunca coinciden.
  //
  // SEC-TS-09 (bug fix): el patrón 'E2E *' (PostgREST traduce '*'→'%')
  // TAMBIÉN matchea las tiendas piloto persistentes 'E2E PILOT A/B CostPro'
  // (SEC-TS-08) una vez superados los 10 min de antigüedad → el sweep las
  // archivaba y la CORRIDA SIGUIENTE abortaba en global-setup (fail-closed).
  // Guard: excluir SIEMPRE las dos tiendas piloto por nombre exacto.
  await sweepStaleTestStores();

  // SEC-TS-10: pacear creación dentro del presupuesto 5/min de la API
  await waitStoreBudget('create');
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

/**
 * Restaura el active_store del admin a la tienda piloto tras un spec UI que
 * lo cambió (evita dejar el perfil apuntando a una tienda de test eliminada,
 * lo que rompe vistas dependientes del store activo en specs posteriores).
 * E2E-RUNNER-ISOLATION: en modo aislado el global-setup exporta
 * E2E_RESTORE_ACTIVE_STORE_ID = PILOT A del RUN (nunca el ID compartido) —
 * cada runner restaura el active_store de SU usuario a SU tienda. El
 * hardcode legacy (Puerto Padre) solo aplica en modo compartido.
 */
export const PILOT_STORE_ID = process.env.E2E_RESTORE_ACTIVE_STORE_ID || '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1'; // Puerto Padre (legacy compartido)
export async function restoreActiveStore(userId: string): Promise<void> {
  await sb.update('profiles', `id=eq.${userId}`, { active_store_id: PILOT_STORE_ID }).catch(() => {});
}

/**
 * SEC-TS-10 (FIXTURE): presupuesto de rate-limit para /api/stores.
 * ============================================================================
 * La API real limita (ventana fija 60s, por usuario+IP, ver
 * src/app/api/stores/route.ts):
 *   POST   5 creaciones/min · DELETE 3 borrados/min · PATCH 10/min
 * El reset de tienda limita a 2/min (src/app/api/stores/reset/route.ts).
 *
 * En una corrida FULL los specs en ráfaga (sobre todo cuando otros tests
 * fallan instantáneo) exceden el presupuesto → 429 → cleanups fallan en
 * silencio → tiendas huérfanas ACTIVAS acumulan → cuota activa del plan
 * (10) agotada → 403 en cascada sobre TODA creación posterior.
 *
 * waitStoreBudget() pacea ANTES de cada llamada para garantizar ≤budget
 * en cualquier ventana de 60s (rolling ≤ fixed window: siempre seguro).
 * NO modifica límites de la app: la suite respeta el contrato publicado.
 */
const STORE_BUDGETS: Record<string, { maxPerMin: number; envKey: string }> = {
  // e2e-incremental-stabilization (cert c5b): el budget del worker NO ve los
  // 2 POSTs de pilotos A/B del aprovisionamiento (run-env corre en otro
  // proceso → su consumo sólo existe server-side). Budget 4 + headroom 2
  // = 6 > límite server 5 → 429 garantizado en el 4.º POST paceado.
  // Budget 3: server ve ≤ 2 pilotos + 3 spec = 5 = exactamente el límite.
  create: { maxPerMin: 3, envKey: 'E2E_BUDGET_CREATE' }, // límite API: 5/min (−2 pilotos aprovisionamiento)
  delete: { maxPerMin: 2, envKey: 'E2E_BUDGET_DELETE' }, // límite API: 3/min (margen 1)
  patch: { maxPerMin: 8, envKey: 'E2E_BUDGET_PATCH' },   // límite API: 10/min (margen 2)
  reset: { maxPerMin: 2, envKey: 'E2E_BUDGET_RESET' },   // límite API: 2/min (exacto)
  get: { maxPerMin: 25, envKey: 'E2E_BUDGET_GET' },      // límite API: 30/min (margen 5)
};

/**
 * SEC-TS-10: los timestamps se persisten en process.env (JSON) porque cada
 * spec file recibe un registro de módulos FRESCO dentro del mismo worker
 * process (workers=1) — el estado module-level NO sobrevive entre specs, y
 * el rate-limit de la API es GLOBAL al usuario+IP. Sin persistencia, el
 * pacing de un spec no ve las llamadas del spec anterior → 429 en cascada
 * (reproducido: 6× 429 en multi-store durante la corrida #4).
 */
function loadBudgetTimes(envKey: string): number[] {
  try {
    const raw = process.env[envKey];
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as number[]) : [];
  } catch {
    return [];
  }
}

function saveBudgetTimes(envKey: string, times: number[]): void {
  try {
    process.env[envKey] = JSON.stringify(times);
  } catch {
    // no-op
  }
}

export async function waitStoreBudget(kind: keyof typeof STORE_BUDGETS): Promise<void> {
  const b = STORE_BUDGETS[kind];
  if (!b) return;
  const now = Date.now();
  let times = loadBudgetTimes(b.envKey).filter((t) => now - t < 60_000);
  if (times.length >= b.maxPerMin) {
    // Esperar a que la llamada más antigua del presupuesto salga de la ventana
    // Buffer 2s (antes 500ms): la ventana del server se ancla cuando EL
    // SERVER procesa el 1er POST (δ de cola/compilación del dev server),
    // no cuando el cliente registra el timestamp. Con δ>500ms el POST
    // paceado llegaba antes de la expiración real → 429 (reproducido en
    // lote 7 de e2e-incremental-stabilization, store-reset test 7).
    const waitMs = 60_000 - (now - times[0]) + 2_000;
    await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));
    const after = Date.now();
    times = loadBudgetTimes(b.envKey).filter((t) => after - t < 60_000);
  }
  times.push(Date.now());
  saveBudgetTimes(b.envKey, times);
}

/**
 * SEC-TS-10 (compartido): sweep de higiene — archiva tiendas de PRUEBA
 * huérfanas (>10 min) para liberar cuota de tiendas activas del tenant
 * (plan enterprise: 10 · ver checkStoreQuota). Guard de pilotos A/B.
 * Extraído de createTestStore para que TODOS los helpers locales de specs
 * (multi-store, store-reset, store-lifecycle, stores-crud) lo invoquen —
 * sin esto, una corrida que deja huérfanas satura la cuota y la corrida
 * siguiente recibe 403 en cascada desde su primer POST (reproducido en el
 * re-run mini del run focalizado).
 *
 * E2E-RUNNER-ISOLATION: en modo aislado el barrido queda ACOTADO al tenant
 * del run (env E2E_RUN_TENANT_ID). Un runner NUNCA archiva tiendas de otro
 * runner concurrente — su tenant es otro y queda fuera del filtro. En modo
 * legacy (sin tenant) se conserva el comportamiento global original.
 */
export async function sweepStaleTestStores(): Promise<void> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const pilotGuard = `&name=neq.${encodeURIComponent(PILOT_A_NAME)}&name=neq.${encodeURIComponent(PILOT_B_NAME)}`;
  const tenantScope = getRunTenantId() ? `&tenant_id=eq.${getRunTenantId()}` : '';
  const patterns = ['E2E80*', 'E2E *', 'ESEC TEST*', 'FASE-D TEST*', 'AUDIT *', 'HOT *', 'REM-F4*', 'E2E2-*'];
  for (const pat of patterns) {
    // E2E DATA HYGIENE: el sweep anterior ARCHIVABA (la semántica que causó
    // 2600+ residuos). Ahora hace HARD delete de las tiendas de prueba
    // huérfanas (>10 min) — liberan cuota REAL y no permanecen como filas.
    const rows = await sb
      .select<{ id: string; name: string }>('stores', `select=id,name&name=like.${pat.replace(/ /g, '%20')}${tenantScope}&created_at=lt.${tenMinAgo}${pilotGuard}&limit=50`)
      .catch(() => [] as Array<{ id: string; name: string }>);
    for (const r of rows) {
      await hardDeleteTestStore(r.id).catch(() => {});
    }
  }
}

/**
 * SEC-TS-10 (cuota activa): archiva tiendas de PRUEBA ACTIVAS para liberar
 * cuota del plan (enterprise: 10 activas — checkStoreQuota cuenta
 * is_active=true). Usada por el retry-403 de los helpers de creación cuando
 * la cuota se agota a mitad de corrida.
 *
 * E2E-RUNNER-ISOLATION: el SELECT queda acotado al TENANT del run (la cuota
 * real es per-tenant: create_store_with_membership cuenta
 * `tenant_id = v_tenant AND is_active`) — libera SOLO la cuota propia y
 * nunca archiva tiendas de otro runner concurrente (tenant distinto).
 * En modo legacy (sin tenant) se conserva el alcance global original.
 *
 * Protegidas SIEMPRE:
 *   - PILOT A/B (por nombre exacto — los del run en modo aislado)
 *   - ids pasados en protectedIds (stores del test en curso)
 *   - cualquier tienda creada hace <2 min (ventana del test actual; con
 *     workers=1 ninguna otra spec corre concurrentemente)
 *   - tiendas cuyo nombre NO matchea los prefijos de artefactos de test
 *
 * No toca NUNCA: tiendas operativas (nombres de negocio), pilotos, ni
 * tiendas de OTROS runners/tenants.
 */
const TEST_NAME_PREFIX = /^(E2E|E2E80|ESEC TEST|FASE-D TEST|AUDIT|HOT|REM-F4|E2E2)/i;
export async function freeActiveTestQuota(
  protectedIds: readonly string[] = [],
  maxAgeMs = 120_000,
): Promise<number> {
  try {
    const tenantScope = getRunTenantId() ? `&tenant_id=eq.${getRunTenantId()}` : '';
    const rows = (await sb.select('stores', `select=id,name,created_at&is_active=eq.true${tenantScope}`)) as Array<{
      id: string; name: string; created_at: string;
    }>;
    const now = Date.now();
    const toArchive = rows.filter((r) => {
      const name = String(r.name || '');
      if (name === PILOT_A_NAME || name === PILOT_B_NAME) return false;
      if (protectedIds.includes(r.id)) return false;
      const created = Date.parse(r.created_at || '') || 0;
      if (now - created < maxAgeMs) return false;
      if (!TEST_NAME_PREFIX.test(name)) return false;
      return true;
    });
    if (toArchive.length === 0) return 0;
    // E2E DATA HYGIENE: hard delete (antes archivaba — residuos permanentes)
    for (const r of toArchive) {
      await hardDeleteTestStore(r.id).catch(() => {});
    }
    return toArchive.length;
  } catch {
    // best-effort: si falla, la creación reportará el 403 real
    return 0;
  }
}

/**
 * SEC-TS-10 (FIXTURE): cleanup de la tienda de prueba.
 * 1. Intenta el flujo REAL (DELETE /api/stores → RPC soft_delete_store) para
 *    seguir ejercitando el contrato de la API en el happy path.
 * 2. E2E DATA HYGIENE: después verifica si la fila sigue existiendo — la app
 *    hace SOFT delete (archive), lo que durante meses acumuló 2600+ tiendas
 *    residuales. Si la tienda sigue presente (soft-deleted, 429, o fallback),
 *    ejecuta HARD delete vía e2e_hard_delete_store (service-role) para que
 *    el criterio sea NET ZERO: una entidad temporal no permanece.
 * Nunca lanza (es cleanup best-effort; el guardrail del teardown audita).
 */
export async function deleteTestStore(
  request: import('@playwright/test').APIRequestContext,
  adminToken: string,
  storeId: string,
): Promise<void> {
  await waitStoreBudget('delete');
  const res = await request
    .delete('/api/stores', { headers: apiHeaders(adminToken), data: { storeId } })
    .catch(() => null);
  if (res && res.ok()) {
    // Verificar ausencia real (el endpoint de la app es soft-delete)
    try {
      const rows = await sb.select('stores', `select=id&id=eq.${storeId}&limit=1`);
      if (rows.length === 0) return; // ya no existe (hard delete efectivo)
    } catch {
      return; // no se pudo verificar — el guardrail final audita
    }
  }
  // HARD delete de la tienda de prueba (fallback anterior era archivar —
  // esa semántica es la causa raíz de la contaminación auditada).
  await hardDeleteTestStore(storeId).catch(() => {});
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
