/**
 * CP-INFRA-011 — Guard centralizado de aislamiento E2E (espejo CJS).
 * ============================================================================
 * MISMA lógica que `e2e/fixtures/assert-isolated-db.ts` (implementación
 * canónica). Este espejo existe porque los entrypoints E2E standalone en
 * CommonJS (provision-pilot-env.cjs, data-hygiene-guard.cjs,
 * concurrency-proof.cjs) no pueden importar TypeScript sin un paso de build.
 * La paridad de AMBAS implementaciones se prueba en
 * `src/__tests__/e2e/assert-isolated-db.test.ts` (misma tabla de casos).
 *
 * Caso A: rechazo inmediato de producción SIN conectar.
 * Caso B: remoto exige E2E_TARGET_KIND(project|branch) + E2E_ALLOWED_REMOTE_REF
 *         exacto y != producción + centinela true.
 * Caso C: local (localhost/127.0.0.1/::1) con credenciales locales.
 * Caso D: centinela public.e2e_is_isolated_db() === true (fail-closed).
 * Modo bootstrap: omite SOLO el centinela (identidad completa); el script
 * de preparación debe re-verificar con el guard normal después del bootstrap.
 * Cero dependencias. Cero escrituras. Fail-closed.
 */
'use strict';

const PRODUCTION_REF = 'wthkddeleylijmonclxg';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]']);

function isLocalHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  if (LOCAL_HOSTS.has(h)) return true;
  return h.endsWith('.localhost');
}

function extractSupabaseRef(rawUrl) {
  if (!rawUrl) return null;
  const mUser = String(rawUrl).match(/postgres(?:ql)?:\/\/postgres\.([a-z0-9]{18,22})@/i);
  if (mUser) return mUser[1].toLowerCase();
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host.endsWith('.supabase.co')) {
    const parts = host.split('.');
    if (parts.length === 3 && parts[0] !== 'db') return parts[0];
    if (parts.length === 4 && parts[0] === 'db') return parts[1];
  }
  if (host.endsWith('.supabase.com') && host.startsWith('aws-')) return null;
  return null;
}

function IsolationErrorCtor(decision) {
  const err = new Error(`[assert-isolated-db] ${decision.code || 'E_RECHAZADO'}: ${decision.reason || ''}`);
  err.name = 'IsolationError';
  err.decision = decision;
  return err;
}

function decideIsolatedTarget(env) {
  const e = env || {};
  const url = String(e.E2E_SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!url) {
    return { ok: false, kind: null, ref: null, code: 'E_URL_FALTA', reason: 'Falta la URL del proyecto. Variables lógicas requeridas: E2E_SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL). No hay fallback.' };
  }
  const serviceKey = String(e.E2E_SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceKey) {
    return { ok: false, kind: null, ref: null, code: 'E_KEY_FALTA', reason: 'Falta la service_role key. Variables lógicas requeridas: E2E_SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_ROLE_KEY). No hay fallback.' };
  }
  let u;
  try { u = new URL(url); } catch {
    return { ok: false, kind: null, ref: null, code: 'E_URL_MALFORMADA', reason: 'La URL del destino no es válida. Verifique E2E_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL.' };
  }
  const host = u.hostname.toLowerCase();
  if (host === `${PRODUCTION_REF}.supabase.co` || host === `db.${PRODUCTION_REF}.supabase.co` || host.includes(PRODUCTION_REF)) {
    return { ok: false, kind: null, ref: PRODUCTION_REF, urlRef: extractSupabaseRef(url), code: 'E_PRODUCCION', reason: 'Destino PROHIBIDO: la URL corresponde al proyecto de producción. El guard rechaza sin conectar.' };
  }
  if (isLocalHost(host)) {
    return { ok: true, kind: 'local', ref: null, urlRef: null };
  }
  const ref = extractSupabaseRef(url);
  if (!ref) {
    return { ok: false, kind: null, ref: null, code: 'E_URL_MALFORMADA', reason: 'No se pudo extraer el ref del proyecto desde la URL remota (se esperaba <ref>.supabase.co / db.<ref>.supabase.co / postgres://postgres.<ref>@pooler).' };
  }
  const kind = String(e.E2E_TARGET_KIND || '').trim();
  if (!kind) {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_TARGET_KIND_FALTA', reason: 'Destino remoto sin E2E_TARGET_KIND. Valores válidos: project | branch (exactos).' };
  }
  if (kind !== 'project' && kind !== 'branch') {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_TARGET_KIND_INVALIDO', reason: "E2E_TARGET_KIND inválido: se esperaba 'project' o 'branch' (valor exacto)." };
  }
  const allowed = String(e.E2E_ALLOWED_REMOTE_REF || '').trim();
  if (!allowed) {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_REF_PERMITIDA_FALTA', reason: 'Destino remoto sin E2E_ALLOWED_REMOTE_REF. Debe contener el ref EXACTO del proyecto aislado (distinto de producción).' };
  }
  if (allowed === PRODUCTION_REF) {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_REF_IGUAL_A_PRODUCCION', reason: 'E2E_ALLOWED_REMOTE_REF apunta al ref de PRODUCCIÓN. Configuración adversaria: rechazada.' };
  }
  if (allowed !== ref) {
    return { ok: false, kind: null, ref, urlRef: ref, code: 'E_REF_NO_COINCIDE', reason: 'El ref de la URL NO coincide con E2E_ALLOWED_REMOTE_REF (igualdad exacta requerida; sin comparaciones parciales).' };
  }
  return { ok: true, kind, ref, urlRef: ref };
}

async function fetchSentinel(url, serviceKey, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch) {
    throw IsolationErrorCtor({ ok: false, kind: null, ref: null, code: 'E_FETCH_NO_DISPONIBLE', reason: 'fetch global no disponible.' });
  }
  const res = await doFetch(`${String(url).replace(/\/$/, '')}/rest/v1/rpc/e2e_is_isolated_db`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.status === 404) {
    throw IsolationErrorCtor({ ok: false, kind: null, ref: null, code: 'E_SENTINEL_RPC_FALTA', reason: 'La RPC public.e2e_is_isolated_db NO existe en el destino. ¿Falta el bootstrap E2E?' });
  }
  let data;
  try { data = await res.json(); } catch {
    throw IsolationErrorCtor({ ok: false, kind: null, ref: null, code: 'E_SENTINEL_ERROR', reason: `El centinela devolvió un cuerpo no JSON (HTTP ${res.status}).` });
  }
  if (!res.ok) {
    throw IsolationErrorCtor({ ok: false, kind: null, ref: null, code: 'E_SENTINEL_ERROR', reason: `El centinela respondió HTTP ${res.status}.` });
  }
  return data === true;
}

async function assertIsolatedDb(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const decision = decideIsolatedTarget(env);
  if (!decision.ok) throw IsolationErrorCtor(decision);
  const wantSentinel = o.checkSentinel === undefined ? (o.mode || 'normal') !== 'bootstrap' : o.checkSentinel;
  if (wantSentinel) {
    const url = String(env.E2E_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const serviceKey = String(env.E2E_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    let sentinelOk;
    try {
      sentinelOk = await fetchSentinel(url, serviceKey, o.fetchImpl);
    } catch (e) {
      if (e && e.decision) throw e;
      throw IsolationErrorCtor({ ...decision, ok: false, code: 'E_SENTINEL_ERROR', reason: 'No se pudo verificar el centinela (error de red). Fail-closed: se rechaza la operación.' });
    }
    if (!sentinelOk) {
      throw IsolationErrorCtor({ ...decision, ok: false, code: 'E_SENTINEL_FALSO', reason: 'El centinela public.e2e_is_isolated_db() NO devolvió true. Destino NO certificado como base E2E aislada.' });
    }
  }
  return decision;
}

module.exports = {
  PRODUCTION_REF,
  extractSupabaseRef,
  decideIsolatedTarget,
  fetchSentinel,
  assertIsolatedDb,
  isIsolationError: (e) => Boolean(e && e.name === 'IsolationError' && e.decision),
};
