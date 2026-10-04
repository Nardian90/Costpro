/**
 * FASE H1 — QA TEST-FIRST · Librería compartida de testing.
 *
 * SOLO testing: helpers de ejecución, actores, fixtures, reporte.
 * NO modifica lógica de producción. service_role se usa EXCLUSIVAMENTE para:
 *   - preparación controlada de fixtures (tiendas/productos/usuarios QA)
 *   - limpieza
 *   - inspección posterior estrictamente necesaria (verificación de efectos)
 * Nunca para demostrar autorización de usuario.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const EVID = path.join(REPO, 'audit-evidence', 'FASE-H1');
const RESULTS = path.join(EVID, 'results');

// ── env ─────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  const f = path.join(REPO, '.env');
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const ENV = loadEnv();
const URL_ = ENV.NEXT_PUBLIC_SUPABASE_URL;
const ANON = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = ENV.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS = ENV.SUPABASE_ACCESS_TOKEN;
const APP = 'http://localhost:3000';
const PROJECT_REF = URL_.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];

if (!URL_ || !ANON || !SERVICE || !ACCESS) {
  console.error('❌ faltan credenciales Supabase en .env');
  process.exit(2);
}

// ── clientes ────────────────────────────────────────────────────────────────
/** SQL directo (Management API) — inspección/fixtures/limpieza. */
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`mgmt query falló: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

/** PostgREST como actor dado. actor: 'anon' | 'service' | token JWT. */
async function rest(method, p, actor, body, extraHeaders = {}) {
  const key = actor === 'service' ? SERVICE : ANON;
  const bearer = actor === 'anon' ? ANON : actor === 'service' ? SERVICE : actor;
  const r = await fetch(`${URL_}${p}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return { status: r.status, body: j, raw: text };
}

/** RPC de PostgREST como actor. */
async function rpc(fn, params, actor) {
  return rest('POST', `/rest/v1/rpc/${fn}`, actor, params);
}

/** Login Supabase (password grant) → {token, user_id}. */
async function login(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${email} falló: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return { token: j.access_token, user_id: j.user.id };
}

/** Llamada a ruta HTTP de la app con JWT Supabase (patrón E2E del repo). */
async function appPost(p, jwt, body, headers = {}) {
  const r = await fetch(`${APP}${p}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Origin: APP,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return { status: r.status, body: j, raw: text };
}

// ── estado de fixtures ──────────────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, 'state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

/** Lee fixtures; falla si 00-fixtures no se ha ejecutado. */
function fixtures() {
  const s = loadState();
  if (!s.store_a || !s.user_a) {
    console.error('❌ fixtures ausentes — ejecutar primero: node scripts/qa-h1/00-fixtures.cjs');
    process.exit(2);
  }
  return s;
}

// ── suite runner ────────────────────────────────────────────────────────────
function createSuite(suiteName, suiteId) {
  const results = [];
  const t0 = Date.now();

  async function test(id, spec, expected, fn) {
    const entry = { id, suite: suiteId, spec, expected, status: null, current: null, evidence: null };
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'status' in r) {
        Object.assign(entry, r);
        // status permitidos: PASS | FAIL | BLOCKED | NOT-OBSERVABLE
        if (!['PASS', 'FAIL', 'BLOCKED', 'NOT-OBSERVABLE'].includes(entry.status)) {
          throw new Error(`status inválido: ${entry.status}`);
        }
      } else {
        throw new Error('test no retornó {status, current, evidence}');
      }
    } catch (e) {
      entry.status = 'FAIL';
      entry.current = `ERROR DE EJECUCIÓN: ${e.message}`;
      entry.evidence = String(e.stack || '').split('\n').slice(0, 3).join(' | ');
    }
    const icon = entry.status === 'PASS' ? '✅' : entry.status === 'FAIL' ? '❌'
      : entry.status === 'BLOCKED' ? '⛔' : '👁️';
    console.log(`${icon} [${entry.id}] ${entry.status} — ${entry.spec}`);
    if (entry.status !== 'PASS' && entry.current) {
      console.log(`     current: ${String(entry.current).slice(0, 160)}`);
    }
    results.push(entry);
    return entry;
  }

  function finish() {
    fs.mkdirSync(RESULTS, { recursive: true });
    const summary = {
      suite: suiteName, suite_id: suiteId, started: new Date(t0).toISOString(),
      duration_ms: Date.now() - t0,
      counts: {
        total: results.length,
        pass: results.filter(r => r.status === 'PASS').length,
        fail: results.filter(r => r.status === 'FAIL').length,
        blocked: results.filter(r => r.status === 'BLOCKED').length,
        not_observable: results.filter(r => r.status === 'NOT-OBSERVABLE').length,
      },
      results,
    };
    fs.writeFileSync(path.join(RESULTS, `${suiteId}.json`), JSON.stringify(summary, null, 2));
    console.log('─'.repeat(70));
    console.log(`${suiteName}: ${summary.counts.pass} PASS · ${summary.counts.fail} FAIL · ${summary.counts.blocked} BLOCKED · ${summary.counts.not_observable} NOT-OBSERVABLE`);
    return summary;
  }
  return { test, finish };
}

// ── helpers de assert ───────────────────────────────────────────────────────
function isDenied(r) {
  // RPC denegado: HTTP >= 400 con mensaje de error, SIN datos de transacción
  const body = r.body;
  const hasTxData = body && (body.transaction_id || body.status === 'idempotent' || body.status === 'success');
  return r.status >= 400 && !hasTxData;
}
function bodyLeaksTx(r) {
  const b = r.body;
  return !!(b && (b.transaction_id || b.status === 'idempotent' || b.status === 'success'));
}
function brief(r) {
  return `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`;
}

module.exports = {
  ENV, URL_, ANON, SERVICE, ACCESS, APP, REPO, EVID, RESULTS,
  q, rest, rpc, login, appPost,
  loadState, saveState, fixtures, createSuite, isDenied, bodyLeaksTx, brief,
};
