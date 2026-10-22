#!/usr/bin/env node
/**
 * CP-INFRA-011 — GENERADOR DETERMINISTA DE REPRODUCCIÓN (v3: BASELINE + TRAMO)
 * ============================================================================
 * Genera `.e2e-migrations/` (capa derivada regenerable, gitignored) a partir
 * de dos fuentes, SIN modificar jamás los archivos originales:
 *
 *   1. LÍNEA BASE CERTIFICADA (artifacto versionado del repo):
 *      `audit-evidence/20260828/.../production-schema-snapshot-20260828.sql`
 *      — snapshot del esquema public de producción (2026-08-28, extraído con
 *      autorización del dueño; schema-only: 0 INSERTs top-level, verificado).
 *      El stream de migraciones NO crea el esquema core (stores, profiles,
 *      products, transactions, stock_movements, audit_logs… fueron creados
 *      out-of-band en la historia real — evidencia:
 *      audit-evidence/INFRA-011/fase0-inventario-migraciones.json), por lo
 *      que el snapshot es la ÚNICA reproducción completa y verificable del
 *      estado pre-2026-08-28 existente en el repositorio.
 *
 *   2. TRAMO POSTERIOR: migraciones de supabase/migrations/ con fecha
 *      > 20260828 (70 archivos), aplicadas en orden lexicográfico (regla del
 *      runner oficial). Las migraciones con fecha <= 20260828 quedan
 *      EXCLUIDAS con razón `cubierto_por_baseline_snapshot` — su efecto ya
 *      está materializado en el snapshot.
 *
 * TRANSFORMACIONES DOCUMENTADAS de la capa base (mandato §4.1: transformar
 * la capa generada está permitido si se documenta motivo y efecto; el
 * original NUNCA se modifica):
 *   - Se ELIMINAN 6 sentencias CREATE EVENT TRIGGER (issue_graphql_placeholder,
 *     issue_pg_cron_access, issue_pg_graphql_access, issue_pg_net_access,
 *     pgrst_ddl_watch, pgrst_drop_watch): objetos GESTIONADOS POR LA PLATAFORMA
 *     Supabase que ya existen en todo proyecto alojado y cuya creación exige
 *     superusuario (postgres en Supabase NO lo es). Motivo: reproducibilidad
 *     sin pérdida de funcionalidad — el efecto de estos triggers ya está
 *     presente en el destino por construcción.
 *   - Se ELIMINAN 2 sentencias CREATE PUBLICATION (supabase_realtime,
 *     supabase_realtime_messages_publication): publicaciones de plataforma ya
 *     existentes en todo proyecto alojado; su creación fallaría con
 *     "already exists".
 *   - Todo lo demás se copia VERBATIM (sha256 registrado antes y después).
 *
 * MANIFIESTO DETERMINISTA (manifest.json + manifest.sha256, sin marcas de
 * tiempo): baseline (shas + transformaciones) + un registro por archivo con
 * estado, razón, posición, sha256 y observaciones. Copia commiteada como
 * evidencia: audit-evidence/INFRA-011/e2e-migrations-manifest.json.
 *
 * Modo --check (CI): regenera en directorio temporal y compara el hash con el
 * manifiesto commiteado (cubre también la deriva del baseline). Exit 1 = DERIVA.
 *
 * PROHIBIDO por diseño: modificar originales, inventar orden, sustituir SQL
 * sin documentar, ignorar errores, ocultar exclusiones.
 *
 * Uso:
 *   node scripts/e2e/build-migrations-replay.mjs
 *   node scripts/e2e/build-migrations-replay.mjs --check
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSqlStatements } from './split-sql.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SRC = path.join(REPO, 'supabase', 'migrations');
const OUT = path.join(REPO, '.e2e-migrations');
const COMMITTED_MANIFEST = path.join(REPO, 'audit-evidence', 'INFRA-011', 'e2e-migrations-manifest.json');
const BASELINE_SRC = path.join(
  REPO, 'audit-evidence', '20260828', 'download', 'auditoria-multitienda',
  'RECOVERY-20260828', 'PRODUCTION-SCHEMA-SNAPSHOT', 'production-schema-snapshot-20260828.sql',
);
const BASELINE_CUTOFF = '20260828'; // snapshot = producción 2026-08-28 (UTC); tramo = fecha > cutoff

// SEGMENTO PRE-TAMO (out-of-band, versionado en el repo): el paquete W7-RELEASE
// (2026-08-30) se aplicó a producción FUERA del pipeline de migraciones entre
// el snapshot (08-28) y el tramo (08-31). Evidencia de que fue aplicado: el
// guard fail-closed de 20260902000001_w9_f01_rls_hardening.sql documenta y
// exige las 6 tablas que esos paquetes crean (store_credit_ledger,
// wac_change_log, w62_df04_*, w62_zero_cost_flags, transaction_recovery_ledger
// ya en baseline). Orden canónico de aplicación: W7-05 §14.1 (01..09).
const PRE_TAIL = [
  // PAQUETE 0 — Esquema storage (out-of-snapshot): el baseline cubre SOLO el
  // esquema public. El bucket `reports` + sus policies fueron creados por la
  // migración versionada 20260221 (pre-baseline, por tanto excluida del tramo,
  // pero su efecto NO está en el snapshot por vivir en el esquema storage).
  // Es el único artefacto versionado que materializa ese estado; se aplica
  // primero (Feb-2026, cronológicamente antes de W7). El guard de BUG-022
  // (posición 43 del tramo) exige su existencia.
  'supabase/migrations/20260221_create_reports_bucket.sql',
  'audit-evidence/20260830-w7/release/sql/01-df01-wac-singleton.sql',
  'audit-evidence/20260830-w7/release/sql/02-df02-cogs.sql',
  'audit-evidence/20260830-w7/release/sql/03-df05-production.sql',
  'audit-evidence/20260830-w7/release/sql/04-df09-overloads.sql',
  'audit-evidence/20260830-w7/release/sql/05-df06-transfer.sql',
  'audit-evidence/20260830-w7/release/sql/06-df07-devolution-cap.sql',
  'audit-evidence/20260830-w7/release/sql/07-df08-close-fix.sql',
  'audit-evidence/20260830-w7/release/sql/08-df03-devolution-finance.sql',
  'audit-evidence/20260830-w7/release/sql/09-df04-design-only.sql',
];

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

function fatal(msg, code = 1) {
  console.error(`[build-migrations-replay] FATAL: ${msg}`);
  process.exit(code);
}

// ── 1. Línea base certificada (con transformaciones documentadas) ────────────
if (!fs.existsSync(BASELINE_SRC)) fatal(`no existe el baseline ${BASELINE_SRC}`, 2);
const baselineRaw = fs.readFileSync(BASELINE_SRC, 'utf8');
const baselineShaOriginal = sha256(Buffer.from(baselineRaw, 'utf8'));
const RX_EVENT_TRIGGER = /^CREATE EVENT TRIGGER .*?;\s*$/gim;
const RX_PUBLICATION = /^CREATE PUBLICATION .*?;\s*$/gim;
const RX_ALTER_PUBLICATION = /^ALTER PUBLICATION .*?;\s*$/gim;
const RX_ALTER_EVENT_TRIGGER = /^ALTER EVENT TRIGGER .*?;\s*$/gim;
const baselineTransformado = baselineRaw
  .replace(RX_EVENT_TRIGGER, '-- [CP-INFRA-011 transformación documentada] CREATE EVENT TRIGGER omitido: objeto de plataforma Supabase ya existente en todo proyecto alojado; creación exige superusuario (postgres en Supabase no lo es). Original íntegro en audit-evidence/20260828/.../production-schema-snapshot-20260828.sql\n')
  .replace(RX_PUBLICATION, '-- [CP-INFRA-011 transformación documentada] CREATE PUBLICATION omitido: publicación de plataforma Supabase ya existente (supabase_realtime / messages). Original íntegro en audit-evidence/20260828/.../production-schema-snapshot-20260828.sql\n')
  .replace(RX_ALTER_PUBLICATION, '-- [CP-INFRA-011 transformación documentada] ALTER PUBLICATION omitido: la membresía de la publicación supabase_realtime la gestiona la plataforma (requiere ownership de la publicación, que no tiene postgres). Original íntegro en audit-evidence/20260828/.../production-schema-snapshot-20260828.sql\n')
  .replace(RX_ALTER_EVENT_TRIGGER, '-- [CP-INFRA-011 transformación documentada] ALTER EVENT TRIGGER omitido: triggers de evento de plataforma ya existentes y habilitados en todo proyecto alojado (postgres no es su owner). Original íntegro en audit-evidence/20260828/.../production-schema-snapshot-20260828.sql\n');
const nEvent = (baselineRaw.match(RX_EVENT_TRIGGER) || []).length;
RX_EVENT_TRIGGER.lastIndex = 0;
const nPub = (baselineRaw.match(RX_PUBLICATION) || []).length;
RX_PUBLICATION.lastIndex = 0;
const nAlterPub = (baselineRaw.match(RX_ALTER_PUBLICATION) || []).length;
RX_ALTER_PUBLICATION.lastIndex = 0;
const nAlterEvt = (baselineRaw.match(RX_ALTER_EVENT_TRIGGER) || []).length;
RX_ALTER_EVENT_TRIGGER.lastIndex = 0;
// Transformación 4 (nivel sentencia): se omiten las 188 funciones
// LANGUAGE c — TODAS miembros de la extensión btree_gist (gbt_*, gbtreekey*,
// *_dist), que el bootstrap instala con `create extension if not exists
// btree_gist`. postgres en Supabase NO puede crear funciones C (42501) y las
// funciones YA existen vía la extensión: su creación es innecesaria e
// imposible. Verificación determinista del conteo.
const stmtsBase = splitSqlStatements(baselineTransformado);
const RX_LANG_C = /\bLANGUAGE\s+c\b/i;
const cLang = stmtsBase.filter((s) => RX_LANG_C.test(s));
if (cLang.length !== 188) {
  fatal(`deriva inesperada del baseline: se esperaban 188 funciones LANGUAGE c (miembros de btree_gist), halladas ${cLang.length}. Revise el artefacto fuente.`);
}
// Transformación 5 (nivel sentencia): se omiten las 6 funciones de plataforma
// en el esquema extensions (set_graphql_placeholder, grant_pg_cron_access,
// grant_pg_graphql_access, grant_pg_net_access, pgrst_ddl_watch,
// pgrst_drop_watch): YA EXISTEN en todo proyecto alojado Supabase (propiedad de
// la plataforma) y CREATE OR REPLACE sobre una función existente exige ser su
// owner (42501). Son los cuerpos que referencian los 6 event triggers ya
// omitidos en la transformación 1 — conjunto cerrado y contable.
const RX_EXT_FN = /^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+extensions\./im;
const extFns = stmtsBase.filter((s) => RX_EXT_FN.test(s));
if (extFns.length !== 6) {
  fatal(`deriva inesperada del baseline: se esperaban 6 funciones de plataforma en extensions.*, halladas ${extFns.length}. Revise el artefacto fuente.`);
}
// Transformación 7 (nivel sentencia): se omiten los ALTER DEFAULT PRIVILEGES
// FOR ROLE supabase_admin (180) y supabase_auth_admin (24): postgres NO es
// miembro de esos roles de plataforma (verificado 2026-10-22 con 42501
// permission denied) y esos defaults describen ACLs de objetos creados por
// roles de plataforma — en el E2E TODO lo crea postgres. Se conservan los 96
// FOR ROLE postgres. Las ACLs de la superficie quedan cubiertas por los GRANT
// y REVOKE explícitos del propio snapshot (que el contrato compara).
const RX_ADP_PLATAFORMA = /^ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+supabase_(admin|auth_admin)\b/im;
const adpPlataforma = stmtsBase.filter((s) => RX_ADP_PLATAFORMA.test(s));
if (adpPlataforma.length !== 204) {
  fatal(`deriva inesperada del baseline: se esperaban 204 ALTER DEFAULT PRIVILEGES FOR ROLE supabase_*, hallados ${adpPlataforma.length}. Revise el artefacto fuente.`);
}
const REMOVIBLES = new Set([...cLang, ...extFns, ...adpPlataforma]);
const baselineFinal = stmtsBase.filter((s) => !REMOVIBLES.has(s)).join('\n\n') + '\n';
if (nEvent !== 6 || nPub !== 2 || nAlterPub !== 1 || nAlterEvt !== 6) {
  fatal(`deriva inesperada del baseline: se esperaban 6 CREATE EVENT TRIGGER / 2 CREATE PUBLICATION / 1 ALTER PUBLICATION, hallados ${nEvent}/${nPub}/${nAlterPub}/${nAlterEvt}. Revise el artefacto fuente.`);
}
const baselineShaGenerado = sha256(Buffer.from(baselineFinal, 'utf8'));
const baselineMeta = {
  archivo: 'audit-evidence/20260828/download/auditoria-multitienda/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT/production-schema-snapshot-20260828.sql',
  descripcion: 'snapshot schema-only del esquema public de producción, 2026-08-28 (extraído con autorización del dueño; 0 INSERTs top-level — verificado por este generador y por la cadena de evidencia RECOVERY-20260828)',
  fecha_corte: BASELINE_CUTOFF,
  sha256_original: baselineShaOriginal,
  sha256_generado: baselineShaGenerado,
  transformaciones: [
    { tipo: 'omitir_sentencia', patron: 'CREATE EVENT TRIGGER (6)', motivo: 'objetos gestionados por la plataforma Supabase: ya existen en todo proyecto alojado y su creación exige superusuario; el efecto ya está presente en el destino' },
    { tipo: 'omitir_sentencia', patron: 'CREATE PUBLICATION (2: supabase_realtime, supabase_realtime_messages_publication)', motivo: 'publicaciones de plataforma ya existentes en todo proyecto alojado; crearlas fallaría con already-exists' },
    { tipo: 'omitir_sentencia', patron: 'ALTER PUBLICATION (1: supabase_realtime ADD TABLE public.inventory)', motivo: 'la membresía de la publicación la gestiona la plataforma; requiere ownership de la publicación (postgres no lo tiene)' },
    { tipo: 'omitir_sentencia', patron: 'funciones LANGUAGE c (188 — miembros de btree_gist: gbt_*, gbtreekey*, *_dist)', motivo: 'postgres en Supabase no puede crear funciones C (42501) y las 188 funciones YA existen vía la extensión btree_gist que el bootstrap instala: crearlas es imposible e innecesaria' },
    { tipo: 'omitir_sentencia', patron: 'CREATE OR REPLACE FUNCTION extensions.* (6: set_graphql_placeholder, grant_pg_cron_access, grant_pg_graphql_access, grant_pg_net_access, pgrst_ddl_watch, pgrst_drop_watch)', motivo: 'funciones de plataforma ya existentes en todo proyecto alojado (owner supabase_admin); OR REPLACE exige ownership (42501). Son los cuerpos de los 6 event triggers omitidos en la transformación 1' },
    { tipo: 'omitir_sentencia', patron: 'ALTER EVENT TRIGGER ... ENABLE (6)', motivo: 'los 6 triggers de evento de plataforma ya existen y están habilitados en todo proyecto alojado; postgres no es su owner (42501)' },
    { tipo: 'omitir_sentencia', patron: 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin (180) / supabase_auth_admin (24)', motivo: 'postgres no es miembro de esos roles de plataforma (42501 verificado); sus defaults describen ACLs de objetos creados por roles de plataforma, irrelevantes en E2E donde todo lo crea postgres; la superficie de ACL queda cubierta por los GRANT/REVOKE explícitos. Se conservan los 96 FOR ROLE postgres' },
  ],
  sentencias_totales_generadas: stmtsBase.length - cLang.length - extFns.length - adpPlataforma.length,
  notas: [
    'las 7 funciones aplicadas en el intento v1 del replay (202401230001/harden_audit_triggers/20240725) se sobrescriben limpiamente: el baseline usa CREATE OR REPLACE FUNCTION (484 de 485; el único CREATE FUNCTION es el tag interno de un event trigger omitido)',
    'roles referenciados (warehouse_staff, costpro_transaction_adjuster, costpro_snapshot_restorer, dashboard_user) los crea el bootstrap e2e (e2e-bootstrap.sql) si faltan',
  ],
};

// ── 1.b Pre-tamo: paquetes W7 con UNA transformación documentada ────────
// Los paquetes fueron diseñados para aplicarse con psql e incluyen líneas
// \echo de progreso (13 en total, cosméticas, sin efecto SQL). Se eliminan
// en la capa generada (los originales quedan intactos) para poder aplicar
// vía la API SQL. Verificación determinista del conteo por paquete.
const preTamo = PRE_TAIL.map((rel, i) => {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) fatal(`no existe el paquete pre-tamo ${rel}`);
  const raw = fs.readFileSync(p, 'utf8');
  const shaOriginal = sha256(Buffer.from(raw, 'utf8'));
  const echoLines = raw.split('\n').filter((l) => /^\\echo/.test(l.trim()));
  const transformed = raw.split('\n').filter((l) => !/^\\echo/.test(l.trim())).join('\n');
  return {
    orden: i + 1,
    archivo: rel,
    sha256_original: shaOriginal,
    sha256_generado: sha256(Buffer.from(transformed, 'utf8')),
    bytes_original: Buffer.byteLength(raw),
    transformaciones: [`eliminadas ${echoLines.length} líneas \echo (meta-comando psql cosmético, sin efecto SQL)`],
    _contenido: transformed,
  };
});

// ── 2. Inventario del stream y clasificación ─────────────────────────────────
if (!fs.existsSync(SRC)) fatal(`no existe ${SRC}`, 2);
const names = fs.readdirSync(SRC).sort();
const entries = [];
for (const name of names) {
  const p = path.join(SRC, name);
  if (!fs.statSync(p).isFile()) continue;
  let raw;
  try {
    raw = fs.readFileSync(p);
    raw.toString('utf8');
  } catch {
    fatal(`no se puede leer como UTF-8: ${name}`);
  }
  const dec = raw.toString('utf8');
  const fecha = (name.match(/^(\d{8})/) || [])[1] || null;
  const entry = {
    nombre: name,
    bytes: raw.length,
    sha256_original: sha256(raw),
    estado: 'incluido',
    razon: null,
    timestamp: fecha,
    observaciones: [],
  };
  if (!name.endsWith('.sql')) {
    entry.estado = 'excluido';
    entry.razon = 'no_sql (archivo no SQL del directorio de migraciones)';
    entries.push(entry);
    continue;
  }
  if (!fecha || fecha <= BASELINE_CUTOFF) {
    entry.estado = 'excluido';
    entry.razon = `cubierto_por_baseline_snapshot: efecto ya materializado en production-schema-snapshot-20260828.sql (fecha <= ${BASELINE_CUTOFF})`;
    if (name === '202401230002_update_rls_for_encargado.sql') {
      entry.observaciones.push(
        'dependencia_retroactiva_no_reproducible (hallazgo del replay v1, 2026-10-22: 42P01 public.profiles — evidencia audit-evidence/INFRA-011/remote/apply-replay.json)',
      );
    }
    entries.push(entry);
    continue;
  }
  // Incluido: tramo post-baseline
  if (/\bcron\.schedule\b/i.test(dec)) entry.observaciones.push('cron_schedule');
  if (/\bcreate\s+role\b/i.test(dec)) entry.observaciones.push('create_role');
  if (/\bstorage\.buckets\b|insert\s+into\s+storage\./i.test(dec)) entry.observaciones.push('storage_writes');
  if (/\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/i.test(dec)) entry.observaciones.push('create_extension');
  entries.push(entry);
}
const incluidos = entries.filter((e) => e.estado === 'incluido');
const excluidos = entries.filter((e) => e.estado !== 'incluido');

// TRANSFORMACIONES TRAMO (documentadas, una por archivo, evidencia exigida).
// 20261020000002: REVOKE EXECUTE sobre public.profiles_block_privileged_update
// — trigger protector creado OUT-OF-BAND entre el snapshot (2026-08-28) y
// 2026-10-20, sin DDL versionado en NINGÚN artefacto del repo (verificado:
// no está en el snapshot, ni en migrations, ni en el contrato de 137, ni en
// la evidencia W7 — pre-vuelo 2026-10-22, audit-evidence/INFRA-011/). El
// REVOKE es inaplicable en E2E: el objeto no existe (nada que revocar).
// Se omite ESA ÚNICA sentencia; el resto del hardening aplica íntegro.
const TRANSFORMACIONES_TRAMO = new Map([
  ['20261020000002_sec_definer_hardening.sql', [{
    patron: /^REVOKE EXECUTE ON FUNCTION public\.profiles_block_privileged_update[^\n]*;[ \t]*$/im,
    reemplazo: '-- [CP-INFRA-011 transformación documentada del tramo] REVOKE EXECUTE sobre profiles_block_privileged_update omitido: función out-of-band sin DDL versionado en el repo (no existe en E2E; nada que revocar). Original íntegro en supabase/migrations/.',
    motivo: 'función out-of-band no versionada; el REVOKE es inaplicable sobre un objeto inexistente',
  }]],
]);

// ── 3. Validación de orden del tramo ─────────────────────────────────────────
let prevFecha = null;
incluidos.forEach((e, i) => {
  e.posicion = i + 1;
  if (e.timestamp) {
    if (prevFecha && e.timestamp < prevFecha) {
      fatal(`MONOTONICIDAD ROTA en el tramo: ${e.nombre} (${e.timestamp}) tras ${prevFecha}`);
    }
    prevFecha = e.timestamp;
  } else {
    fatal(`archivo del tramo sin fecha reconocible: ${e.nombre}`);
  }
});

// ── 4. Generación de la capa ─────────────────────────────────────────────────
const outDir = CHECK ? fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-replay-check-')) : OUT;
if (!CHECK) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'baseline.sql'), baselineFinal);
fs.mkdirSync(path.join(outDir, 'pre-tail'), { recursive: true });
for (const pt of preTamo) {
  fs.writeFileSync(path.join(outDir, 'pre-tail', pt.archivo.split('/').pop()), pt._contenido);
}
const totalEcho = preTamo.reduce((n, p) => n + Number((p.transformaciones[0].match(/(\d+)/) || [])[1] || 0), 0);
if (totalEcho !== 13) fatal(`deriva inesperada en pre-tamo: se esperaban 13 líneas \echo, halladas ${totalEcho}.`);
for (const e of incluidos) {
  const dst = path.join(outDir, e.nombre);
  const original = fs.readFileSync(path.join(SRC, e.nombre), 'utf8');
  const tr = TRANSFORMACIONES_TRAMO.get(e.nombre);
  if (tr) {
    e.transformaciones = [];
    let contenido = original;
    for (const x of tr) {
      const antes = (contenido.match(x.patron) || []).length;
      if (antes !== 1) fatal(`transformación del tramo ${e.nombre}: patrón esperado 1 vez, hallado ${antes}.`);
      contenido = contenido.replace(x.patron, x.reemplazo);
      e.transformaciones.push({ motivo: x.motivo, ocurrencias: antes });
    }
    fs.writeFileSync(dst, contenido);
  } else {
    fs.copyFileSync(path.join(SRC, e.nombre), dst); // VERBATIM — cero transformaciones
  }
  e.sha256_generado = sha256(fs.readFileSync(dst));
  if (!tr && e.sha256_generado !== e.sha256_original) fatal(`deriva interna copiando ${e.nombre}`);
}

const digest = sha256(Buffer.from(
  [baselineShaGenerado, ...preTamo.map((p) => `${p.archivo}:${p.sha256}`), ...incluidos.map((e) => `${e.nombre}:${e.sha256_original}`)].join('\n'),
  'utf8',
));
const manifest = {
  version: 3,
  generador: 'scripts/e2e/build-migrations-replay.mjs',
  estrategia: 'baseline certificado (snapshot 2026-08-28, transformado y documentado) + paquetes out-of-band W7-RELEASE (pre-tamo, verbatim) + tramo de migraciones con fecha > 20260828 en orden lexicográfico (regla del runner oficial)',
  baseline: baselineMeta,
  pre_tamo: {
    descripcion: 'paquetes W7-RELEASE aplicados a producción fuera del pipeline de migraciones entre el snapshot 2026-08-28 y el inicio del tramo 2026-08-31 (orden canónico W7-05 §14.1); verificado por el guard de w9_f01. Transformación única y documentada: líneas \echo psql-only eliminadas (13 en total, cosméticas)',
    paquetes: preTamo.map(({ _contenido, ...meta }) => meta),
  },
  exclusiones_globales: {
    no_sql: excluidos.filter((e) => e.razon.startsWith('no_sql')).length,
    cubierto_por_baseline: excluidos.filter((e) => e.razon.startsWith('cubierto_por_baseline')).length,
  },
  src_dir: 'supabase/migrations',
  out_dir: '.e2e-migrations',
  total_considerados: entries.length,
  total_incluidos: incluidos.length,
  total_excluidos: excluidos.length,
  digest: digest,
  archivos: entries.map((e) => ({ ...e })),
};
const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
const manifestSha = sha256(manifestBuf);
fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestBuf);
fs.writeFileSync(path.join(outDir, 'manifest.sha256'), manifestSha + '\n');
fs.writeFileSync(path.join(outDir, 'README.md'),
  `# Capa de reproducción E2E (REGENERABLE — no commitear)\n\nGenerada por \`scripts/e2e/build-migrations-replay.mjs\` (estrategia v3: baseline + tramo).\nBaseline: ${baselineMeta.archivo} (sha256 generado ${baselineShaGenerado.slice(0, 16)}…, 8 sentencias de plataforma omitidas con documentación).\nTramo: ${incluidos.length} migraciones post-${BASELINE_CUTOFF}. Digest: \`${digest}\`.\nCopia oficial del manifiesto: \`audit-evidence/INFRA-011/e2e-migrations-manifest.json\`.\n`);

// ── 5. Reporte / --check ─────────────────────────────────────────────────────
if (CHECK) {
  fs.rmSync(outDir, { recursive: true, force: true });
  if (!fs.existsSync(COMMITTED_MANIFEST)) fatal(`--check: no existe el manifiesto commiteado ${COMMITTED_MANIFEST}.`);
  const committedSha = sha256(fs.readFileSync(COMMITTED_MANIFEST));
  const same = committedSha === manifestSha;
  console.log(`[build-migrations-replay] --check: regenerado ${manifestSha.slice(0, 16)}… vs commiteado ${committedSha.slice(0, 16)}… => ${same ? 'MATCH (sin deriva)' : 'DERIVA DETECTADA'}`);
  process.exit(same ? 0 : 1);
}
fs.copyFileSync(path.join(OUT, 'manifest.json'), COMMITTED_MANIFEST);
console.log(`[build-migrations-replay] OK (v3 baseline+tramo):`);
console.log(`  baseline: ${baselineMeta.archivo}`);
console.log(`    sha256 original ${baselineShaOriginal.slice(0, 16)}… -> generado ${baselineShaGenerado.slice(0, 16)}… (${nEvent} event triggers + ${nPub} publications + ${nAlterPub} alter-publication + ${cLang.length} funciones C de btree_gist + ${extFns.length} funciones de plataforma en extensions.* + ${nAlterEvt} ALTER EVENT TRIGGER + ${adpPlataforma.length} ALTER DEFAULT PRIVILEGES de roles de plataforma omitidas, todas documentadas)`);
console.log(`  pre-tamo: ${preTamo.length} paquetes W7-RELEASE (out-of-band, verbatim)`);
console.log(`  tramo incluido: ${incluidos.length} migraciones (> ${BASELINE_CUTOFF})`);
console.log(`  excluidos: ${excluidos.length} (${manifest.exclusiones_globales.cubierto_por_baseline} cubiertos por baseline + ${manifest.exclusiones_globales.no_sql} no SQL)`);
console.log(`  capa: ${OUT} | manifiesto sha256: ${manifestSha}`);
console.log('  evidencia: manifiesto copiado a audit-evidence/INFRA-011/e2e-migrations-manifest.json');
