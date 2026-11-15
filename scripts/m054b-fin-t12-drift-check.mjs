#!/usr/bin/env node
// ============================================================================
// M054b — CP-FIN-T12-PRIVILEGE-HARDENING-001 · Diagnóstico complementario:
//   D1  mapeo de OIDs grantee → rolname (ACL del helper en producción)
//   D2  drift: definición LIVE del helper/motor vs migración 20261115100000
//   D3  ¿la excepción BODY_DRIFT (fin_post_document_annulment/2) ya es
//       innecesaria? (requisito previo a su retirada)
// READ-ONLY ESTRICTO — Management API /database/query, SOLO SELECT.
// Uso: node scripts/m054b-fin-t12-drift-check.mjs
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 400)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} fila(s)`);
  return rows;
}

const OUT_DIR = resolve('docs/audits/fin-t12-privilege-hardening-001');
const out = { fecha_utc: new Date().toISOString(), modo: 'READ-ONLY' };

// ── D1: OIDs → nombres ───────────────────────────────────────────────────────
out.oid_map = await q(`
  SELECT r.oid, r.rolname
  FROM pg_roles r
  WHERE r.oid IN (16384, 16481, 16482)
  ORDER BY r.oid`, 'D1 OIDs grantee');

// ── D2: definiciones LIVE de las 3 funciones T12 ─────────────────────────────
const live = await q(`
  SELECT p.proname, p.oid::regprocedure::text AS firma, pg_get_functiondef(p.oid) AS def,
         pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('fin_entry_reversal_residual','fin_post_document_annulment','fin_t12_block_receipt_annulment')
  ORDER BY p.proname`, 'D2 definiciones LIVE');
out.definiciones_live = live.map(r => ({ firma: r.firma, owner: r.owner, proacl: r.proacl, def: r.def }));

// ── Comparación contra la migración del repo ─────────────────────────────────
const mig = readFileSync(resolve('supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql'), 'utf8');
const extraerBloque = (nombre) => {
  // Extrae "CREATE OR REPLACE FUNCTION public.<nombre>..." hasta "$function$;" final
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nombre}[\\s\\S]*?\\$function\\$;`);
  const m = mig.match(re);
  return m ? m[0] : null;
};
out.drift = {};
for (const r of live) {
  const nombre = r.proname;
  if (nombre === 'fin_t12_block_receipt_annulment') continue; // trigger: se compara solo que exista
  const bloqueMig = extraerBloque(nombre);
  const bloqueLive = (r.def || '').includes('$function$')
    ? (r.def.match(/CREATE OR REPLACE FUNCTION public\.[\s\S]*?\$function\$/) || [null])[0]
    : null;
  const normalizar = (s) => (s || '').replace(/\s+/g, ' ').replace(/\s/g, ' ').trim();
  out.drift[nombre] = {
    bloque_en_migracion: !!bloqueMig,
    bloque_en_live: !!bloqueLive,
    identicos_normalizados: bloqueMig && bloqueLive ? normalizar(bloqueMig) === normalizar(bloqueLive) : false,
  };
}

writeFileSync(resolve(OUT_DIR, 'diagnostico-drift-oid-map.json'), JSON.stringify(out, null, 2) + '\n');
console.log('\n== D1 ==', JSON.stringify(out.oid_map));
console.log('== D2 drift ==', JSON.stringify(out.drift, null, 1));
console.log(`Evidencia: ${OUT_DIR}/diagnostico-drift-oid-map.json`);
