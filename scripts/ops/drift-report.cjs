#!/usr/bin/env node
/**
 * T2 D2.3 — INFORME DE DERIVA (COSTPRO) — NO es gate de CI.
 * ============================================================================
 * Compara el catálogo VIVO de un proyecto contra:
 *   1. la huella certificada (docs/security/certified-function-fingerprint.json,
 *      con su lista de excepciones documentada), y
 *   2. la superficie del contrato de seguridad (supabase/security-contract/
 *      contract-surface.sql — entradas @contract-function), y
 *   3. (solo CostproE2E) el estado del replay (e2e_infra.e2e_migrations_replay_state).
 * Emite un informe MARKDOWN sin PII (nombres de objetos, sin datos).
 *
 * CREDENCIALES: NUNCA en el repo. Dos modos por entorno:
 *   SUPABASE_ACCESS_TOKEN=… CP_DRIFT_REF=<ref-proyecto> node scripts/ops/drift-report.cjs
 *   DATABASE_URL=postgres://… node scripts/ops/drift-report.cjs
 * SOLO LECTURA: todas las consultas son SELECT de catálogo.
 *
 * CUÁNDO CORRERLO (proceso, ver docs/OPERATIONS/PROCESO_CAMBIOS_PRODUCCION.md):
 *   ANTES de cada aplicación en producción (línea base del informe) y DESPUÉS
 *   de cada una (verificación posterior). Guardar la salida en
 *   audit-evidence/<ID>/drift-report-<fecha>.md.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const REF_JSON = path.join(REPO, 'docs', 'security', 'certified-function-fingerprint.json');
const CONTRACT = path.join(REPO, 'supabase', 'security-contract', 'contract-surface.sql');

function slug(s) { return s.replace(/\s+/g, ' ').trim(); }

async function viaMgmt(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.CP_DRIFT_REF;
  if (!token || !ref) throw new Error('Falta SUPABASE_ACCESS_TOKEN/CP_DRIFT_REF');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}`);
  return res.json();
}

async function viaPg(sql) {
  const { Client } = require(path.join(REPO, 'node_modules', 'pg'));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(sql);
  await client.end();
  return res.rows;
}
const q = process.env.DATABASE_URL ? viaPg : viaMgmt;

const QUERIES = {
  funciones: `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args,
      md5(pg_get_functiondef(p.oid)) AS fp, p.prosecdef AS is_sd
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' ORDER BY 1, 2`,
  rls: `SELECT count(*) AS tablas, count(*) FILTER (WHERE relrowsecurity) AS con_rls
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  objetos: `SELECT
      (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS politicas,
      (SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace) AS constraints,
      (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON t.tgrelid=c.oid JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND NOT t.tgisinternal) AS triggers,
      (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indices`,
};

function parseContractSurface() {
  const sql = fs.readFileSync(CONTRACT, 'utf8');
  const out = [];
  for (const m of sql.matchAll(/@contract-function name=([a-z0-9_]+) args="([^"]*)"/g)) {
    out.push(`${m[1]}/${slug(m[2])}`);
  }
  return out;
}

async function main() {
  const cert = JSON.parse(fs.readFileSync(REF_JSON, 'utf8'));
  const exceptions = new Set(cert.excluded_from_comparison);
  const [fns, rls, objetos] = await Promise.all([
    q(QUERIES.funciones), q(QUERIES.rls), q(QUERIES.objetos),
  ]);
  const sd = new Map(fns.filter(r => r.is_sd).map(r => [`${r.name}/${slug(r.args)}`, r]));
  const contract = new Set(parseContractSurface());

  const faltan = [], cuerpo = [], sobrantes = [];
  for (const [k, v] of Object.entries(cert.functions)) {
    if (!sd.has(k)) faltan.push(k);
    else if (sd.get(k).fp !== v) cuerpo.push(k);
  }
  for (const k of sd.keys()) if (cert.functions[k] === undefined && !exceptions.has(k)) sobrantes.push(k);

  const contratoFaltan = [...contract].filter(k => !sd.has(k));
  const replayRows = await q(`select nombre, estado from e2e_infra.e2e_migrations_replay_state where estado <> 'aplicada' order by nombre`).catch(() => null);

  const ref = process.env.CP_DRIFT_REF || '(DATABASE_URL)';
  const lines = [];
  lines.push(`# Informe de deriva — ${ref} — ${new Date().toISOString()}`);
  lines.push('');
  lines.push('| Métrica | Valor |');
  lines.push('|---|---|');
  lines.push(`| Funciones public (todas) | ${fns.length} |`);
  lines.push(`| Funciones SECURITY DEFINER | ${sd.size} |`);
  lines.push(`| Tablas / con RLS | ${rls[0].tablas} / ${rls[0].con_rls} |`);
  lines.push(`| Políticas · constraints · triggers · índices (public) | ${objetos[0].politicas} · ${objetos[0].constraints} · ${objetos[0].triggers} · ${objetos[0].indices} |`);
  lines.push('');
  lines.push('## 1. Huella certificada (docs/security/certified-function-fingerprint.json)');
  lines.push('');
  lines.push(`- FALTAN en el proyecto (${faltan.length}): ${faltan.slice(0, 8).join(', ') || 'ninguna'}${faltan.length > 8 ? ` … (+${faltan.length - 8})` : ''}`);
  lines.push(`- CUERPO DISTINTO (${cuerpo.length}): ${cuerpo.slice(0, 8).join(', ') || 'ninguna'}${cuerpo.length > 8 ? ` … (+${cuerpo.length - 8})` : ''}`);
  lines.push(`- SOBRANTES no excepcionados (${sobrantes.length}): ${sobrantes.slice(0, 8).join(', ') || 'ninguno'}${sobrantes.length > 8 ? ` … (+${sobrantes.length - 8})` : ''}`);
  lines.push(`- Excepciones documentadas: ${exceptions.size}`);
  lines.push('');
  lines.push('## 2. Superficie del contrato de seguridad (contract-surface.sql)');
  lines.push('');
  lines.push(`- Entradas @contract-function: ${contract.size}`);
  lines.push(`- FALTAN en el proyecto (${contratoFaltan.length}): ${contratoFaltan.slice(0, 8).join(', ') || 'ninguna'}${contratoFaltan.length > 8 ? ` … (+${contratoFaltan.length - 8})` : ''}`);
  lines.push('');
  lines.push('## 3. Estado del replay (solo CostproE2E)');
  lines.push('');
  lines.push(replayRows
    ? (replayRows.length ? `- Filas en estado distinto de 'aplicada': ${replayRows.map(r => `${r.nombre}=${r.estado}`).join(', ')}` : `- Todas las filas del replay en estado 'aplicada'.`)
    : '- No disponible (la tabla de estado del replay no existe en este proyecto o la consulta falló).');
  lines.push('');
  lines.push('> Informe SOLO LECTURA. No es gate de CI. Sin PII. Registrar en audit-evidence/ antes y después de cada aplicación en producción.');
  const report = lines.join('\n');
  if (process.argv.includes('--out')) {
    const out = path.join(REPO, process.argv[process.argv.indexOf('--out') + 1]);
    fs.writeFileSync(out, report + '\n');
    console.log(`informe escrito: ${out}`);
  } else {
    console.log(report);
  }
  const bloqueante = faltan.length + cuerpo.length + sobrantes.length;
  process.exitCode = bloqueante > 0 ? 1 : 0;
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
