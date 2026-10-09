/**
 * RECONCILIACIÓN DE RUNS HUÉRFANOS — E2E-DATA-LIFECYCLE
 * ============================================================================
 * El afterAll/global-teardown no puede ejecutarse si el runner muere de forma
 * abrupta (SIGKILL, OOM, timeout/cancel de CI). Además, los context files de
 * los runs de CI viven en el filesystem del runner efímero — inalcanzables
 * desde local. Esta CLI cubre ambos casos:
 *
 *   1. (default) Reconciliación por CONTEXT FILES locales: escanea
 *      .e2e-run-contexts/ y limpia por UUID los recursos de runs cuyo proceso
 *      ya no existe (misma lógica que provisionRunEnv ejecuta automáticamente).
 *
 *   2. (--run-id <E2E-YYYYMMDD-XXXXXX>) Reconciliación por RUN ID: resuelve
 *      los recursos DEL run (tenant 'E2E TENANT <runId>', usuarios
 *      'e2e-<slug>-{adm,usr,wh,enc}@costpro.test', tiendas del tenant + tiendas
 *      cuyo nombre contiene el runId + creadas por usuarios del run) y los
 *      hard-deleta POR UUID EXACTO. Nunca toca recursos protegidos del config.
 *      Requiere --execute para borrar; sin ella, solo reporta (dry-run).
 *
 * ⚠️ Antes de --execute: verificar que el run NO esté activo
 *    (GitHub Actions → workflow runs). Limpiar un run vivo rompería su
 *    ejecución (limpieza cruzada prohibida).
 *
 * Uso:
 *   npx tsx e2e/scripts/reconcile-orphan-runs.ts
 *   npx tsx e2e/scripts/reconcile-orphan-runs.ts --dry-run
 *   npx tsx e2e/scripts/reconcile-orphan-runs.ts --run-id E2E-20261009-3FCEE0            (reporte)
 *   npx tsx e2e/scripts/reconcile-orphan-runs.ts --run-id E2E-20261009-3FCEE0 --execute  (limpieza)
 * ============================================================================
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: './.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Config de gobernanza (espejo de protected-resources.ts) ─────────────────
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { resolve } from 'path';

interface ProtectedFile {
  protectedStores: Array<{ id: string; name: string }>;
  protectedStoreNamesExact?: string[];
  protectedUsers: Array<{ email: string }>;
}

function loadProtected(): ProtectedFile | null {
  for (const p of [
    resolve(process.cwd(), 'e2e', 'config', 'protected-resources.json'),
    resolve(process.cwd(), 'config', 'protected-resources.json'),
  ]) {
    try {
      if (!existsSync(p)) continue;
      return JSON.parse(readFileSync(p, 'utf8')) as ProtectedFile;
    } catch { /* siguiente candidato */ }
  }
  return null;
}

const PROT = loadProtected();
const PROT_STORE_IDS: string[] = PROT ? PROT.protectedStores.map((s) => s.id) : [];
const PROT_STORE_NAMES: string[] = PROT
  ? Array.from(new Set([...PROT.protectedStores.map((s) => s.name), ...(PROT.protectedStoreNamesExact || [])]))
  : [];
const PROT_EMAILS: string[] = PROT ? PROT.protectedUsers.map((u) => u.email.toLowerCase()) : [];

function isProtectedStore(id: string | null, name: string | null): boolean {
  if (id && PROT_STORE_IDS.includes(id)) return true;
  if (name && PROT_STORE_NAMES.includes(name.trim())) return true;
  return false;
}
function isProtectedEmail(email: string | null): boolean {
  return !!email && PROT_EMAILS.includes(email.toLowerCase().trim());
}

// ── REST helpers (service-role) ──────────────────────────────────────────────
async function rest<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data: data as T };
}

async function rpcDeleteStore(id: string): Promise<boolean> {
  const { data } = await rest<boolean>('POST', '/rpc/e2e_hard_delete_store', { p_store_id: id });
  return data === true || data === false ? (data as boolean) : false;
}
async function rpcDeleteUser(id: string): Promise<boolean> {
  const { data } = await rest<boolean>('POST', '/rpc/e2e_hard_delete_user', { p_user_id: id });
  return data === true || data === false ? (data as boolean) : false;
}

// ── Modo 1: context files locales (delegado en run-env) ─────────────────────
async function reconcileLocalContexts(dryRun: boolean): Promise<void> {
  const dir = resolve(process.cwd(), '.e2e-run-contexts');
  if (!existsSync(dir)) {
    console.log('[reconcile] Sin directorio de contextos — nada que hacer.');
    return;
  }
  const files = readdirSync(dir).filter((f) => f.startsWith('e2e-run-context-') && f.endsWith('.json'));
  console.log(`[reconcile] Context files presentes: ${files.length}`);
  if (dryRun) {
    for (const f of files) {
      const ageMin = Math.round((Date.now() - statSync(resolve(dir, f)).mtimeMs) / 60000);
      console.log(`  - ${f} (edad: ${ageMin} min)`);
    }
    console.log('[reconcile] dry-run: sin acción. Ejecutar sin --dry-run para reconciliar (delega en run-env.reconcileOrphanedRunContexts).');
    return;
  }
  const { reconcileOrphanedRunContexts } = await import('../fixtures/run-env');
  const result = await reconcileOrphanedRunContexts();
  console.log(
    `[reconcile] Completado — huérfanos reconciliados: ${result.reconciled}, activos respetados: ${result.skipped}`,
  );
}

// ── Modo 2: por RUN ID (huérfanos de CI) ─────────────────────────────────────
interface ResolvedRun {
  tenantId: string | null;
  stores: Array<{ id: string; name: string }>;
  users: Array<{ id: string; email: string | null }>;
}

async function resolveRunResources(runId: string): Promise<ResolvedRun> {
  const slug = runId.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const out: ResolvedRun = { tenantId: null, stores: [], users: [] };

  // Tenant del run (nombre exacto 'E2E TENANT <runId>') — los espacios van
  // entre comillas dobles (gramática PostgREST).
  const t = await rest<Array<{ id: string }>>(
    'GET',
    `/tenants?select=id&name=eq.${encodeURIComponent(`"E2E TENANT ${runId}"`)}`,
  );
  if (t.status === 200 && Array.isArray(t.data) && t.data[0]) out.tenantId = t.data[0].id;

  // Usuarios del run: patrón exacto de provisionRunEnv (4 roles)
  const u = await rest<Array<{ id: string; email: string | null }>>(
    'GET',
    `/profiles?select=id,email&or=(${['adm', 'usr', 'wh', 'enc']
      .map((r) => `email.eq.${encodeURIComponent(`"e2e-${slug}-${r}@costpro.test"`)}`)
      .join(',')})`,
  );
  if (u.status === 200 && Array.isArray(u.data)) out.users = u.data;

  // Tiendas: 3 consultas separadas (in.() anidado dentro de or=() NO es
  // soportado por la gramática de PostgREST — 400 PGRST100) + dedup en JS.
  const userIds = out.users.map((x) => x.id);
  const queries = [
    out.tenantId ? `/stores?select=id,name&tenant_id=eq.${out.tenantId}&limit=200` : null,
    `/stores?select=id,name&name=ilike.${encodeURIComponent(`*${runId}*`)}&limit=200`,
    userIds.length ? `/stores?select=id,name&created_by=in.(${userIds.map((i) => `"${i}"`).join(',')})&limit=200` : null,
  ].filter(Boolean) as string[];
  const seen = new Set<string>();
  for (const q of queries) {
    const s = await rest<Array<{ id: string; name: string }>>('GET', q);
    if (s.status === 200 && Array.isArray(s.data)) {
      for (const row of s.data) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          out.stores.push(row);
        }
      }
    }
  }
  return out;
}

async function reconcileByRunId(runId: string, execute: boolean): Promise<void> {
  console.log(`[reconcile] Resolviendo recursos del run ${runId}…`);
  const r = await resolveRunResources(runId);

  const protStores = r.stores.filter((s) => isProtectedStore(s.id, s.name));
  const stores = r.stores.filter((s) => !isProtectedStore(s.id, s.name));
  const protUsers = r.users.filter((u) => isProtectedEmail(u.email));
  const users = r.users.filter((u) => !isProtectedEmail(u.email));

  console.log(`  tenant=${r.tenantId ?? '(no encontrado)'}`);
  console.log(`  tiendas=${stores.length}${protStores.length ? ` (PROTEGIDAS excluidas: ${protStores.length})` : ''}`);
  for (const s of stores) console.log(`    - ${s.id} ${s.name}`);
  console.log(`  usuarios=${users.length}${protUsers.length ? ` (PROTEGIDOS excluidos: ${protUsers.length})` : ''}`);
  for (const u of users) console.log(`    - ${u.id} ${u.email}`);

  if (protStores.length || protUsers.length) {
    console.error('  ⚠️ El run resolvió recursos PROTEGIDOS — NO serán tocados (gobernanza por UUID).');
  }
  if (!execute) {
    console.log('[reconcile] dry-run (añade --execute para limpiar). Verifica antes que el run NO esté activo en GitHub Actions.');
    return;
  }
  if (stores.length === 0 && users.length === 0 && !r.tenantId) {
    console.log('[reconcile] Sin recursos para este run (¿ya limpiado?).');
    return;
  }

  let okStores = 0;
  let okUsers = 0;
  for (const s of stores) {
    // hardDeleteTestStore equivalente: guarda protegidos + RPC server-side
    if (await rpcDeleteStore(s.id)) okStores++;
    else console.warn(`    ! tienda ${s.id} (${s.name}) NO eliminada — revisar manualmente`);
  }
  for (const u of users) {
    await rest('POST', `/auth/v1/admin/users/${u.id}/sign_out`, {}).catch(() => {});
    if (await rpcDeleteUser(u.id)) okUsers++;
    else console.warn(`    ! usuario ${u.id} (${u.email}) NO eliminado — revisar manualmente`);
  }
  if (r.tenantId) {
    const p = await rest<Array<{ id: string }>>('GET', `/profiles?select=id&tenant_id=eq.${r.tenantId}&limit=1`);
    const st = await rest<Array<{ id: string }>>('GET', `/stores?select=id&tenant_id=eq.${r.tenantId}&limit=1`);
    if ((p.status === 200 && (!Array.isArray(p.data) || p.data.length === 0)) &&
        (st.status === 200 && (!Array.isArray(st.data) || st.data.length === 0))) {
      await rest('DELETE', `/tenants?id=eq.${r.tenantId}`);
      console.log(`  tenant ${r.tenantId} eliminado (vacío).`);
    }
  }
  console.log(`[reconcile] Ejecutado: ${okStores}/${stores.length} tiendas, ${okUsers}/${users.length} usuarios, tenant vacío limpiado.`);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[reconcile] Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env');
    process.exit(2);
  }
  const runIdIdx = process.argv.indexOf('--run-id');
  if (runIdIdx !== -1 && process.argv[runIdIdx + 1]) {
    const runId = process.argv[runIdIdx + 1];
    if (!/^E2E-\d{8}-[A-F0-9]{6}$/.test(runId)) {
      console.error(`[reconcile] RUN ID inválido: ${runId} (formato esperado E2E-YYYYMMDD-XXXXXX)`);
      process.exit(2);
    }
    await reconcileByRunId(runId, process.argv.includes('--execute'));
    return;
  }
  await reconcileLocalContexts(process.argv.includes('--dry-run'));
}

main().catch((e: Error) => {
  console.error('[reconcile] ERROR:', e.message);
  process.exit(1);
});
