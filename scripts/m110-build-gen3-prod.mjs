#!/usr/bin/env node
/**
 * m110-build-gen3-prod.mjs — CP-FIN-110: ciclo de generación GEN-3 en producción.
 * fin_generation_create → fin_generation_build(include_ajuste_ids=[RECT-110-A])
 *   → fin_generation_validate (ok=true exigido) → fin_generation_activate.
 *
 * El pase 1 re-deriva TODAS las ventas con la métrica corregida (riel-primacía:
 * las 3 ventas legacy vuelven a caja CUP); el pase 4 copia RECT-110-A por lista
 * explícita; el pase 5 postea la cobertura completa (incl. ORDEN_TRABAJO:
 * 34 anticipos históricos).
 *
 * Idempotencia/seguridad: aborta si GEN-3 ya existe; validación fall-closed;
 * activación atómica (pg_advisory_xact_lock) — activa→superseded (nunca se
 * borra), rollback disponible (fin_generation_rollback).
 * Uso:
 *   ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND SUPABASE_ACCESS_TOKEN=... \
 *     node scripts/m110-build-gen3-prod.mjs [--check] [--skip-build]
 */
import { writeFileSync } from 'node:fs';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const OUT = '/home/z/my-project/scripts/out/m110-audit';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 900)}`);
  return JSON.parse(text);
}

async function main() {
  const mode = process.argv.includes('--check') ? 'read' : 'write';
  assertNotProduction({ mode, projectRef: PROD_REF, context: 'm110-build-gen3-prod.mjs' });

  // 0) Estado previo
  const pre = await runSql(`
    SELECT code, status, stats::text AS stats FROM public.fin_posting_generations
    WHERE store_id='${STORE}' ORDER BY created_at;`);
  console.log('Generaciones previas:', pre.map(g => `${g.code}:${g.status}`).join(', '));
  const gen3 = pre.find(g => g.code === 'GEN-3');
  if (gen3 && gen3.status === 'active') {
    console.log('GEN-3 YA ACTIVA — nada que hacer (idempotente).');
    return;
  }
  if (mode === 'read') { console.log('--check: GEN-3 no activa aún.'); return; }

  // RECT-110-A debe existir en la generación activa (pase 4 copia desde ahí)
  const rect = await runSql(`
    SELECT e.id FROM public.fin_entries e
    WHERE e.store_id='${STORE}' AND e.document_number='RECT-110-A-SOBRECOSTE-COGS'
      AND e.event='ajuste_manual'
      AND e.generation_id IS NOT DISTINCT FROM public.fin_active_generation('${STORE}');`);
  if (!rect.length) throw new Error('GUARDA: RECT-110-A no está en la generación activa — ejecutar m110-rectification-prod.mjs primero');
  const rectId = rect[0].id;
  console.log('RECT-110-A presente en GEN activa:', rectId);

  if (!gen3) {
    const created = await runSql(`
      SELECT public.fin_generation_create('${STORE}', 'GEN-3',
        'CP-FIN-110: re-derivación con métrica corregida (riel-primacía VENTA), reglas ORDEN_TRABAJO v1 (anticipos + reconocimiento) y RECT-110-A incluida por lista explícita (pase 4).',
        NULL) AS g;`);
    console.log('GEN-3 creada:', JSON.stringify(created[0]));
  }

  // BUILD (pase 1 re-deriva; pase 4 copia RECT-110-A; pase 5 cobertura completa)
  const build = await runSql(`
    SELECT public.fin_generation_build(
      '${STORE}',
      (SELECT id FROM public.fin_posting_generations WHERE store_id='${STORE}' AND code='GEN-3' AND status IN ('building','candidate')),
      false,
      ARRAY['${rectId}']::uuid[],
      NULL) AS build;`);
  console.log('BUILD:', JSON.stringify(build[0].build, null, 1));
  writeFileSync(`${OUT}/m110-gen3-build.json`, JSON.stringify(build[0].build, null, 1));
  if (Number(build[0].build.errores) !== 0) throw new Error('GUARDA: build con errores — NO activar');

  // VALIDATE (ok=true exigido)
  const val = await runSql(`
    SELECT public.fin_generation_validate(
      '${STORE}',
      (SELECT id FROM public.fin_posting_generations WHERE store_id='${STORE}' AND code='GEN-3' AND status='candidate'),
      NULL) AS v;`);
  const v = val[0].v;
  console.log('VALIDATE:', JSON.stringify({ ok: v.ok, desb: v.asientos_desequilibrados, identidad: v.identidad_global, dup: v.duplicados, err: v.errores_construccion }));
  writeFileSync(`${OUT}/m110-gen3-validate.json`, JSON.stringify(v, null, 1));
  if (v.ok !== true) throw new Error('GUARDA: validación NO ok — NO activar');

  // ACTIVATE
  const act = await runSql(`
    SELECT public.fin_generation_activate(
      '${STORE}',
      (SELECT id FROM public.fin_posting_generations WHERE store_id='${STORE}' AND code='GEN-3' AND status='candidate'),
      NULL) AS a;`);
  console.log('ACTIVATE:', JSON.stringify(act[0].a));
  const post = await runSql(`
    SELECT code, status FROM public.fin_posting_generations WHERE store_id='${STORE}' ORDER BY created_at;`);
  console.log('Generaciones post:', post.map(g => `${g.code}:${g.status}`).join(', '));
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
