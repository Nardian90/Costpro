/**
 * CP-INFRA-011 — GUARD CENTRALIZADO DE AISLAMIENTO E2E (implementación TS canónica)
 * ============================================================================
 * Contrato funcional (FASE 2 del mandato):
 *   Ninguna operación E2E (aprovisionamiento, escritura, limpieza o borrado)
 *   puede ejecutarse antes de que este guard valide el destino.
 *
 * Caso A — PRODUCCIÓN: cualquier URL cuyo ref sea `wthkddeleylijmonclxg`
 *   (o cuyo host lo contenga) se RECHAZA de inmediato, SIN conectar. La
 *   identificación es por host/ref, no por consulta a producción.
 *
 * Caso B — REMOTO: hosts no locales exigen, todos:
 *   - E2E_TARGET_KIND = `project` | `branch` (valor exacto)
 *   - E2E_ALLOWED_REMOTE_REF presente
 *   - ref extraída de la URL == E2E_ALLOWED_REMOTE_REF (igualdad EXACTA;
 *     jamás comparaciones parciales para autorizar)
 *   - E2E_ALLOWED_REMOTE_REF != producción
 *   - centinela `public.e2e_is_isolated_db()` === true (CasO D)
 *
 * Caso C — LOCAL: solo `localhost` / `127.0.0.1` / `::1` (cualquier puerto).
 *   Usa las credenciales del entorno local; NUNCA se interpreta como
 *   autorización para operar contra un host remoto. El guard normal exige
 *   el centinela también en local (el bootstrap local lo instala).
 *
 * Caso D — CENTINELA: tras el bootstrap, la RPC `public.e2e_is_isolated_db()`
 *   debe devolver el booleano `true`. RPC inexistente, error, false o tipo
 *   inesperado => rechazo. Los errores de red NO se convierten en permiso.
 *
 * Excepción limitada de bootstrap (§3.3 del mandato): el modo `bootstrap`
 *   omite ÚNICAMENTE la comprobación del centinela (la base vacía aún no lo
 *   tiene) y mantiene TODAS las comprobaciones de identidad. El script que
 *   la usa (scripts/e2e/reset-remote-e2e-db.mjs) debe verificar el estado
 *   inicial, aplicar SOLO el bootstrap mínimo, y re-verificar el centinela
 *   con el guard normal antes de cualquier migración, fixture o borrado.
 *
 * Nota de implementación dual: existe un espejo CJS
 *   (`e2e/fixtures/assert-isolated-db.cjs`) con la MISMA lógica para los
 *   entrypoints .cjs (provision-pilot-env, data-hygiene-guard,
 *   concurrency-proof). `src/__tests__/e2e/assert-isolated-db.test.ts`
 *   ejecuta la misma tabla de casos contra AMBAS implementaciones (paridad).
 *
 * Cero dependencias. Cero escrituras. Fail-closed.
 */

export const PRODUCTION_REF = 'wthkddeleylijmonclxg';

export type TargetKind = 'local' | 'project' | 'branch';

export type GuardMode = 'normal' | 'bootstrap';

export interface IsolationEnv {
  [name: string]: string | undefined;
}

export type SentinelFetcher = (url: string, serviceKey: string) => Promise<boolean>;

export interface IsolationDecision {
  ok: boolean;
  kind: TargetKind | null;
  ref: string | null;
  urlRef?: string | null;
  code?: GuardErrorCode;
  reason?: string;
}

export type GuardErrorCode =
  | 'E_URL_FALTA'
  | 'E_KEY_FALTA'
  | 'E_URL_MALFORMADA'
  | 'E_PRODUCCION'
  | 'E_TARGET_KIND_FALTA'
  | 'E_TARGET_KIND_INVALIDO'
  | 'E_REF_PERMITIDA_FALTA'
  | 'E_REF_NO_COINCIDE'
  | 'E_REF_IGUAL_A_PRODUCCION'
  | 'E_SENTINEL_FALSO'
  | 'E_SENTINEL_RPC_FALTA'
  | 'E_SENTINEL_ERROR'
  | 'E_FETCH_NO_DISPONIBLE';

export class IsolationError extends Error {
  decision: IsolationDecision;
  constructor(decision: IsolationDecision) {
    super(`[assert-isolated-db] ${decision.code ?? 'E_RECHAZADO'}: ${decision.reason ?? ''}`);
    this.name = 'IsolationError';
    this.decision = decision;
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]']);

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (LOCAL_HOSTS.has(h)) return true;
  return h.endsWith('.localhost');
}

/**
 * Extrae el ref del proyecto desde cualquier forma soportada:
 *   https://<ref>.supabase.co | https://db.<ref>.supabase.co
 *   postgres://postgres.<ref>@… | postgresql://postgres.<ref>@…
 *   https://<ref>.supabase.co:54321/… (stack local NO — local se detecta por host)
 * Devuelve null si no puede extraerse con certeza.
 */
export function extractSupabaseRef(rawUrl: string): string | null {
  if (!rawUrl) return null;
  // postgres://postgres.<ref>@host  (pooler) o postgres://postgres:<pwd>@db.<ref>.supabase.co
  const mUser = rawUrl.match(/postgres(?:ql)?:\/\/postgres\.([a-z0-9]{18,22})@/i);
  if (mUser) return mUser[1].toLowerCase();
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host.endsWith('.supabase.co')) {
    const parts = host.split('.');
    if (parts.length === 3 && parts[0] !== 'db') return parts[0]; // <ref>.supabase.co
    if (parts.length === 4 && parts[0] === 'db') return parts[1]; // db.<ref>.supabase.co
  }
  if (host.endsWith('.supabase.com') && host.startsWith('aws-')) {
    return null; // pooler por región: el ref vive en el usuario, capturado arriba
  }
  return null;
}

function localDecision(ref: string | null): IsolationDecision {
  return { ok: true, kind: 'local', ref, urlRef: ref };
}

/** Decisión PURA (sin red) sobre el destino. Nunca imprime secretos ni valores. */
export function decideIsolatedTarget(env: IsolationEnv): IsolationDecision {
  const url = (env.E2E_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!url) {
    return {
      ok: false, kind: null, ref: null, code: 'E_URL_FALTA',
      reason: 'Falta la URL del proyecto. Variables lógicas requeridas: E2E_SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL). No hay fallback.',
    };
  }
  const serviceKey = (env.E2E_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceKey) {
    return {
      ok: false, kind: null, ref: null, code: 'E_KEY_FALTA',
      reason: 'Falta la service_role key. Variables lógicas requeridas: E2E_SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_ROLE_KEY). No hay fallback.',
    };
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, kind: null, ref: null, code: 'E_URL_MALFORMADA', reason: 'La URL del destino no es válida. Verifique E2E_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL.' };
  }
  const host = u.hostname.toLowerCase();
  // Caso A — rechazo conservador de producción SIN conectar (incluso si aparece como subcadena del host)
  if (host === `${PRODUCTION_REF}.supabase.co` || host === `db.${PRODUCTION_REF}.supabase.co` || host.includes(PRODUCTION_REF)) {
    return {
      ok: false, kind: null, ref: PRODUCTION_REF, urlRef: extractSupabaseRef(url), code: 'E_PRODUCCION',
      reason: 'Destino PROHIBIDO: la URL corresponde al proyecto de producción. El guard rechaza sin conectar.',
    };
  }
  // Caso C — destino local
  if (isLocalHost(host)) {
    return localDecision(null);
  }
  // Caso B — remoto no local
  const ref = extractSupabaseRef(url);
  if (!ref) {
    return { ok: false, kind: null, ref: null, code: 'E_URL_MALFORMADA', reason: 'No se pudo extraer el ref del proyecto desde la URL remota (se esperaba <ref>.supabase.co / db.<ref>.supabase.co / postgres://postgres.<ref>@pooler).' };
  }
  const kind = (env.E2E_TARGET_KIND || '').trim();
  if (!kind) {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_TARGET_KIND_FALTA', reason: 'Destino remoto sin E2E_TARGET_KIND. Valores válidos: project | branch (exactos).' };
  }
  if (kind !== 'project' && kind !== 'branch') {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_TARGET_KIND_INVALIDO', reason: `E2E_TARGET_KIND inválido: se esperaba 'project' o 'branch' (valor exacto).` };
  }
  const allowed = (env.E2E_ALLOWED_REMOTE_REF || '').trim();
  if (!allowed) {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_REF_PERMITIDA_FALTA', reason: 'Destino remoto sin E2E_ALLOWED_REMOTE_REF. Debe contener el ref EXACTO del proyecto aislado (distinto de producción).' };
  }
  if (allowed === PRODUCTION_REF) {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_REF_IGUAL_A_PRODUCCION', reason: 'E2E_ALLOWED_REMOTE_REF apunta al ref de PRODUCCIÓN. Configuración adversaria: rechazada.' };
  }
  if (allowed !== ref) {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_REF_NO_COINCIDE', reason: 'El ref de la URL NO coincide con E2E_ALLOWED_REMOTE_REF (igualdad exacta requerida; sin comparaciones parciales).' };
  }
  return { ok: true, kind: kind as TargetKind, ref, urlRef: ref };
}

/** Consulta del centinela vía REST (inyectable para pruebas). Lanza en error de red. */
export async function fetchSentinel(
  url: string,
  serviceKey: string,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const doFetch = fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (!doFetch) {
    throw new IsolationError({ ok: false, kind: null, ref: null, code: 'E_FETCH_NO_DISPONIBLE', reason: 'fetch global no disponible.' });
  }
  const res = await doFetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/e2e_is_isolated_db`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.status === 404) {
    throw new IsolationError({ ok: false, kind: null, ref: null, code: 'E_SENTINEL_RPC_FALTA', reason: 'La RPC public.e2e_is_isolated_db NO existe en el destino. ¿Falta el bootstrap E2E?' });
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new IsolationError({ ok: false, kind: null, ref: null, code: 'E_SENTINEL_ERROR', reason: `El centinela devolvió un cuerpo no JSON (HTTP ${res.status}).` });
  }
  if (!res.ok) {
    throw new IsolationError({ ok: false, kind: null, ref: null, code: 'E_SENTINEL_ERROR', reason: `El centinela respondió HTTP ${res.status}.` });
  }
  if (data !== true) {
    return false; // false | null | tipo inesperado => centinela FALSO, fail-closed
  }
  return true;
}

/**
 * Aserción principal. `opts.mode='bootstrap'` omite SOLO el centinela
 * (identidad completa). `opts.checkSentinel=false` es equivalente a bootstrap
 * y existe para la ruta excepcional del script de preparación (§3.3):
 * el propio script DEBE re-verificar el centinela con el guard normal
 * antes de aplicar migraciones, fixtures o borrados.
 */
export async function assertIsolatedDb(opts: {
  env?: IsolationEnv;
  mode?: GuardMode;
  checkSentinel?: boolean;
  fetchImpl?: typeof fetch;
} = {}): Promise<IsolationDecision> {
  const env = opts.env ?? (process.env as IsolationEnv);
  const decision = decideIsolatedTarget(env);
  if (!decision.ok) throw new IsolationError(decision);
  const wantSentinel = opts.checkSentinel ?? (opts.mode !== 'bootstrap');
  if (wantSentinel) {
    const url = (env.E2E_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const serviceKey = (env.E2E_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    let sentinelOk: boolean;
    try {
      sentinelOk = await fetchSentinel(url, serviceKey, opts.fetchImpl);
    } catch (e) {
      if (e instanceof IsolationError) throw e;
      throw new IsolationError({ ok: false, ...decision, code: 'E_SENTINEL_ERROR', reason: 'No se pudo verificar el centinela (error de red). Fail-closed: se rechaza la operación.' });
    }
    if (!sentinelOk) {
      throw new IsolationError({ ...decision, ok: false, code: 'E_SENTINEL_FALSO', reason: 'El centinela public.e2e_is_isolated_db() NO devolvió true. Destino NO certificado como base E2E aislada.' });
    }
  }
  return decision;
}

export default assertIsolatedDb;
