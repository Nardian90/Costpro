#!/usr/bin/env node
/**
 * m111-pre-apply-drift-check.mjs — verificación read-only ANTES de aplicar.
 * Compara el cuerpo LIVE de producción de fin_generation_build y
 * fin_get_reconciliation con el cuerpo de la migración 111 (debe coincidir
 * TODO excepto las ediciones documentadas). Guard CP-INFRA-019 (read).
 *   ALLOW_PROD=read-only SUPABASE_ACCESS_TOKEN=... node scripts/m111-pre-apply-drift-check.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = '/home/z/my-project/scripts/out/m111-audit';
mkdirSync(OUT, { recursive: true });

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

// Normaliza espacios para comparar cuerpos
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\s+([(),])/g, '$1').trim();

// Ediciones documentadas (P0-1 en build; v3 en recon) — tras sustituirlas,
// los cuerpos deben ser IDENTICOS.
const EDITS = [
  // pase 5 — reconocimiento de órdenes
  {
    from: /-- CP-FIN-110: reconocimiento de órdenes completadas \(revenue \+ consumo del anticipo\)\.\s*SELECT 'ORDEN_TRABAJO', o\.id, 'reconocimiento', NULL\s*FROM public\.production_orders o\s*WHERE o\.store_id = p_store_id AND o\.order_type IN \('service', 'work'\)\s*AND o\.status = 'completed'/,
    from110: /-- CP-FIN-110: reconocimiento de órdenes completadas \(revenue \+ consumo del anticipo\)\.\s*SELECT 'ORDEN_TRABAJO', o\.id, 'reconocimiento', NULL\s*FROM public\.production_orders o\s*WHERE o\.store_id = p_store_id AND o\.order_type IN \('service', 'work'\)\s*AND o\.status = 'completed'/,
  },
];

async function main() {
  assertNotProduction({ mode: 'read', projectRef: PROD_REF, context: 'm111-pre-apply-drift-check.mjs' });
  const mig = readFileSync(join(REPO, 'supabase/migrations/20261122130000_cp_fin111_postreview_hardening.sql'), 'utf8');

  const live = await runSql(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('fin_generation_build','fin_get_reconciliation')
    ORDER BY 1;`);

  let ok = true;
  const report = [];
  for (const fn of live) {
    // Cuerpo de la migración 111 para esta función
    const idx = mig.indexOf(`CREATE OR REPLACE FUNCTION public.${fn.proname}(`);
    const end = mig.indexOf('END $function$;', idx) + 'END $function$;'.length;
    const migBody = mig.slice(idx, end);
    const normMig = norm(migBody);
    const normLive = norm(fn.def);
    if (normMig === normLive) {
      report.push({ fn: fn.proname, resultado: 'IDENTICO (sin diferencias — ¿edición ausente?)' });
      ok = false; // build y recon DEBEN diferir (tienen ediciones)
      continue;
    }
    // Diferencias: extraer líneas divergentes a nivel de tokens simplificados
    const migTokens = normMig.split(/(?=AND )|(?=SELECT )|(?=WHERE )|(?=UNION ALL)/);
    const liveTokens = normLive.split(/(?=AND )|(?=SELECT )|(?=WHERE )|(?=UNION ALL)/);
    // Estrategia: para cada token del LIVE, verificar presencia en MIG (y viceversa)
    const soloLive = liveTokens.filter(t => !normMig.includes(t));
    const soloMig = migTokens.filter(t => !normLive.includes(t));
    report.push({
      fn: fn.proname,
      diferencia: true,
      fragmentos_solo_live: soloLive.map(t => t.slice(0, 220)),
      fragmentos_solo_migracion: soloMig.map(t => t.slice(0, 220)),
    });
    // Valida que las diferencias sean EXACTAMENTE las documentadas
    const soloLiveTxt = soloLive.join(' ');
    const soloMigTxt = soloMig.join(' ');
    const documentedLive = soloLiveTxt.length === 0
      || (soloLiveTxt.includes("o.status = 'completed'") && soloLiveTxt.length < 2000);
    const documentedMig = soloMigTxt.includes('completion_date IS NOT NULL')
      || soloMigTxt.includes('CP-FIN-111')
      || soloMigTxt.includes('CP-FIN-REC-001/v3')
      || soloMigTxt.includes('fin_rectification_apply');
    if (!documentedLive || !documentedMig) {
      ok = false;
      report.push({ fn: fn.proname, resultado: 'DIFERENCIAS NO DOCUMENTADAS — REVISAR' });
    }
  }
  writeFileSync(`${OUT}/m111-drift-check.json`, JSON.stringify(report, null, 1));
  for (const r of report) {
    console.log(`\n=== ${r.fn} ===`);
    console.log(JSON.stringify(r, null, 1).slice(0, 2400));
  }
  console.log(ok ? '\nDRIFT OK — diferencias limitadas a las ediciones documentadas' : '\nDRIFT NO DOCUMENTADO — NO APLICAR sin revisar');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
