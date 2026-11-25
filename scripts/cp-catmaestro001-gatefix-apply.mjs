#!/usr/bin/env node
/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 (cierre CI PR #1710) — Gate-fix
 * ============================================================================
 * Aplica las migraciones de cierre del SQL Security Gate:
 *   · 20261125132000_cp_catmaestro001_reception_rpc_acl.sql  (revoca
 *     PUBLIC/anon EXECUTE en add_reception_items y
 *     save_pending_reception_changes — hallazgo secdef_public_grant)
 *   · 20261125133000_cp_catmaestro001_drop_renumber_tool.sql (retira la
 *     herramienta one-shot ya usada — hallazgo secdef_no_auth)
 *
 * Y VERIFICA el estado final con la MISMA maquinaria del gate de CI:
 * genera scripts/ci-gate-checks.sql (node scripts/ci-gate-sql-checks.js),
 * la ejecuta contra el destino y evalúa con scripts/ci-gate-evaluate.js
 * (canario incluido) — veredicto idéntico al del workflow.
 *
 * Regla de oro: validar primero contra la BD AISLADA (--target=isolated),
 * aplicar en producción UNA SOLA VEZ (--target=prod, exige --confirm-prod
 * + ALLOW_PROD_WRITE=I_UNDERSTAND).
 *
 * Uso:
 *   node scripts/cp-catmaestro001-gatefix-apply.mjs --target=isolated
 *   ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/cp-catmaestro001-gatefix-apply.mjs --target=prod --confirm-prod
 *   node scripts/cp-catmaestro001-gatefix-apply.mjs --target=prod --verify   (solo verificación read-only)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import { assertNotProduction } from './lib/assert-not-production.mjs';

const args = process.argv.slice(2);
const targetArg = (args.find(a => a.startsWith('--target=')) || '').split('=')[1] || 'isolated';
const confirmProd = args.includes('--confirm-prod');
const onlyVerify = args.includes('--verify');
const TARGET = targetArg === 'prod' ? 'prod' : 'isolated';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const prodRef = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
const ref = TARGET === 'prod' ? prodRef : (env.E2E_ALLOWED_REMOTE_REF || 'lguovmvrozxgssupkwpf');

if (TARGET === 'prod') {
  assertNotProduction({ mode: onlyVerify ? 'read' : 'write', url: SUPABASE_URL, context: 'cp-catmaestro001-gatefix-apply' });
  if (!onlyVerify && !confirmProd) { console.error('BLOQUEADO: producción exige --confirm-prod'); process.exit(1); }
  if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: destino prod inesperado'); process.exit(2); }
} else if (ref !== 'lguovmvrozxgssupkwpf') {
  console.error('FALLO DE GUARD: destino aislado inesperado:', ref); process.exit(2);
}

async function execSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 800)}`);
  try { const rows = JSON.parse(text); return Array.isArray(rows) ? rows : []; }
  catch { return []; }
}

// ── Ejecución del gate EXACTA como CI (4 sentencias; el endpoint Management
// API devuelve solo el último result-set → se ejecutan por separado y se
// reconstruye el archivo de resultados `check_id|valor[|args]` + canario). ──
async function runGate() {
  execFileSync('node', [resolve('scripts/ci-gate-sql-checks.js')], { stdio: 'pipe' });
  const gateSql = readFileSync(resolve('scripts/ci-gate-checks.sql'), 'utf8');
  const statements = gateSql.split(';').map(s => s.replace(/--.*$/gm, '').trim()).filter(s => s.length > 0);
  const outLines = [];
  for (const st of statements) {
    const rows = await execSql(st);
    for (const r of rows) {
      const cid = r.check_id ?? r.checkid ?? Object.values(r)[0];
      const rest = Object.values(r).slice(1).filter(v => v !== null && v !== undefined);
      outLines.push([cid, ...rest].join('|'));
    }
  }
  const resultsPath = resolve(`/tmp/cp-gate-results-${TARGET}.txt`);
  writeFileSync(resultsPath, outLines.join('\n') + '\n');
  console.log(`    gate: ${outLines.filter(l => !l.startsWith('__canary__')).length} hallazgo(s)`);
  try {
    const evalOut = execFileSync('node', [resolve('scripts/ci-gate-evaluate.js'), resultsPath], { encoding: 'utf8' });
    process.stdout.write(evalOut);
    return evalOut.includes('TODO PASS') || evalOut.includes('✅') && !evalOut.includes('❌');
  } catch (e) {
    process.stdout.write(String(e.stdout || e.message) + '\n');
    return false;
  }
}

(async () => {
  console.log(`=== GATE-FIX CP-CATMAESTRO-001 · ${onlyVerify ? 'VERIFICACIÓN' : 'APLICACIÓN'} · ${TARGET} (${ref}) ===\n`);

  if (!onlyVerify) {
    for (const f of [
      'supabase/migrations/20261125132000_cp_catmaestro001_reception_rpc_acl.sql',
      'supabase/migrations/20261125133000_cp_catmaestro001_drop_renumber_tool.sql',
    ]) {
      console.log(`[apply] ${f.split('/').pop()}`);
      await execSql(readFileSync(resolve(f), 'utf8'));
    }
    await execSql("NOTIFY pgrst, 'reload schema'");
    console.log('    migraciones aplicadas (idempotentes)\n');
  }

  console.log('[verify] ACL final de las 3 funciones:');
  const acls = await execSql(`SELECT proname, proacl::text FROM pg_proc WHERE proname IN ('add_reception_items','save_pending_reception_changes')`);
  for (const r of acls) console.log(`    ${r.proname}: ${r.proacl}`);
  const gone = await execSql(`SELECT COUNT(*)::int AS n FROM pg_proc WHERE proname = 'cp_catmaestro001_renumber_auto_masters'`);
  console.log(`    cp_catmaestro001_renumber_auto_masters viva: ${gone[0].n} (esperado 0)\n`);

  console.log('[verify] Ejecución del gate de CI (misma maquinaria que el workflow):');
  const ok = await runGate();
  console.log(`\n=== RESULTADO: ${ok ? 'GATE EN VERDE (estado vivo limpio)' : 'GATE CON HALLAZGOS — REVISAR'} ===`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
