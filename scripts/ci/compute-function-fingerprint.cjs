#!/usr/bin/env node
/**
 * CP-SEC-005 (T3.3) — Huella de funciones SECURITY DEFINER de public y
 * comparación contra la referencia certificada committeada.
 *
 * SIN CREDENCIALES INCORPORADAS: las credenciales llegan por entorno.
 * Dos modos:
 *   1. DATABASE_URL=postgres://... node scripts/ci/compute-function-fingerprint.cjs [--export]
 *      (usa pg, ya presente en node_modules; sirve para CostproE2E vía su
 *       URL de pooler y para un replay local levantado con postgres)
 *   2. SUPABASE_ACCESS_TOKEN=... CP_FP_REF=<ref-proyecto> node scripts/ci/compute-function-fingerprint.cjs [--export]
 *      (Management API de Supabase; para CostproE2E usar CP_FP_REF del proyecto
 *       aislado y para CostproBD el ref de producción — SOLO LECTURA: la query
 *       es un SELECT de catálogo).
 *
 * Comparación contra docs/security/certified-function-fingerprint.json
 * (huella de la REFERENCIA CERTIFICADA = producción, exportada 2026-11-04),
 * excluyendo la lista de excepciones documentada (ver JSON).
 *
 * NO está cableado como gate de CI: requiere credenciales de BD (regla de la
 * misión T3.3). Salida: informe y exit 1 si hay divergencias no excepcionadas.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const REF_JSON = path.join(REPO, 'docs', 'security', 'certified-function-fingerprint.json');
const EXPORT = process.argv.includes('--export');

function fingerprintFromRows(rows) {
  const map = {};
  for (const r of rows) map[`${r.name}/${r.args.replace(/\s+/g, ' ').trim()}`] = r.fp;
  return map;
}

async function fetchViaPg() {
  const { Client } = require(path.join(REPO, 'node_modules', 'pg'));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(
    `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args,
            md5(pg_get_functiondef(p.oid)) AS fp
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' AND p.prosecdef ORDER BY 1, 2`);
  await client.end();
  return fingerprintFromRows(res.rows);
}

async function fetchViaMgmt() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.CP_FP_REF;
  if (!token || !ref) throw new Error('Falta DATABASE_URL o el par SUPABASE_ACCESS_TOKEN/CP_FP_REF');
  const sql = `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args,
      md5(pg_get_functiondef(p.oid)) AS fp
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef ORDER BY 1, 2`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}`);
  return fingerprintFromRows(await res.json());
}

async function main() {
  const current = await (process.env.DATABASE_URL ? fetchViaPg() : fetchViaMgmt());
  const certifiedDoc = JSON.parse(fs.readFileSync(REF_JSON, 'utf8'));
  const certified = certifiedDoc.functions;
  const exceptions = new Set(certifiedDoc.excluded_from_comparison);

  const problems = [];
  const ok = [];
  for (const [k, fp] of Object.entries(certified)) {
    if (current[k] === undefined) problems.push(`FALTA en la BD analizada (está en la referencia): ${k}`);
    else if (current[k] !== fp) problems.push(`CUERPO DISTINTO: ${k}`);
    else ok.push(k);
  }
  for (const [k] of Object.entries(current)) {
    if (certified[k] === undefined && !exceptions.has(k)) problems.push(`SOBRANTE respecto a la referencia (y no excepcionado): ${k}`);
  }
  console.log(`Funciones en la referencia certificada: ${Object.keys(certified).length}`);
  console.log(`Funciones en la BD analizada: ${Object.keys(current).length}`);
  console.log(`Coincidentes: ${ok.length} · Excepciones documentadas: ${exceptions.size}`);
  if (EXPORT) {
    fs.writeFileSync(REF_JSON, JSON.stringify({ ...certifiedDoc, functions: current, exported_at: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
    console.log(`--export: ${REF_JSON} actualizado con la huella de la BD analizada.`);
    return;
  }
  if (problems.length) {
    console.log('\nDIVERGENCIAS (bloqueantes salvo que estén en la lista de excepciones):');
    problems.forEach(p => console.log('  ✗ ' + p));
    process.exit(1);
  }
  console.log('\nPARIDAD: la BD analizada coincide con la referencia certificada.');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
