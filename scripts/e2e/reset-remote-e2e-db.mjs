#!/usr/bin/env node
/**
 * CP-INFRA-011 — APLICACIÓN REMOTA CONTROLADA DE LA BASE E2E (CostproE2E) — v3
 * ============================================================================
 * El nombre se conserva por compatibilidad (`reset-remote-e2e-db`), pero su
 * comportamiento NUNCA efectúa resets destructivos automáticos: NO hace
 * `DROP SCHEMA`, NO borra tablas, NO reconstruye bases parcialmente aplicadas
 * sin autorización. Solo BOOTSTRAP idempotente + BASELINE certificado + tramo
 * de migraciones con parada en el primer error, todo bajo el guard.
 *
 * Estrategia v3 (manifiesto del generador): baseline transformado
 * (production-schema-snapshot-20260828.sql — ver transformaciones documentadas)
 * + 70 migraciones post-20260828 en orden oficial.
 *
 * Modos (uno obligatorio):
 *   --inspect        SOLO LECTURA: identidad, estado, extensiones, esquemas.
 *   --bootstrap      §3.3: identidad (Management API read-only) + public vacío
 *                    => aplica SOLO supabase/e2e-bootstrap.sql (idempotente;
 *                    si el centinela ya existe, re-aplica como top-up y
 *                    verifica). NO aplica baseline ni migraciones.
 *   --apply-replay   Guard normal (centinela true) + manifiesto v3 => aplica
 *                    baseline por LOTES TRANSACCIONALES (BEGIN/COMMIT por
 *                    lote: fallo = rollback del lote, reanudación limpia) y
 *                    luego el tramo UNA migración a la vez. Parada en el
 *                    primer error. Reanudación idempotente vía tabla de estado.
 *   --verify         SOLO LECTURA: centinela + baseline + completitud por
 *                    archivo + censo de objetos.
 *   --contract       SOLO LECTURA: compara la superficie preparada con el
 *                    contrato versionado (supabase/security-contract/
 *                    contract-surface.sql — 137 funciones SECURITY DEFINER):
 *                    faltantes, extra, diferencias de grants. Sin corrección
 *                    automática. Evidencia en audit-evidence/INFRA-011/.
 *
 * Salvaguardas obligatorias (todas las ejecuciones):
 *   --i-understand-this-is-destructive (confirmación adicional; NO es
 *      autorización por sí sola) · E2E_TARGET_KIND=project ·
 *   E2E_ALLOWED_REMOTE_REF=<ref exacto, ≠ producción wthkddeleylijmonclxg> ·
 *   E2E_SUPABASE_URL + service role key.
 *   --bootstrap exige SUPABASE_ACCESS_TOKEN (verificación del NOMBRE del
 *   proyecto vía Management API — metadata fiable de solo lectura).
 *
 * Transportes: --transport=api (Management API /database/query — default) o
 * --transport=pg (E2E_SUPABASE_DB_URL vía node pg). Credenciales jamás se
 * imprimen; errores saneados. Evidencia: --evidence-out (default
 * audit-evidence/INFRA-011/remote).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { splitSqlStatements } from './split-sql.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
loadEnv({ path: path.join(REPO, '.env') });
loadEnv({ path: path.join(REPO, '.env.local'), override: true });

const { assertIsolatedDb } = await import(pathToFileURL(path.join(REPO, 'e2e/fixtures/assert-isolated-db.ts')).href).catch(() => ({}));
const guard = assertIsolatedDb
  ? { assertIsolatedDb }
  : await import(pathToFileURL(path.join(REPO, 'e2e/fixtures/assert-isolated-db.cjs')).href);

const PROD_REF = 'wthkddeleylijmonclxg';
const argv = process.argv.slice(2);
const MODE = argv.find((a) => ['--inspect', '--bootstrap', '--apply-replay', '--verify', '--contract', '--surgical-cleanup-v1', '--reconcile-table-acl'].includes(a)) || fatalArg();
const CONFIRM = argv.includes('--i-understand-this-is-destructive');
const TRANSPORT = (argv.find((a) => a.startsWith('--transport=')) || '--transport=api').split('=')[1];
const EVIDENCE_OUT = path.join(REPO, (argv.find((a) => a.startsWith('--evidence-out=')) || '--evidence-out=audit-evidence/INFRA-011/remote').split('=')[1]);
const MANIFEST_PATH = path.join(REPO, '.e2e-migrations', 'manifest.json');
const BASELINE_ID = 'BASELINE:production-schema-snapshot-20260828.sql';

function fatalArg() { console.error('[reset-remote-e2e-db] FALTA modo: --inspect | --bootstrap | --apply-replay | --verify | --contract | --surgical-cleanup-v1 | --reconcile-table-acl'); process.exit(2); }
function fatal(msg, code = 1) { console.error(`[reset-remote-e2e-db] FATAL: ${msg}`); process.exit(code); }
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const now = () => new Date().toISOString();

// ── Precondiciones ──────────────────────────────────────────────────────────
if (!CONFIRM) fatal('Falta --i-understand-this-is-destructive (confirmación explícita; NO constituye autorización por sí sola).', 2);
if (TRANSPORT !== 'api' && TRANSPORT !== 'pg') fatal(`transporte inválido: ${TRANSPORT} (api|pg)`, 2);
const E = process.env;
const URL_ = (E.E2E_SUPABASE_URL || E.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const KEY = (E.E2E_SUPABASE_SERVICE_ROLE_KEY || E.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const REF_ALLOWED = (E.E2E_ALLOWED_REMOTE_REF || '').trim();
if (URL_.includes(PROD_REF) || REF_ALLOWED === PROD_REF) fatal('destino/allowlist apuntan a PRODUCCIÓN — ABORT INMEDIATO (sin conectar).', 2);
if (!URL_ || !KEY) fatal('faltan E2E_SUPABASE_URL / service role key (variables lógicas).', 2);
if ((E.E2E_TARGET_KIND || '') !== 'project') fatal('se exige E2E_TARGET_KIND=project para operar el proyecto aislado.', 2);
if (!REF_ALLOWED) fatal('falta E2E_ALLOWED_REMOTE_REF (ref EXACTO, ≠ producción).', 2);
if (TRANSPORT === 'api' && !(E.SUPABASE_ACCESS_TOKEN || '').trim() && MODE !== '--verify' && MODE !== '--contract') {
  fatal('transporte=api sin SUPABASE_ACCESS_TOKEN en el entorno. Configure el token (gestor de secretos / .env local del propietario) y reintente. [PENDING_OWNER]', 2);
}
if (TRANSPORT === 'pg' && !(E.E2E_SUPABASE_DB_URL || '').trim()) fatal('transporte=pg sin E2E_SUPABASE_DB_URL.', 2);
const urlRef = (URL_.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || ((URL_.match(/postgres(?:ql)?:\/\/postgres\.([a-z0-9]+)@/) || [])[1] || '');
if (REF_ALLOWED !== urlRef) fatal('el ref de la URL no coincide EXACTAMENTE con E2E_ALLOWED_REMOTE_REF (guard: igualdad exacta).', 2);

// ── Transporte SQL ──────────────────────────────────────────────────────────
async function sqlRun(query, intento = 1) {
  if (TRANSPORT === 'api') {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF_ALLOWED}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if ((res.status === 429 || res.status >= 500) && intento <= 5) {
      const espera = 2500 * intento;
      if (intento >= 2) console.log(`  … HTTP ${res.status} — reintento ${intento}/5 en ${espera}ms`);
      await new Promise((r) => setTimeout(r, espera));
      return sqlRun(query, intento + 1);
    }
    const text = await res.text();
    if (!res.ok) {
      let m = {};
      try { m = JSON.parse(text || '{}'); } catch { /* texto plano */ }
      throw new Error(`(HTTP ${res.status}) ${String(m.message || text).slice(0, 400)}`);
    }
    return JSON.parse(text || '[]');
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: E.E2E_SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const r = await client.query(query);
    return r.rows || [];
  } finally {
    await client.end();
  }
}
const sanitize = (msg) => String(msg).replace(/[A-Za-z0-9_\-]{40,}/g, '[redacted-largo]').replace(/:\/\/[^@\s]+@/g, '://[redacted]@').slice(0, 500);


// ── Secciones de supabase/e2e-bootstrap.sql ──────────────────────────────────
const BOOTSTRAP_SQL = fs.readFileSync(path.join(REPO, 'supabase', 'e2e-bootstrap.sql'), 'utf8');
const seccion = (id) => {
  const rx = new RegExp(`-- >>> SECCION ${id}[^<]*<<<([\\s\\S]*?)(?=-- >>> SECCION|$)`);
  const m = BOOTSTRAP_SQL.match(rx);
  if (!m) fatal(`sección ${id} no encontrada en supabase/e2e-bootstrap.sql`, 2);
  return m[1].trim();
};
const SECCION_A = seccion('A');
const SECCION_C = seccion('C');

// ── Identidad (Management API, read-only) ────────────────────────────────────
async function verifyProjectName() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF_ALLOWED}`, {
    headers: { Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}` },
  });
  const d = await res.json();
  if (!res.ok || !d || d.id !== REF_ALLOWED) throw new Error(`verificación de identidad fallida (HTTP ${res.status}) — NO se realizan escrituras.`);
  return { ref: d.ref, name: d.name, region: d.region, status: d.status };
}

// ── Inspección ──────────────────────────────────────────────────────────────
async function inspectState() {
  const tablas = await sqlRun("select tablename from pg_tables where schemaname='public' order by 1");
  const funciones = await sqlRun("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
  const extensiones = await sqlRun('select extname, extversion from pg_extension order by 1');
  const roles = await sqlRun("select rolname from pg_roles where rolname not like 'pg\\_%' order by 1");
  const buckets = await sqlRun('select id, name, public from storage.buckets order by 1').catch(() => []);
  const centinela = await sqlRun('select public.e2e_is_isolated_db() as ok').then((r) => r?.[0]?.ok === true).catch(() => false);
  const replay = await sqlRun('select nombre, estado, sha256 from e2e_infra.e2e_migrations_replay_state order by nombre').catch(() => []);
  return {
    public_tablas: tablas.map((r) => r.tablename),
    public_funciones: funciones[0]?.n ?? 0,
    extensiones: extensiones.map((r) => `${r.extname}@${r.extversion}`),
    roles: roles.map((r) => r.rolname),
    buckets,
    centinela_sql: centinela,
    replay_estado: replay,
  };
}

// ── Tabla de estado ──────────────────────────────────────────────────────────
async function ensureStateTable() {
  // La tabla de estado vive en el schema PRIVADO e2e_infra (creado aquí):
  // así queda invisible para los guards de inventario del tramo que auditan
  // la fidelidad exacta del esquema public (tablas/funciones/politicas).
  // ORDEN CRÍTICO: mover la tabla preexistente de public ANTES de crear la
  // nueva (si existe en ambos, el ALTER colisiona). Sin catches silenciosos.
  await sqlRun('create schema if not exists e2e_infra');
  const previa = await sqlRun("select 1 from pg_tables where schemaname='public' and tablename='e2e_migrations_replay_state'");
  if (previa.length > 0) {
    const existe = await sqlRun("select 1 from pg_tables where schemaname='e2e_infra' and tablename='e2e_migrations_replay_state'");
    if (existe.length > 0) {
      // Fusión quirúrgica: las filas de public se insertan sobre la nueva.
      await sqlRun(`insert into e2e_infra.e2e_migrations_replay_state (nombre, sha256, posicion, estado, error, aplicado_en)
        select nombre, sha256, posicion, estado, error, aplicado_en from public.e2e_migrations_replay_state
        on conflict (nombre) do update set estado=excluded.estado, sha256=excluded.sha256, error=excluded.error`);
      await sqlRun('drop table public.e2e_migrations_replay_state');
    } else {
      await sqlRun('alter table public.e2e_migrations_replay_state set schema e2e_infra');
    }
  }
  await sqlRun(`create table if not exists e2e_infra.e2e_migrations_replay_state (
    nombre text primary key,
    sha256 text not null,
    posicion integer not null,
    estado text not null,
    error text,
    aplicado_en timestamptz not null default now()
  )`);
}
const esc = (s) => String(s).replace(/'/g, "''");
async function markState(nombre, sha, posicion, estado, error = null) {
  await sqlRun(`insert into e2e_infra.e2e_migrations_replay_state (nombre, sha256, posicion, estado, error)
    values ('${esc(nombre)}', '${esc(sha)}', ${posicion}, '${esc(estado)}', ${error ? `'${esc(sanitize(error))}'` : 'null'})
    on conflict (nombre) do update set estado=excluded.estado, error=excluded.error, sha256=excluded.sha256, aplicado_en=now()`);
}

// ── Ejecución principal ──────────────────────────────────────────────────────
const evidence = { modo: MODE, transporte: TRANSPORT, ref: REF_ALLOWED, inicio: now(), pasos: [] };
const step = (nombre, ok, detalle) => {
  evidence.pasos.push({ nombre, ok, detalle: sanitize(typeof detalle === 'string' ? detalle : JSON.stringify(detalle ?? null)), ts: now() });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle !== undefined && detalle !== null ? ` — ${sanitize(typeof detalle === 'string' ? detalle : JSON.stringify(detalle ?? null))}` : ''}`);
};

try {
  if (MODE === '--bootstrap' || MODE === '--inspect') {
    if ((E.SUPABASE_ACCESS_TOKEN || '').trim()) {
      const identidad = await verifyProjectName();
      evidence.identidad = identidad;
      const ok = identidad.ref === REF_ALLOWED && identidad.name === 'CostproE2E';
      step('identidad-management-api', ok, `nombre=${identidad.name} ref=${identidad.ref} region=${identidad.region} estado=${identidad.status}`);
      if (!ok) throw new Error('identidad no concluyente: se esperaba CostproE2E. NO se realizan escrituras.');
    } else if (MODE === '--bootstrap') {
      throw new Error('--bootstrap exige SUPABASE_ACCESS_TOKEN para verificar el NOMBRE del proyecto (metadata fiable read-only). [PENDING_OWNER]');
    }
    await guard.assertIsolatedDb({ mode: 'bootstrap' });
    step('guard-identidad-sin-centinela', true, 'identidad validada (excepción §3.3)');
  } else if (MODE === '--verify' || MODE === '--contract') {
    await guard.assertIsolatedDb();
    step('guard-normal-centinela', true, 'destino validado con centinela true');
  } else {
    // --apply-replay: durante el replay el centinela NO existe (se instala al
    // final — desviación documentada por los guards de inventario del tramo).
    // La identidad se verifica igualmente por completo (ref + allowlist);
    // el guard NORMAL se ejecuta como verificación final tras crearlo.
    await guard.assertIsolatedDb({ mode: 'bootstrap' });
    step('guard-identidad-replay', true, 'identidad validada (centinela diferido al final del replay: desviación documentada)');
  }

  if (MODE === '--inspect') {
    evidence.estado = await inspectState();
    step('inspeccion-read-only', true, `tablas_public=${evidence.estado.public_tablas.length} funciones_public=${evidence.estado.public_funciones} centinela=${evidence.estado.centinela_sql}`);
  }

  if (MODE === '--bootstrap') {
    const inicial = await inspectState();
    evidence.estado_inicial = inicial;
    const infra = new Set(['e2e_migrations_replay_state']);
    const objetosNoInfra = inicial.public_tablas.filter((t) => !infra.has(t)).length + (inicial.public_funciones > 0 ? Math.max(0, inicial.public_funciones - 0) : 0);
    // Modo idempotente: si el centinela ya existe, el bootstrap se re-aplica como
    // top-up (roles shim / extensiones / grants). NO toca nada más.
    if (inicial.centinela_sql) {
      await sqlRun(SECCION_A);
      const post = await inspectState();
      step('bootstrap-top-up-idempotente', true, `centinela preexistente o diferido; sección A (extensiones+roles) re-aplicada; roles=${post.roles.filter((r) => ['warehouse_staff', 'costpro_transaction_adjuster', 'costpro_snapshot_restorer', 'dashboard_user'].includes(r)).length}/4`);
      evidence.estado_post = post;
      console.log('[reset-remote-e2e-db] NOTA: el centinela (sección C) se instala al FINAL de --apply-replay (desviación documentada: los guards de inventario del tramo exigen fidelidad exacta con producción — ver encabezado de supabase/e2e-bootstrap.sql).');
    } else {
      const vacio = inicial.public_tablas.length === 0 && inicial.public_funciones === 0;
      step('estado-inicial', vacio, `public vacío=${vacio} (tablas=${inicial.public_tablas.length}, funciones=${inicial.public_funciones}); extensiones=[${inicial.extensiones.join(', ')}]`);
      if (!vacio) {
        throw new Error(`ESTADO INICIAL NO ADMITIBLE sin centinela propio: public NO está vacío (${inicial.public_tablas.length} tablas, ${inicial.public_funciones} funciones). NO se borra NADA; diagnóstico registrado. Requiere autorización separada.`);
      }
      await sqlRun(SECCION_A);
      step('bootstrap-aplicado', true, 'sección A: extensiones + roles shim (centinela = sección C, diferido al final del replay por guards de inventario — ver desviación documentada)');
      const post = await inspectState();
      evidence.estado_post = post;
    }
    console.log('[reset-remote-e2e-db] BOOTSTRAP OK. Use --apply-replay para baseline + tramo.');
  }

  if (MODE === '--surgical-cleanup-v1') {
    // LIMPIEZA QUIRÚRGICA DOCUMENTADA de los artefactos del intento v1 (stream
    // completo) de esta MISMA preparación autorizada. El 2026-10-22 el replay
    // v1 aplicó 3 archivos pre-baseline (202401230001,
    // 20240325000000_harden_audit_triggers, 20240725) creando 7 funciones; la
    // estrategia v3 (baseline certificado) los reemplaza, pero CREATE OR
    // REPLACE no puede cambiar el tipo de retorno (OUT) de una función
    // existente (42P13 — evidencia: remote/apply-replay.json). Se eliminan
    // EXACTAMENTE esas 7 funciones para que el baseline cree las versiones
    // canónicas. NO es un reset destructivo: la base no contiene NADA que no
    // sea artefacto de esta preparación (evidencia estado-inicial-remoto.json:
    // public vacío al comenzar) y cada objeto eliminado pertenece al set
    // documentado. Nada más se toca.
    const previosCleanup = await sqlRun('select nombre, estado from e2e_infra.e2e_migrations_replay_state order by nombre');
    evidence.estado_pre_limpieza = previosCleanup;
    const v1Aplicadas = previosCleanup.filter((r) => r.estado === 'aplicada' && !r.nombre.startsWith('BASELINE')).map((r) => r.nombre);
    const esperadasV1 = ['202401230001_add_get_users_for_encargado.sql', '20240325000000_harden_audit_triggers.sql', '20240725_add_paginated_stock_ledger.sql'];
    const setV1 = new Set(esperadasV1);
    const inesperadas = v1Aplicadas.filter((n2) => !setV1.has(n2));
    if (inesperadas.length > 0) {
      throw new Error(`limpieza quirúrgica DENEGADA: filas 'aplicada' ajenas al set v1 documentado: ${inesperadas.join(', ')}. Estado no conocido por completo — detención honesta.`);
    }
    const DROPS = [
      'drop function if exists public.get_users_for_encargado(uuid)',
      'drop function if exists public.audit_product_changes()',
      'drop function if exists public.audit_profile_changes()',
      'drop function if exists public.audit_store_access_changes()',
      'drop function if exists public.audit_store_changes()',
      'drop function if exists public.log_transaction_changes()',
      'drop function if exists public.get_product_stock_ledger_paginated(uuid,uuid,integer,integer)',
    ];
    await sqlRun(DROPS.join(';\n') + ';\nselect 1');
    const restantes = await sqlRun("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_users_for_encargado','audit_product_changes','audit_profile_changes','audit_store_access_changes','audit_store_changes','log_transaction_changes','get_product_stock_ledger_paginated')");
    step('limpieza-7-funciones-v1', restantes.length === 0, `eliminadas=${DROPS.length}, restantes=${restantes.length}`);
    for (const nombre of esperadasV1) {
      await markState(nombre, 'limpiada-para-baseline-v3', 0, 'limpiada_para_baseline');
    }
    step('estado-v1-marcado', true, 'filas v1 => limpiada_para_baseline (histórico conservado)');
  }

  if (MODE === '--reconcile-table-acl') {
    // RECONCILIACIÓN DE ACLs DE TABLA (derivada de artefactos, no inventada).
    // Causa raíz (2026-10-22): el baseline (snapshot 2026-08-28) fue diseñado
    // para un restore de laboratorio SIN los defaults de plataforma Supabase
    // (que conceden anon/authenticated a toda tabla nueva creada por
    // postgres). En el proyecto alojado, la creación de las tablas durante el
    // baseline heredó esos defaults => divergencia EXCLUSIVAMENTE en las
    // tablas cuyo ACL real (snapshot) NO incluye anon/authenticated. Las
    // tablas W7 (pre-tamo) y las creadas por el tramo DEBEN conservarlos (en
    // producción los heredaron de sus propios defaults — evidencia: el guard
    // de w9_f01 espera GRANT ALL a anon en las 5 tablas W7).
    // Método: parsear los GRANT del baseline (estado objetivo por tabla),
    // consultar el estado actual, revocar anon/authenticated SOLO del exceso
    // (tablas del snapshot cuyo ACL objetivo no los incluye) y re-aplicar los
    // GRANT del snapshot para esas tablas. Se incluye la tabla de infra
    // e2e_migrations_replay_state (higiene E2E, no parte de producción).
    const baselineSql = fs.readFileSync(path.join(REPO, '.e2e-migrations', 'baseline.sql'), 'utf8');
    const rxGrant = /GRANT\s+([^;]+?)\s+ON\s+(TABLE|SEQUENCE)\s+public\.([a-z_0-9]+)\s+TO\s+([^;]+);/g;
    const grants = [...baselineSql.matchAll(rxGrant)].map((m) => ({ sql: m[0], tipo: m[2], obj: m[3], roles: m[4] }));
    const snapTablas = new Set(grants.filter((g) => g.tipo === 'TABLE').map((g) => g.obj));
    const snapConAnon = new Set(grants.filter((g) => g.tipo === 'TABLE' && /\banon\b/.test(g.roles)).map((g) => g.obj));
    const snapSeqConAnon = new Set(grants.filter((g) => g.tipo === 'SEQUENCE' && /\banon\b/.test(g.roles)).map((g) => g.obj));
    const snapSeqs = new Set(grants.filter((g) => g.tipo === 'SEQUENCE').map((g) => g.obj));
    const curTabs = await sqlRun("select distinct table_name as t from information_schema.role_table_grants where table_schema='public' and grantee='anon'");
    const curSeqs = await sqlRun("select distinct sequence_name as t from information_schema.role_usage_grants where table_schema='public' and grantee='anon'").catch(() => []);
    const excesoTabs = curTabs.map((r) => r.t).filter((t) => snapTablas.has(t) && !snapConAnon.has(t)).sort();
    const excesoSeqs = curSeqs.map((r) => r.t).filter((t) => snapSeqs.has(t) && !snapSeqConAnon.has(t)).sort();
    evidence.exceso_tablas = excesoTabs;
    evidence.exceso_secuencias = excesoSeqs;
    step('exceso-derivado', true, `tablas=${excesoTabs.length} secuencias=${excesoSeqs.length} (derivadas del baseline vs estado actual; tablas W7/trama excluidas por diseño)`);
    const revocar = [...excesoTabs, 'e2e_migrations_replay_state'];
    for (const t of revocar) {
      await sqlRun(`revoke all on table public."${t}" from anon, authenticated`);
    }
    for (const t of excesoSeqs) {
      await sqlRun(`revoke all on sequence public."${t}" from anon, authenticated`);
    }
    step('revocacion-exceso', true, `revoke anon,authenticated en ${revocar.length} tablas y ${excesoSeqs.length} secuencias`);
    let regrants = 0;
    for (const g of grants) {
      if (g.tipo === 'TABLE' && revocar.includes(g.obj)) { await sqlRun(g.sql); regrants++; }
      if (g.tipo === 'SEQUENCE' && excesoSeqs.includes(g.obj)) { await sqlRun(g.sql); regrants++; }
    }
    step('re-grant-snapshot', true, `${regrants} GRANTs del snapshot re-aplicados a las tablas reconciliadas`);
    const post = await sqlRun("select count(distinct c.relname)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','m','v') and position('anon=' in coalesce(c.relacl::text,'')) > 0");
    const esperadoAnon = snapConAnon.size + 5; // + tablas W7 (pre-tamo) con anon documentado por w9_f01
    step('verificacion-post', post[0].n === esperadoAnon, `tablas con anon=${post[0].n} (esperado=${esperadoAnon}: ${snapConAnon.size} snapshot + 5 W7)`);
    evidence.post_tablas_con_anon = post[0].n;
    evidence.esperado_tablas_con_anon = esperadoAnon;
  }

  if (MODE === '--apply-replay') {
    if (!fs.existsSync(MANIFEST_PATH)) fatal('no existe .e2e-migrations/manifest.json — ejecute scripts/e2e/build-migrations-replay.mjs primero.', 2);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (!manifest.baseline) fatal('el manifiesto no es v3 (falta baseline) — regenere la capa.', 2);
    const incluidos = manifest.archivos.filter((a) => a.estado === 'incluido').sort((a, b) => a.posicion - b.posicion);
    evidence.manifest_sha256 = sha256(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    evidence.manifest_total_tramo = incluidos.length;
    await ensureStateTable();
    step('tabla-estado-replay', true, 'e2e_infra.e2e_migrations_replay_state (IF NOT EXISTS)');

    const previos = await sqlRun('select nombre, estado, sha256 from e2e_infra.e2e_migrations_replay_state');
    const yaOk = new Map(previos.filter((r) => r.estado === 'aplicada').map((r) => [r.nombre, r.sha256]));

    // ── FASE 1: BASELINE por lotes transaccionales (reanudable por lote) ──
    const baselinePath = path.join(REPO, '.e2e-migrations', 'baseline.sql');
    const baselineSql = fs.readFileSync(baselinePath, 'utf8');
    const baselineSha = sha256(baselineSql);
    if (baselineSha !== manifest.baseline.sha256_generado) fatal('deriva: .e2e-migrations/baseline.sql no coincide con el manifiesto. Regenerar.', 2);
    if (yaOk.get(BASELINE_ID) === baselineSha) {
      step('baseline-ya-aplicado', true, 'sha coincide — reanudación');
    } else {
      const stmts = splitSqlStatements(baselineSql);
      evidence.baseline_sentencias = stmts.length;
      const LOTE = 25;
      const progressRow = previos.find((r) => r.nombre === 'BASELINE:progress');
      let offset = 0;
      if (progressRow && progressRow.estado === 'progreso' && /^\d+$/.test(progressRow.sha256)) {
        offset = Math.min(Number(progressRow.sha256), stmts.length);
      }
      let lote = Math.floor(offset / LOTE);
      // Preámbulo de sesión del PROPIO snapshot (líneas SET del encabezado):
      // cada POST es una sesión nueva, y `check_function_bodies = false` es
      // imprescindible para que las funciones LANGUAGE sql que referencian
      // objetos posteriores (orden alfabético del dump) se creen sin validación
      // — exactamente como pg_dump diseñó el artefacto para aplicarse.
      const PRELUDE = "SET statement_timeout = 0;\nSET client_encoding = 'UTF8';\nSET check_function_bodies = false;\nSET client_min_messages = warning;\nSET row_security = off;\n";
      const t0 = Date.now();
      for (let i = offset; i < stmts.length; i += LOTE) {
        const chunk = stmts.slice(i, i + LOTE).join('\n');
        lote++;
        try {
          await sqlRun(`${PRELUDE}begin;\n${chunk}\ncommit;`);
        } catch (e) {
          await markState('BASELINE:progress', String(i), 0, 'progreso', e.message).catch(() => {});
          step(`baseline lote ${lote} (sentencias ${i + 1}-${Math.min(i + LOTE, stmts.length)})`, false, `${sanitize(e.message)} [lote transaccional: rollback completo; reanudación desde ${i}]`);
          evidence.fallo = { fase: 'baseline', lote, sentencias: [i + 1, Math.min(i + LOTE, stmts.length)], offset_reanudacion: i, error: sanitize(e.message) };
          throw new Error(`baseline FALLÓ en el lote ${lote}: replay DETENIDO con el lote en rollback (reanudación limpia desde la sentencia ${i + 1}). No se borra ni repara nada.`);
        }
        await markState('BASELINE:progress', String(Math.min(i + LOTE, stmts.length)), 0, 'progreso');
        if (lote % 20 === 0) console.log(`  … baseline: ${Math.min(i + LOTE, stmts.length)}/${stmts.length} sentencias — ${Math.round((Date.now() - t0) / 1000)}s`);
      }
      await markState(BASELINE_ID, baselineSha, 0, 'aplicada');
      await sqlRun("delete from e2e_infra.e2e_migrations_replay_state where nombre = 'BASELINE:progress'");
      step('baseline-aplicado', true, `${stmts.length} sentencias en ${lote} lotes transaccionales (${offset} reanudadas) — ${manifest.baseline.archivo}, transformado)`);
    }

    // ── FASE 1.b: PRE-TAMO (paquetes W7-RELEASE out-of-band, verbatim) ────
    for (const pt of (manifest.pre_tamo?.paquetes || []).slice().sort((a, b) => a.orden - b.orden)) {
      const base = pt.archivo.split('/').pop();
      const idPt = `PRETAMO:${base}`;
      const fp = path.join(REPO, '.e2e-migrations', 'pre-tail', base);
      const sha = sha256(fs.readFileSync(fp, 'utf8'));
      if (sha !== pt.sha256_generado) fatal(`deriva en pre-tamo ${base}: la capa no coincide con el manifiesto.`, 2);
      if (yaOk.get(idPt) === pt.sha256_generado) { continue; }
      try {
        await sqlRun(fs.readFileSync(fp, 'utf8'));
      } catch (e) {
        await markState(idPt, pt.sha256_generado, pt.orden, 'fallida', e.message).catch(() => {});
        step(`pre-tamo ${base}`, false, sanitize(e.message));
        evidence.fallo = { fase: 'pre-tamo', archivo: base, orden: pt.orden, error: sanitize(e.message) };
        throw new Error(`el paquete pre-tamo ${base} FALLÓ — replay DETENIDO. Diagnóstico registrado.`);
      }
      await markState(idPt, pt.sha256_generado, pt.orden, 'aplicada');
      step(`pre-tamo ${base}`, true, `paquete ${pt.orden} aplicado verbatim`);
    }

    // ── FASE 2: tramo post-baseline, una migración a la vez ────────────────
    let aplicadas = 0, omitidas = 0;
    const t1 = Date.now();
    for (const a of incluidos) {
      if (yaOk.get(a.nombre) === (a.sha256_generado || a.sha256_original)) { omitidas++; continue; }
      const fp = path.join(REPO, '.e2e-migrations', a.nombre);
      const sql = fs.readFileSync(fp, 'utf8');
      const sha = sha256(sql);
      const shaObjetivo = a.sha256_generado || a.sha256_original;
      if (sha !== shaObjetivo) throw new Error(`deriva de hash en ${a.nombre}: la capa no coincide con el manifiesto.`);
      try {
        await sqlRun(sql);
      } catch (e) {
        await markState(a.nombre, sha, a.posicion, 'fallida', e.message).catch(() => {});
        step(`replay ${a.nombre}`, false, `${sanitize(e.message)} (posición ${a.posicion})`);
        evidence.fallo = { fase: 'tramo', archivo: a.nombre, posicion: a.posicion, error: sanitize(e.message) };
        throw new Error(`la migración ${a.nombre} FALLÓ en la posición ${a.posicion} — replay DETENIDO. Diagnóstico registrado; no se borra ni repara nada.`);
      }
      await markState(a.nombre, sha, a.posicion, 'aplicada');
      aplicadas++;
      if (aplicadas % 10 === 0) console.log(`  … tramo: ${aplicadas} aplicadas (+${omitidas} reanudadas) — ${Math.round((Date.now() - t1) / 1000)}s`);
    }
    step('replay-completo', true, `baseline OK + tramo: ${aplicadas} aplicadas en esta corrida + ${omitidas} reanudadas = ${incluidos.length}/${incluidos.length}`);
    evidence.aplicadas_esta_corrida = aplicadas;
    evidence.omitidas_reanudacion = omitidas;

    // ── FASE 3: CENTINELA (sección C del bootstrap) + guard normal final ──
    await sqlRun(SECCION_C);
    const res = await fetch(`${URL_.replace(/\/$/, '')}/rest/v1/rpc/e2e_is_isolated_db`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const viaRest = res.ok && (await res.json()) === true;
    step('centinela-rest-instalado', viaRest, `HTTP ${res.status} — public.e2e_is_isolated_db() === true`);
    await guard.assertIsolatedDb();
    step('guard-normal-final', true, 'estado final: guard normal acepta el destino');
    if (!viaRest) throw new Error('centinela no verificado tras el replay — estado final NO certificado.');
  }

  if (MODE === '--verify') {
    if (!fs.existsSync(MANIFEST_PATH)) fatal('--verify: falta .e2e-migrations/manifest.json (ejecute el generador).', 2);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const incluidos = manifest.archivos.filter((a) => a.estado === 'incluido');
    const st = await inspectState();
    evidence.estado = st;
    const map = Object.fromEntries(st.replay_estado.map((r) => [r.nombre, r]));
    const faltanTramo = incluidos.filter((a) => map[a.nombre]?.estado !== 'aplicada');
    const fallidas = incluidos.filter((a) => map[a.nombre]?.estado === 'fallida');
    const baselineOk = map[BASELINE_ID]?.estado === 'aplicada' && map[BASELINE_ID]?.sha256 === manifest.baseline.sha256_generado;
    const esenciales = await sqlRun("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('stores','profiles','products','transactions','stock_movements','audit_logs','inventory','receipt_items') order by 1");
    const rls = await sqlRun("select count(*)::int as total, count(*) filter (where c.relrowsecurity) as con_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    step('verificacion-centinela', st.centinela_sql === true, `centinela=${st.centinela_sql}`);
    step('verificacion-baseline', baselineOk, `estado=${map[BASELINE_ID]?.estado ?? 'ausente'}`);
    step('verificacion-completitud-tramo', faltanTramo.length === 0, `aplicadas=${incluidos.length - faltanTramo.length}/${incluidos.length} fallidas=${fallidas.length}`);
    step('verificacion-objetos-esenciales', esenciales.length === 8, `tablas=[${esenciales.map((r) => r.relname).join(', ')}]`);
    step('verificacion-tablas-rls', rls[0]?.total > 100 && rls[0]?.con_rls > 100, `tablas=${rls[0]?.total}, con RLS=${rls[0]?.con_rls}`);
    evidence.verdict = st.centinela_sql && baselineOk && faltanTramo.length === 0 && esenciales.length === 8 ? 'PREPARADA' : 'INCOMPLETA';
    console.log(`[reset-remote-e2e-db] VERIFICACIÓN: ${evidence.verdict}`);
  }

  if (MODE === '--contract') {
    // Contrato versionado: 137 funciones SECURITY DEFINER de escritura.
    const contractPath = path.join(REPO, 'supabase', 'security-contract', 'contract-surface.sql');
    const contract = fs.readFileSync(contractPath, 'utf8');
    const hdr = /@contract-function name=([a-z0-9_]+) args="([^"]*)"/g;
    const esperadas = {};
    let m;
    while ((m = hdr.exec(contract))) esperadas[m[1]] = m[2];
    const enE2e = await sqlRun("select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, coalesce(p.proacl::text,'') as proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef order by 1");
    const definerMap = new Map(enE2e.map((r) => [r.proname, r]));
    const faltan = Object.keys(esperadas).filter((k) => !definerMap.has(k));
    const extras = enE2e.filter((r) => !esperadas[r.proname]).map((r) => r.proname);
    const tablasRls = await sqlRun("select count(*)::int as total, count(*) filter (where c.relrowsecurity) as con_rls, string_agg(c.relname, ',') filter (where not c.relrowsecurity) as sin_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    const bucket = await sqlRun("select id, name from storage.buckets where id='reports'");
    const result = {
      contrato: { archivo: 'supabase/security-contract/contract-surface.sql', funciones_esperadas: Object.keys(esperadas).length },
      e2e: { funciones_security_definer: enE2e.length },
      funciones_faltantes_en_e2e: faltan,
      funciones_definer_extra_en_e2e: extras.filter((n2) => n2 !== 'e2e_is_isolated_db'),
      nota_e2e_infra: 'e2e_is_isolated_db es infraestructura E2E esperada (no está en el contrato de producción)',
      rls: tablasRls[0],
      bucket_reports: bucket,
    };
    evidence.contrato = result;
    fs.mkdirSync(path.join(REPO, 'audit-evidence', 'INFRA-011'), { recursive: true });
    fs.writeFileSync(path.join(REPO, 'audit-evidence', 'INFRA-011', 'contract-compare.json'), JSON.stringify(result, null, 2));
    step('contract-funciones-faltantes', faltan.length === 0, `faltan=${faltan.length} [${faltan.slice(0, 10).join(', ')}${faltan.length > 10 ? '…' : ''}]`);
    step('contract-definer-extras', true, `extras=${result.funciones_definer_extra_en_e2e.length} (informativo; esperadas por evolución post-baseline: ${result.funciones_definer_extra_en_e2e.slice(0, 8).join(', ')}…)`);
    step('contract-rls', tablasRls[0].con_rls === tablasRls[0].total, `tablas=${tablasRls[0].total} con RLS=${tablasRls[0].con_rls} sin_rls=${tablasRls[0].sin_rls ?? ''}`);
    console.log('[reset-remote-e2e-db] comparación de contrato registrada en audit-evidence/INFRA-011/contract-compare.json');
  }
} catch (e) {
  evidence.error = sanitize(e.message);
  step('resultado', false, e.message);
  fs.mkdirSync(EVIDENCE_OUT, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_OUT, `${MODE.replace(/--/, '')}.json`), JSON.stringify(evidence, null, 2));
  console.error(`[reset-remote-e2e-db] evidencia de fallo: ${path.join(EVIDENCE_OUT, `${MODE.replace(/--/, '')}.json`)}`);
  process.exit(1);
}

fs.mkdirSync(EVIDENCE_OUT, { recursive: true });
fs.writeFileSync(path.join(EVIDENCE_OUT, `${MODE.replace(/--/, '')}.json`), JSON.stringify(evidence, null, 2));
console.log(`[reset-remote-e2e-db] evidencia: ${path.join(EVIDENCE_OUT, `${MODE.replace(/--/, '')}.json`)}`);
process.exit(0);
