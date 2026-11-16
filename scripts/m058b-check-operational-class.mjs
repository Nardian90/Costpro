#!/usr/bin/env node
// M058b — CP-FIN-ULTIMATE-CLOSE-008 · ¿La migración 20261110090000 (ajena al ciclo,
// sin registro en ledger) tiene sus efectos aplicados en producción?
// READ-ONLY ESTRICTO — Management API /database/query, SOLO SELECT.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 300)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${JSON.stringify(rows).slice(0, 300)}`);
  return rows;
}

const out = { fecha_utc: new Date().toISOString(), modo: 'READ-ONLY', version: '20261110090000_cp_operational_class_default_venta' };
// Efecto 1: columna products.operational_class con DEFAULT 'venta' y NOT NULL
out.columna = await q(`SELECT column_default, is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='operational_class'`, 'col products.operational_class');
// Efecto 2: cero productos sin clasificación (backfill + NOT NULL)
out.sin_clasificacion = await q(`SELECT count(*)::int AS n FROM public.products WHERE operational_class IS NULL`, 'products NULL');
// Efecto 3: funciones de catálogo maestro con default 'venta'
out.funciones = await q(`SELECT proname, (pg_get_functiondef(p.oid) LIKE '%''venta''%') AS contiene_venta FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_master_product','activate_master_product')`, 'funcs master');
out.veredicto = (out.columna[0]?.column_default ?? '').includes('venta') && out.columna[0]?.is_nullable === 'NO' && out.sin_clasificacion[0]?.n === 0
  ? 'EFECTOS PRESENTES EN PRODUCCIÓN (aplicada sin registro en ledger — drift de proceso histórico, ajena al ciclo)'
  : 'EFECTOS AUSENTES O PARCIALES (pendiente real, ajena al ciclo)';
writeFileSync(resolve('docs/audits/cp-fin-ultimate-close-008/m058b-20261110090000-check.json'), JSON.stringify(out, null, 2));
console.log('\nVEREDICTO:', out.veredicto);
