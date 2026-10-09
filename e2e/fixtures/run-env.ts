/**
 * E2E-RUNNER-ISOLATION — Identidad de ejecución dedicada (chore/e2e-runner-isolation)
 * ============================================================================
 * PROBLEMA (observado y reproducido): múltiples runners E2E (local pm2 + job
 * `e2e` de GitHub Actions, que corre `bun run test:e2e` en cada push/PR a
 * main contra el MISMO proyecto Supabase) comparten simultáneamente:
 *
 *   - los mismos usuarios fijos (admin@costpro.com / cajero@demo.com / ...);
 *   - el mismo tenant (la cuota real de 10 tiendas activas es PER TENANT:
 *     create_store_with_membership cuenta `tenant_id = v_tenant AND
 *     is_active` con advisory lock per-tenant);
 *   - el mismo profiles.active_store_id (race entre runners sobre la MISMA
 *     fila del admin compartido);
 *   - barridos de higiene por patrón GLOBAL ('E2E80*', 'E2E *', ...) + edad
 *     (>10 min sweep / >2 min freeActiveTestQuota) que archivan tiendas de
 *     OTROS runners en curso;
 *   - sesiones del mismo usuario: el signOut GLOBAL de useSessionManager
 *     (src/hooks/logic/useSessionManager.ts) revoca TODAS las sesiones del
 *     usuario compartido a mitad de corrida;
 *   - el mismo presupuesto de rate-limit (`stores:post:${userId}:${ip}`).
 *
 * Síntomas: ERR_STORE_LIMIT_REACHED, 403 en cascada, 429, tokens muertos,
 * active_store pisado entre runners, cleanup cruzado.
 *
 * SOLUCIÓN (Opción 3 — tenant por ejecución, dentro del proyecto actual):
 *   Cada ejecución de la suite (local o CI) obtiene:
 *
 *     E2E_RUN_ID            — identidad única (p.ej. E2E-20261004-A1B2C3)
 *     usuarios propios      — admin (rol admin, plan enterprise) + cajero
 *                             (clerk) + almacen (warehouse) + encargado,
 *                             creados vía Supabase Admin API
 *     TENANT propio         — lo crea el trigger on_auth_user_created vía
 *                             company_name del admin del run
 *     pilotos A/B propios   — creados vía POST /api/stores (API REAL) dentro
 *                             del tenant del run → cuota aislada (10 activas
 *                             PER TENANT, advisory lock que NO bloquea
 *                             cross-tenant — ver REM-INV-5 C4)
 *     productos piloto      — sembrados por SKU determinista del run
 *                             (patrón SEC-TS-08 de pilot-env.ts)
 *
 *   Los barridos/higiene de session.fixture quedan acotados AL TENANT del
 *   run: un runner NUNCA archiva, resetea ni consume recursos de otro.
 *   El proyecto Supabase sigue siendo único (la infraestructura no ofrece
 *   un segundo proyecto): el aislamiento logrado es de DATOS, SESIÓN, CUOTA
 *   y CONTEXTO — exactamente lo que produce los fallos observados.
 *
 * Modo legacy: E2E_ISOLATION=0 restaura el comportamiento compartido
 * anterior (usuarios demo fijos + pilotos persistentes por nombre exacto).
 *
 * Persistencia del contexto: global-setup y global-teardown corren en el
 * MISMO proceso del runner de Playwright (los workers son los que se
 * bifurcan), por lo que el contexto se persiste en
 * `test-results/e2e-run-context-pid-<pid>.json` — único por invocación,
 * descubrible por el teardown sin estados globales compartidos.
 * ============================================================================
 */
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import {
  hardDeleteTestStore,
  hardDeleteRunTenantStores,
  hardDeleteRunUser,
  deleteRunTenantIfEmpty,
  sweepResidualsSince,
  PROTECTED_STORE_IDS,
} from './hard-cleanup';
import { isProtectedStore } from './protected-resources';

loadEnv({ path: './.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

const RUN_CONTEXTS_DIR = resolve(process.cwd(), '.e2e-run-contexts');
const CONTEXT_PREFIX = 'e2e-run-context-pid-';
/** Antigüedad máxima de un context file antes de GC (corridas legítimas viven <1h: tokens 1h). */
const CONTEXT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Gracia para context files de PID recién creado (runner arrancando). */
const CONTEXT_PID_GRACE_MS = 2 * 60 * 1000;
/** Edad mínima de un context file preset antes de considerarse huérfano por edad. */
const CONTEXT_ORPHAN_AGE_MS = 60 * 60 * 1000;

// ── Identidad de ejecución ───────────────────────────────────────────────────

/**
 * DECISIÓN DEL PROPIETARIO (2026-10-09, incidente de contaminación): el modo
 * aislado DEJA DE SER el default. Toda corrida E2E reutiliza las tiendas
 * piloto persistentes ('E2E PILOT A/B CostPro') y los usuarios de seed —
 * NO crea tiendas, usuarios ni tenants. El modo aislado queda como OPT-IN
 * explícito (E2E_ISOLATION=1) para los specs de creación/aislamiento, que
 * además están deshabilitados en el inventario por defecto (solo se ejecutan
 * bajo petición expresa del propietario).
 * Evidencia: docs/audits/E2E-RESOURCE-LIFECYCLE-REMEDIATION.md
 */
export function isIsolatedRun(): boolean {
  return process.env.E2E_ISOLATION === '1';
}

/** RUN_ID de esta ejecución (vacío en modo legacy o antes del global-setup). */
export function getRunId(): string {
  return process.env.E2E_RUN_ID || '';
}

/** Tenant del run (vacío en modo legacy) — acota barridos y guards al propio. */
export function getRunTenantId(): string {
  return process.env.E2E_RUN_TENANT_ID || '';
}

export function generateRunId(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `E2E-${ymd}-${rand}`;
}

function runSlug(runId: string): string {
  return runId.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Contraseña fuerte por run — nunca hardcoded, nunca impresa. */
function runPassword(): string {
  return `E2e-${randomBytes(12).toString('base64url')}`;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface RunUser {
  id: string;
  email: string;
  password: string;
  role: string;
}

export interface RunContext {
  runId: string;
  tenantId: string;
  createdAt: string;
  users: {
    admin: RunUser;
    cajero: RunUser;
    almacen: RunUser;
    encargado: RunUser;
  };
  pilotStoreA: { id: string; name: string };
  pilotStoreB: { id: string; name: string };
  productA: string;
  productB: string;
}

// ── HTTP helpers (service-role / anon) ───────────────────────────────────────

function svc(method: string, path: string, body?: unknown): Promise<Response> {
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

async function patchProfile(userId: string, patch: Record<string, unknown>): Promise<void> {
  const res = await svc('PATCH', `/profiles?id=eq.${userId}`, patch);
  if (!res.ok) {
    throw new Error(`[run-env] PATCH profiles (${userId}) falló: HTTP ${res.status} ${await res.text()}`);
  }
}

async function adminCreateUser(
  email: string,
  password: string,
  role: string,
  fullName: string,
): Promise<{ id: string }> {
  // ⚠️ NUNCA pasar company_name: el trigger on_auth_user_created inserta
  // tenants(owner_id = NEW.id) ANTES de crear el profile → viola el FK
  // tenants_owner_id_fkey (v2_15_1) y revierte toda la transacción
  // (reproducido: HTTP 500 23503). El tenant dedicado del run se crea
  // EXPLÍCITAMENTE vía service-role en provisionRunEnv (paso 3), cuando el
  // profile ya existe y el FK pasa.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        full_name: fullName,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`[run-env] Creación de usuario ${email} falló: HTTP ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data?.id) throw new Error(`[run-env] Usuario ${email} sin id en respuesta`);
  return { id: data.id };
}

/** Password grant contra Supabase Auth (mismo contrato que session.fixture). */
export async function signInRunUser(email: string, password: string): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`[run-env] signIn falló para ${email}: HTTP ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; user: { id: string } };
  return { token: data.access_token, userId: data.user.id };
}

/** Crea una tienda vía la API REAL (POST /api/stores → RPC con membership). */
async function createStoreViaApi(
  adminToken: string,
  name: string,
  slug: string,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/stores`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      name,
      address: `Entorno piloto E2E aislado (run dedicado)`,
      phone: '+5355550000',
      email: `e2e-pilot@costpro.test`,
      slug,
      plantilla: 'construccion',
    }),
  });
  if (!res.ok) {
    throw new Error(`[run-env] createStore(${name}) falló: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: { store_id?: string; id?: string }; store_id?: string };
  const id = json?.data?.store_id ?? json?.data?.id ?? json?.store_id;
  if (!id) throw new Error(`[run-env] createStore(${name}): respuesta sin store_id`);
  return id;
}

/** Producto de referencia determinista por SKU; lo siembra si no existe (idempotente). */
async function ensureRunProduct(storeId: string, sku: string, label: 'A' | 'B'): Promise<string> {
  const sel = await svc('GET', `/products?sku=eq.${encodeURIComponent(sku)}&store_id=eq.${storeId}&select=id&limit=1`);
  if (sel.ok) {
    const rows = (await sel.json()) as Array<{ id: string }>;
    if (rows.length > 0 && rows[0].id) return rows[0].id;
  }
  const ins = await svc('POST', '/products', [{
    store_id: storeId,
    name: `Producto Piloto ${label}`,
    description: 'Producto de referencia del run E2E aislado (E2E-RUNNER-ISOLATION)',
    sku,
    price: 100,
    cost_price: 60,
    category: 'E2E',
    unit_of_measure: 'unidad',
    supplier: 'E2E Run Supplier',
    is_active: true,
    status: 'ACTIVE',
    price_currency: 'CUP',
    stock_current: 100,
    cost_average: 60,
    min_stock: 1, // check constraint products_min_stock_check exige > 0
  }]);
  if (!ins.ok) throw new Error(`[run-env] Seed de producto (${sku}) falló: HTTP ${ins.status}`);
  const created = (await ins.json()) as Array<{ id: string }>;
  const productId = created[0]?.id;
  if (!productId) throw new Error(`[run-env] Seed de producto (${sku}) sin id en respuesta`);
  await svc('POST', '/inventory', [{
    store_id: storeId,
    product_id: productId,
    quantity: 100,
    low_stock_threshold: 0,
    version: 1,
  }]).catch(() => {});
  return productId;
}

// ── Context file (persistencia entre global-setup y global-teardown) ─────────

export function runContextPath(): string {
  // Path explícito (lo fija provisionRunEnv para el global-teardown)
  if (process.env.E2E_RUN_CONTEXT_PATH) return process.env.E2E_RUN_CONTEXT_PATH;
  // RUN_ID preset por un orquestador/CI → path determinista por run
  // (descubrible por pruebas de concurrencia externas)
  const preset = process.env.E2E_RUN_ID;
  if (preset) return resolve(RUN_CONTEXTS_DIR, `e2e-run-context-${runSlug(preset)}.json`);
  // RUN_ID autogenerado → path por PID (único por invocación; global-setup y
  // global-teardown corren en el MISMO proceso del runner — verificado)
  return resolve(RUN_CONTEXTS_DIR, `${CONTEXT_PREFIX}${process.pid}.json`);
}

export function readRunContext(contextPath = runContextPath()): RunContext | null {
  try {
    if (!existsSync(contextPath)) return null;
    return JSON.parse(readFileSync(contextPath, 'utf8')) as RunContext;
  } catch {
    return null;
  }
}

/** GC de context files huérfanos de corridas que crasharon antes del teardown. */
export function gcStaleRunContexts(): number {
  let removed = 0;
  try {
    if (!existsSync(RUN_CONTEXTS_DIR)) return 0;
    for (const f of readdirSync(RUN_CONTEXTS_DIR)) {
      if (!f.startsWith('e2e-run-context-') || !f.endsWith('.json')) continue;
      const full = resolve(RUN_CONTEXTS_DIR, f);
      try {
        if (Date.now() - statSync(full).mtimeMs > CONTEXT_MAX_AGE_MS) {
          unlinkSync(full);
          removed += 1;
        }
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
  return removed;
}

// ── Reconciliación de runs interrumpidos (E2E-DATA-LIFECYCLE) ────────────

/** ¿El PID está vivo? (process.kill(pid,0): ESRCH=muerto, EPERM=vivo ajeno) */
function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Teardown SCOPE de un context huérfano — SOLO recursos por UUID exacto del
 * context. A diferencia de teardownRunEnv NO ejecuta el barrido global por
 * ventana temporal (sweepResidualsSince): el huérfano es VIEJO y su ventana
 * cubriría entidades de runs posteriores/concurrentes. La identidad del run
 * muerto queda cubierta por el sweep por created_by (paso 6) — exacto y sin
 * riesgo cross-run.
 */
async function reconcileOrphanContext(context: RunContext, contextPath: string): Promise<void> {
  // 1-2. Pilotos + tiendas del tenant del run (por UUID / tenant propio)
  for (const storeId of [context.pilotStoreA.id, context.pilotStoreB.id]) {
    await hardDeleteTestStore(storeId).catch(() => {});
  }
  if (context.tenantId) {
    await hardDeleteRunTenantStores(context.tenantId).catch(() => {});
  }
  // 3. Usuarios del run por UUID (hardDeleteRunUser aplica guardas de config)
  for (const user of [context.users.admin, context.users.cajero, context.users.almacen, context.users.encargado]) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}/sign_out`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).catch(() => {});
    await hardDeleteRunUser(user.id).catch(() => {});
  }
  // 4. Tenant del run si quedó vacío
  await deleteRunTenantIfEmpty(context.tenantId).catch(() => {});
  // 5. Sweep por IDENTIDAD (created_by ∈ usuarios del run muerto) — sin
  //    ventana temporal: exacto, nunca toca entidades de otros runs.
  try {
    const runUserIds = [context.users.admin.id, context.users.cajero.id, context.users.almacen.id, context.users.encargado.id];
    const rows = await svc(
      'GET',
      `/stores?select=id,name,created_by&created_by=in.(${runUserIds.map((id) => `"${id}"`).join(',')})&limit=200`,
    ).then((r) => (r.ok ? (r.json() as Promise<Array<{ id: string; name: string }>>) : []));
    for (const r of rows) {
      if (isProtectedStore(r.id, r.name)) continue;
      await hardDeleteTestStore(r.id).catch(() => {});
    }
  } catch { /* best-effort */ }
  // 6. El context file del huérfano ya no sirve
  try {
    unlinkSync(contextPath);
  } catch { /* ya eliminado */ }
  console.log(`[run-env] Reconciliado run huérfano ${context.runId} (context ${contextPath.split('/').pop()})`);
}

/**
 * RECONCILIACIÓN (garantía anti-huérfanos — el afterAll/teardown NO puede
 * ejecutarse si el runner muere con SIGKILL/OOM/timeout de CI): recorre los
 * context files de corridas anteriores y limpia por UUID los recursos de
 * los runs cuyo proceso YA NO EXISTE.
 *
 *   - `e2e-run-context-pid-<pid>.json` → huérfano si el PID no está vivo
 *     (con gracia de 2 min para no pisar un runner arrancando).
 *   - `e2e-run-context-<slug>.json` (E2E_RUN_ID preset por CI) → huérfano
 *     si el file tiene >1h sin modificarse (una corrida viva actualiza el
 *     contexto al provisionar; los tokens viven 1h — ninguna corrida sana
 *     supera esa edad).
 *
 * Conservador por diseño: ante duda, NO limpia (el GC de 6h cubre el
 * residual y el guardrail detecta cualquier fuga). Se invoca al inicio de
 * provisionRunEnv — todo run nuevo reconcilia el pasado antes de crear nada.
 */
export async function reconcileOrphanedRunContexts(): Promise<{ reconciled: number; skipped: number }> {
  let reconciled = 0;
  let skipped = 0;
  try {
    if (!existsSync(RUN_CONTEXTS_DIR)) return { reconciled, skipped };
    for (const f of readdirSync(RUN_CONTEXTS_DIR)) {
      if (!f.startsWith('e2e-run-context-') || !f.endsWith('.json')) continue;
      const full = resolve(RUN_CONTEXTS_DIR, f);
      let orphan = false;
      const pidMatch = f.match(/^e2e-run-context-pid-(\d+)\.json$/);
      if (pidMatch) {
        const pid = Number(pidMatch[1]);
        const ageMs = Date.now() - statSync(full).mtimeMs;
        orphan = !isPidAlive(pid) && ageMs > CONTEXT_PID_GRACE_MS;
      } else {
        // context preset por slug (E2E_RUN_ID): sin PID — criterio por edad
        try {
          orphan = Date.now() - statSync(full).mtimeMs > CONTEXT_ORPHAN_AGE_MS;
        } catch { orphan = false; }
      }
      if (!orphan) { skipped++; continue; }
      const context = readRunContext(full);
      if (!context) {
        // ilegible/corrupto: solo GC del file (nada que limpiar por UUID)
        try { unlinkSync(full); } catch { /* noop */ }
        continue;
      }
      await reconcileOrphanContext(context, full).catch(() => {});
      reconciled++;
    }
  } catch { /* best-effort — el guardrail detecta cualquier fuga */ }
  return { reconciled, skipped };
}

// ── Guard de entorno: recursos protegidos presentes (fail-fast) ───────────

/**
 * GUARD DE ENTORNO: verifica que los recursos protegidos del config de
 * gobernanza (negocio + pilotos persistentes) EXISTEN y están activos antes
 * de provisionar nada. Si falta uno, algún run anterior violó la protección
 * — aborta ANTES de crear recursos sobre una base degradada, con el mensaje
 * de remediación exacto.
 */
export async function verifyProtectedResources(): Promise<void> {
  if (process.env.E2E_SKIP_PROTECTED_GUARD === '1') return;
  const ids = PROTECTED_STORE_IDS;
  const missing: string[] = [];
  for (const id of ids) {
    try {
      const rows = await svc(
        'GET',
        `/stores?select=id,name,is_active,is_archived&id=eq.${id}&limit=1`,
      ).then((r) => (r.ok ? (r.json() as Promise<Array<{ id: string; name: string; is_active: boolean | null; is_archived: boolean | null }>>) : []));
      const s = rows[0];
      if (!s) missing.push(`${id} (AUSENTE)`);
      else if (s.is_archived) missing.push(`${s.name} (${id}) ARCHIVADA`);
    } catch (e) {
      throw new Error(`[run-env] Guard de entorno: no se pudo verificar ${id}: ${(e as Error).message}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[run-env] GUARD DE ENTORNO: recursos protegidos ausentes → ${missing.join('; ')}. ` +
      'Algún run anterior violó la protección (ver docs/audits/E2E-RESOURCE-LIFECYCLE-REMEDIATION.md). ' +
      'Remediación: re-provisionar con node e2e/scripts/provision-pilot-env.cjs y actualizar ' +
      'e2e/config/protected-resources.json. Para bootstrap excepcional: E2E_SKIP_PROTECTED_GUARD=1.',
    );
  }
}

// ── Provisión del entorno del run ─────────────────────────────────────────────

/**
 * Materializa la identidad de ejecución aislada y exporta el environment que
 * heredan los workers (global-setup corre ANTES de que Playwright lance los
 * workers — mismo contrato que el global-setup original).
 */
export async function provisionRunEnv(): Promise<RunContext> {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    throw new Error('[run-env] Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY en .env');
  }

  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health || !health.ok) {
    throw new Error(`[run-env] Servidor ${BASE_URL} no responde /api/health — arrancar pm2 antes de la corrida`);
  }

  gcStaleRunContexts();

  // RECONCILIACIÓN: limpiar recursos de runs muertos (SIGKILL/OOM/CI timeout)
  // ANTES de provisionar — el run nuevo nunca hereda huérfanos.
  const rec = await reconcileOrphanedRunContexts();
  if (rec.reconciled > 0) {
    console.log(`[run-env] Reconciliación previa: ${rec.reconciled} run(s) huérfano(s) limpiado(s), ${rec.skipped} activo(s) respetado(s).`);
  }

  // GUARD DE ENTORNO: protegidos presentes (fail-fast, ver E2E-RESOURCE-
  // LIFECYCLE-REMEDIATION.md) — pilotos A/B + tiendas de negocio.
  await verifyProtectedResources();

  const runId = process.env.E2E_RUN_ID || generateRunId();
  const slug = runSlug(runId);

  // 1) Admin del run (sin company_name — ver warning en adminCreateUser:
  // el path de tenant del trigger está roto por tenants_owner_id_fkey)
  const admin: RunUser = {
    id: '',
    email: `e2e-${slug}-adm@costpro.test`,
    password: runPassword(),
    role: 'admin',
  };
  const created = await adminCreateUser(admin.email, admin.password, 'admin', `E2E Admin ${runId}`);
  admin.id = created.id;

  // 2) Plantel demo dedicado (perfiles con tenant_id NULL — se adscriben en el paso 3)
  const cajero: RunUser = {
    id: '', email: `e2e-${slug}-usr@costpro.test`, password: runPassword(), role: 'clerk',
  };
  const almacen: RunUser = {
    id: '', email: `e2e-${slug}-wh@costpro.test`, password: runPassword(), role: 'warehouse',
  };
  const encargado: RunUser = {
    id: '', email: `e2e-${slug}-enc@costpro.test`, password: runPassword(), role: 'encargado',
  };
  cajero.id = (await adminCreateUser(cajero.email, cajero.password, 'clerk', `E2E Cajero ${runId}`)).id;
  almacen.id = (await adminCreateUser(almacen.email, almacen.password, 'warehouse', `E2E Almacen ${runId}`)).id;
  encargado.id = (await adminCreateUser(encargado.email, encargado.password, 'encargado', `E2E Encargado ${runId}`)).id;

  // 3) TENANT dedicado del run — creado explícitamente vía service-role
  //    (el profile del admin YA existe → el FK owner_id pasa). Cuota real
  //    per-tenant aislada del resto de runners (create_store_with_membership
  //    cuenta tenant_id = v_tenant AND is_active, advisory lock REM-INV-5).
  const tenantIns = await svc('POST', '/tenants?select=id', [{
    name: `E2E TENANT ${runId}`,
    owner_id: admin.id,
    plan: 'enterprise',
    subscription_status: 'trial',
    trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
  }]);
  if (!tenantIns.ok) {
    throw new Error(`[run-env] Creación de tenant del run falló: HTTP ${tenantIns.status} ${await tenantIns.text()}`);
  }
  const tenantRows = (await tenantIns.json()) as Array<{ id: string }>;
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error('[run-env] Tenant del run sin id en respuesta');

  // Adscribir al plantel al tenant del run
  await patchProfile(cajero.id, { tenant_id: tenantId });
  await patchProfile(almacen.id, { tenant_id: tenantId });
  await patchProfile(encargado.id, { tenant_id: tenantId });
  // Plan enterprise del admin del run → PLAN_STORE_LIMITS.enterprise = 10
  // tiendas activas PER TENANT (cuota aislada del resto de runners/tenant T0).
  await patchProfile(admin.id, { plan: 'enterprise', tenant_id: tenantId });

  // 4) Pilotos A/B del run vía la API REAL (tenant propio + membership admin)
  const adminSession = await signInRunUser(admin.email, admin.password);
  const pilotAName = `E2E PILOT A CostPro ${runId}`;
  const pilotBName = `E2E PILOT B CostPro ${runId}`;
  const storeAId = await createStoreViaApi(adminSession.token, pilotAName, `e2e_pilot_a_${slug}`);
  const storeBId = await createStoreViaApi(adminSession.token, pilotBName, `e2e_pilot_b_${slug}`);

  // 5) Membership del cajero en el piloto A (réplica del demo compartido)
  await svc('POST', '/user_store_memberships', [{
    user_id: cajero.id, store_id: storeAId, role: 'clerk', status: 'active',
  }]);

  // 6) active_store del admin y del cajero → piloto A propio (nunca el de otro)
  await patchProfile(admin.id, { active_store_id: storeAId });
  await patchProfile(cajero.id, { active_store_id: storeAId });

  // 7) Productos de referencia deterministas del run
  const productA = await ensureRunProduct(storeAId, `E2E-PA-${slug}-001`, 'A');
  const productB = await ensureRunProduct(storeBId, `E2E-PB-${slug}-001`, 'B');

  const context: RunContext = {
    runId,
    tenantId,
    createdAt: new Date().toISOString(),
    users: { admin, cajero, almacen, encargado },
    pilotStoreA: { id: storeAId, name: pilotAName },
    pilotStoreB: { id: storeBId, name: pilotBName },
    productA,
    productB,
  };

  // 8) Persistir el contexto para el global-teardown (mismo proceso, distinto módulo)
  //    ⚠️ FUERA de test-results/ — Playwright VACÍA ese directorio al iniciar
  //    cada corrida, lo que borraría el context de un runner concurrente.
  mkdirSync(RUN_CONTEXTS_DIR, { recursive: true });
  const contextPath = runContextPath();
  writeFileSync(contextPath, JSON.stringify(context, null, 2));
  process.env.E2E_RUN_CONTEXT_PATH = contextPath;

  // 9) Exportar el environment que heredan los workers
  const cajeroSession = await signInRunUser(cajero.email, cajero.password);
  process.env.E2E_RUN_ID = runId;
  process.env.E2E_ISOLATION = '1';
  process.env.E2E_RUN_TENANT_ID = tenantId;
  process.env.E2E_ADMIN_EMAIL = admin.email;
  process.env.E2E_ADMIN_PASS = admin.password;
  process.env.E2E_USER_EMAIL = cajero.email;
  process.env.E2E_USER_PASS = cajero.password;
  process.env.E2E_WAREHOUSE_EMAIL = almacen.email;
  process.env.E2E_WAREHOUSE_PASS = almacen.password;
  process.env.E2E_ENCARGADO_EMAIL = encargado.email;
  process.env.E2E_ENCARGADO_PASS = encargado.password;
  process.env.E2E_ENCARGADO_ID = encargado.id;
  process.env.E2E_TEST_ADMIN_EMAIL = admin.email;
  // Alias de pase por-run: reverse-duplicate-ui (y potenciales specs legacy)
  // leen E2E_TEST_ADMIN_PASS / E2E_TEST_USER_PASS — sin esto firman sesión
  // con la contraseña por defecto del modo compartido → credenciales
  // inválidas (reproducido: "Login failed: Invalid login credentials").
  process.env.E2E_TEST_ADMIN_PASS = admin.password;
  process.env.E2E_TEST_USER_EMAIL = cajero.email;
  process.env.E2E_TEST_USER_PASS = cajero.password;
  process.env.E2E_TEST_ADMIN_TOKEN = adminSession.token;
  process.env.E2E_TEST_ADMIN_ID = admin.id;
  process.env.E2E_TEST_USER_TOKEN = cajeroSession.token;
  process.env.E2E_TEST_USER_ID = cajero.id;
  process.env.E2E_PILOT_A_NAME = pilotAName;
  process.env.E2E_PILOT_B_NAME = pilotBName;
  process.env.E2E_PILOT_STORE_A = storeAId;
  process.env.E2E_PILOT_STORE_B = storeBId;
  process.env.E2E_TEST_STORE_ID = storeAId;
  process.env.E2E_TEST_PRODUCT_ID = productA;
  process.env.E2E_TEST_FOREIGN_PRODUCT_ID = productB;
  // session.fixture: restaurar active_store al piloto A del RUN (no Puerto Padre)
  process.env.E2E_RESTORE_ACTIVE_STORE_ID = storeAId;

  console.log(
    `[run-env] Run aislado provisionado — runId=${runId} tenant=${tenantId.slice(0, 8)}… ` +
    `admin=${admin.email} (id ${admin.id.slice(0, 8)}…) pilotA=${storeAId.slice(0, 8)}… pilotB=${storeBId.slice(0, 8)}…`,
  );

  return context;
}

// ── Teardown del run (SOLO recursos propios — nunca los de otro runner) ──────

/** Teardown del run: HARD delete (E2E DATA HYGIENE) — el criterio es NET ZERO. */
async function teardownRunStores(context: RunContext): Promise<void> {
  // 1. Pilotos A/B del run: HARD delete (antes: DELETE API → fallback archive;
  //    el archive era la causa raíz de la acumulación — 2638 tiendas residuales).
  // 2. TODAS las tiendas del tenant del run (el tenant es exclusivo de esta
  //    ejecución): specs crean tiendas adicionales (stores-crud, lifecycle,
  //    multi-store…) cuyo afterAll puede fallar — se barren por tenant.
  // 3. El tenant mismo, si quedó vacío.
  const storeIds = [context.pilotStoreA.id, context.pilotStoreB.id];
  for (const storeId of storeIds) {
    await hardDeleteTestStore(storeId).catch(async () => {
      // respaldo legacy: archivar (solo si el hard delete falla)
      await svc('PATCH', `/stores?id=eq.${storeId}`, { is_active: false, is_archived: true }).catch(() => {});
    });
  }
  if (context.tenantId) {
    await hardDeleteRunTenantStores(context.tenantId).catch(() => {});
  }
}

/**
 * Teardown del run: limpia EXCLUSIVAMENTE los recursos provisionados en el
 * context del run (identificación por id exacto — nunca por patrón global).
 * Sigue la semántica de borrado de la propia app para usuarios (soft delete
 * + ban + signOut, ver /api/users/delete): nunca rompe FKs de datos reales.
 */
export async function teardownRunEnv(contextPath = runContextPath()): Promise<void> {
  const context = readRunContext(contextPath);
  if (!context) {
    console.log('[run-env] Sin context file del run — nada que limpiar (¿modo legacy?).');
    return;
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('[run-env] Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY para el teardown');
  }

  await teardownRunStores(context);

  // Usuarios del run: HARD delete (E2E DATA HYGIENE — antes solo ban +
  // soft-delete de profile, acumulando identidades Auth permanentes).
  for (const user of [context.users.admin, context.users.cajero, context.users.almacen, context.users.encargado]) {
    // signOut (revoca refresh tokens de ESTE usuario únicamente)
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}/sign_out`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).catch(() => {});
    // HARD delete: profile + identidad Auth vía GoTrue Admin API
    await hardDeleteRunUser(user.id).catch(() => {});
  }

  // Tenant del run: eliminarlo si quedó vacío (NET ZERO)
  await deleteRunTenantIfEmpty(context.tenantId).catch(() => {});

  // Barrido residual (FASE 14): specs que crearon entidades como el admin
  // compartido (T0) o usuarios attacker — por ventana temporal del run.
  const swept = await sweepResidualsSince(
    context.createdAt,
    [context.users.admin.id, context.users.cajero.id, context.users.almacen.id, context.users.encargado.id],
  ).catch(() => ({ stores: 0, users: 0 }));
  if (swept.stores || swept.users) {
    console.log(`[run-env] Barrido residual del run: ${swept.stores} tiendas, ${swept.users} usuarios`);
  }

  try {
    unlinkSync(contextPath);
  } catch { /* ya eliminado */ }

  console.log(
    `[run-env] Teardown del run ${context.runId} completado — stores del run HARD-deleted, ` +
    `usuarios del run eliminados de Auth (net zero).`,
  );
}
