#!/usr/bin/env node
/**
 * VENTANA CP-SEC-027 — EJECUTOR (fases T-0 / A / C contra Supabase wthkddeleylijmonclxg)
 *
 * Ejecuta los artefactos VERBATIM del paquete aprobado:
 *   t0     → download/cp-sec-027-paquete-ejecucion/t0_linea_base_readonly.sql (solo SELECT)
 *   fasea  → download/cp-sec-027-paquete-ejecucion/fase_a_aditiva.sql   (3 vistas + 3 GRANT, idempotente)
 *   fasec  → download/cp-sec-027-paquete-ejecucion/fase_c_restriccion.sql (DROP policies + policy authenticated + 3 REVOKE)
 *
 * Conexión: Management API POST /v1/projects/{ref}/database/query (mismo método validado
 * por scripts/diag_estado_produccion_costpro.js). Credenciales leídas de .env (nunca en argv).
 * Fail-fast en fases DDL; evidencia JSON por fase en download/cp-sec-027-ejecucion-20261019/.
 *
 * Uso: node ventana_cpsec027.mjs t0|fasea|fasec
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = '/home/z/my-project/costpro-recovery';
const PAQUETE = '/home/z/my-project/download/cp-sec-027-paquete-ejecucion';
const OUT = '/home/z/my-project/download/cp-sec-027-ejecucion-20261019';
const RAW = path.join(OUT, 'raw');
const REF = 'wthkddeleylijmonclxg';

function loadEnv() {
  const env = {};
  for (const raw of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const ENV = loadEnv();
const TOKEN = ENV.SUPABASE_ACCESS_TOKEN;
const ANON = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!TOKEN || !ANON) {
  console.error('FATAL: faltan SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env');
  process.exit(2);
}

const TS = () => new Date().toISOString();
fs.mkdirSync(RAW, { recursive: true });

async function sql(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

async function restGet(p) {
  const res = await fetch(`https://${REF}.supabase.co/rest/v1/${p}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  let body = null;
  try { body = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, filas: Array.isArray(body) ? body.length : null };
}

/** Divide un archivo SQL en sentencias: quita líneas de comentario y separa por ';'. */
function splitStatements(file) {
  const noComments = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  return noComments
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

async function runList(nombre, file, { failFast, capturar }) {
  const stmts = splitStatements(file);
  const out = { archivo: file, num_statements: stmts.length, statements: [], ts: TS() };
  console.log(`\n══ ${nombre}: ${stmts.length} sentencias de ${path.basename(file)} ══`);
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    try {
      const rows = await sql(s);
      const entry = { n: i + 1, ok: true, sql: s.slice(0, 600), filas: Array.isArray(rows) ? rows.length : 0 };
      if (capturar) entry.resultado = rows;
      out.statements.push(entry);
      console.log(`  [${i + 1}/${stmts.length}] OK (${entry.filas} filas) ${s.slice(0, 70)}…`);
    } catch (e) {
      out.statements.push({ n: i + 1, ok: false, sql: s.slice(0, 600), error: String(e) });
      console.error(`  [${i + 1}/${stmts.length}] FALLO ${s.slice(0, 70)}… → ${e}`);
      if (failFast) { out.abortado_en = i + 1; break; }
    }
  }
  out.ts_fin = TS();
  return out;
}

async function postA() {
  const vistas = await sql(`SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname IN ('public_catalog_v','public_storefronts_v','public_variants_v') ORDER BY viewname`);
  const grants = await sql(`SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND table_name LIKE 'public\\_%\\_v' ORDER BY table_name`);
  const probes = {};
  probes.public_catalog_v = await restGet('public_catalog_v?select=id&limit=1');
  probes.public_storefronts_v = await restGet('public_storefronts_v?select=slug&limit=1');
  probes.public_variants_v = await restGet('public_variants_v?select=id&limit=1');
  return { vistas: vistas.map((v) => v.viewname), grants_anon_vistas: grants, probes_anon: probes };
}

async function postC() {
  const pols = await sql(`SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname='public' AND tablename IN ('products','stores','product_variants') ORDER BY tablename, policyname`);
  const grantsTablas = await sql(`SELECT table_name FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND table_name IN ('products','stores','product_variants') AND privilege_type='SELECT'`);
  const grantsVistas = await sql(`SELECT table_name FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND table_name LIKE 'public\\_%\\_v' ORDER BY table_name`);
  const vistas = await sql(`SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname IN ('public_catalog_v','public_storefronts_v','public_variants_v') ORDER BY viewname`);
  const probes = {};
  for (const t of ['products', 'stores', 'product_variants']) probes[`tabla_${t}`] = await restGet(`${t}?select=id&limit=1`);
  for (const v of ['public_catalog_v', 'public_storefronts_v', 'public_variants_v']) probes[`vista_${v}`] = await restGet(`${v}?select=id&limit=1`);
  return {
    policies_restantes: pols.map((p) => `${p.tablename}.${p.policyname} [${String(p.roles).replace(/[{}]/g, '')}]`),
    grants_anon_tablas: grantsTablas.map((g) => g.table_name),
    grants_anon_vistas: grantsVistas.map((g) => g.table_name),
    vistas: vistas.map((v) => v.viewname),
    probes_anon: probes,
  };
}

const cmd = process.argv[2];
const evidencia = { ref: REF, tipo: 'ventana-cp-sec-027', ts_inicio: TS() };

if (cmd === 't0') {
  evidencia.fase = 'T-0 línea base (solo lectura)';
  evidencia.resultado = await runList('T-0', path.join(PAQUETE, 't0_linea_base_readonly.sql'), { failFast: false, capturar: true });
  const destino = path.join(OUT, 't0_linea_base_viva.json');
  fs.writeFileSync(destino, JSON.stringify(evidencia, null, 2));
  console.log(`\nEvidencia T-0 → ${destino}`);
} else if (cmd === 'endurecer') {
  // HARDENING detectado durante la ventana: Supabase default privileges dio INSERT/UPDATE/
  // DELETE/TRUNCATE/REFERENCES/TRIGGER a anon/authenticated sobre las vistas NUEVAS, con
  // owner postgres (BYPASSRLS) y vistas auto-actualizables → vía de escritura que esquiva
  // el RLS de products/stores/product_variants. La Fase A declara "SELECT SOLO a anon":
  // este REVOKE restaura la intención del paquete (estilo de casa: vale_salida.sql L204+).
  const REVOKE = 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.public_catalog_v, public.public_storefronts_v, public.public_variants_v FROM anon, authenticated';
  evidencia.fase = 'Hardening de ventana: vistas público = SELECT (anula default privileges de escritura)';
  console.log(`\n══ HARDENING: REVOKE escritura sobre vistas (anon/authenticated conservan SELECT) ══`);
  try {
    await sql(REVOKE);
    evidencia.revoke = { ok: true, sql: REVOKE };
    console.log('  OK');
    evidencia.post_checks = {
      privilegios_posteriores: await sql(`SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
        FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name IN ('public_catalog_v','public_storefronts_v','public_variants_v')
          AND grantee IN ('anon','authenticated','service_role')
        GROUP BY grantee, table_name ORDER BY table_name, grantee`),
    };
    console.log(JSON.stringify(evidencia.post_checks, null, 1));
  } catch (e) {
    evidencia.revoke = { ok: false, sql: REVOKE, error: String(e) };
    console.error(`  FALLO: ${e}`);
  }
  evidencia.ts_fin = TS();
  const destino = path.join(OUT, 'hardening_vistas_solo_select.json');
  fs.writeFileSync(destino, JSON.stringify(evidencia, null, 2));
  console.log(`\nEvidencia hardening → ${destino}`);
  if (!evidencia.revoke.ok) process.exit(1);
} else if (cmd === 'fasea') {
  evidencia.fase = 'Fase A aditiva (vistas + grants)';
  evidencia.ejecucion = await runList('FASE A', path.join(PAQUETE, 'fase_a_aditiva.sql'), { failFast: true, capturar: false });
  const abortada = evidencia.ejecucion.abortado_en;
  if (!abortada) {
    evidencia.post_checks = await postA();
    console.log('\n── Post-checks Fase A ──');
    console.log(JSON.stringify(evidencia.post_checks, null, 1));
  }
  const destino = path.join(OUT, 'fase_a_resultado.json');
  fs.writeFileSync(destino, JSON.stringify(evidencia, null, 2));
  console.log(`\nEvidencia Fase A → ${destino}${abortada ? ' — ABORTADA en sentencia ' + abortada : ''}`);
  if (abortada) process.exit(1);
} else if (cmd === 'fasec') {
  evidencia.fase = 'Fase C restricción (policies + revoke)';
  evidencia.ejecucion = await runList('FASE C', path.join(PAQUETE, 'fase_c_restriccion.sql'), { failFast: true, capturar: false });
  const abortada = evidencia.ejecucion.abortado_en;
  if (!abortada) {
    evidencia.post_checks = await postC();
    console.log('\n── Post-checks Fase C ──');
    console.log(JSON.stringify(evidencia.post_checks, null, 1));
  }
  const destino = path.join(OUT, 'fase_c_resultado.json');
  fs.writeFileSync(destino, JSON.stringify(evidencia, null, 2));
  console.log(`\nEvidencia Fase C → ${destino}${abortada ? ' — ABORTADA en sentencia ' + abortada : ''}`);
  if (abortada) process.exit(1);
} else {
  console.error('Uso: node ventana_cpsec027.mjs t0|fasea|fasec');
  process.exit(2);
}
