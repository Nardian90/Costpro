#!/usr/bin/env node
/**
 * IC-DIVIZA-003 — Diagnóstico READ-ONLY de producción (Supabase Management API).
 *
 * 1. Últimas filas por fuente (BCC / Diviza / elToque) del segmento 3.
 * 2. Resumen por fuente (min/max rate_date, nº filas).
 * 3. Definiciones VIVAS de las 4 funciones del paso informal
 *    (pg_get_functiondef) → se guardan en artefactos para construir la
 *    migración de retiro de elToque.
 *
 * SIN ESCRITURAS: solo SELECT against catalogs y exchange_rates.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '/home/z/my-project/costpro/.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = (SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/) || [])[1];

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

(async () => {
  console.log(`▶ Proyecto: ${PROJECT_REF}\n`);

  // 1. Últimas filas por fuente (segmento informal = 3)
  const latest = await q(`
    SELECT DISTINCT ON (source, currency)
      source, currency, rate_date, rate, capture_method, captured_at, source_updated_at
    FROM public.exchange_rates
    WHERE segment = '3'
    ORDER BY source, currency, rate_date DESC, captured_at DESC;
  `);
  console.log('═══ ÚLTIMA FILA POR (source, currency) segmento 3 ═══');
  for (const r of latest) {
    console.log(
      `${r.source.padEnd(8)} ${r.currency.padEnd(4)} ${r.rate_date} rate=${r.rate} ` +
      `method=${r.capture_method} captured=${(r.captured_at || '').slice(0, 19)} ` +
      `src_upd=${(r.source_updated_at || '—').toString().slice(0, 19)}`,
    );
  }

  // 2. Resumen por fuente
  const summary = await q(`
    SELECT source, count(*) AS n, min(rate_date) AS first_date, max(rate_date) AS last_date
    FROM public.exchange_rates GROUP BY source ORDER BY source;
  `);
  console.log('\n═══ RESUMEN POR FUENTE (todas las filas) ═══');
  for (const r of summary) {
    console.log(`${r.source.padEnd(8)} n=${String(r.n).padEnd(5)} ${r.first_date} → ${r.last_date}`);
  }

  // 3. ¿Existen filas con rate_date FUTURA (legado bug UTC)?
  const future = await q(`
    SELECT source, currency, rate_date, rate, captured_at
    FROM public.exchange_rates
    WHERE rate_date > CURRENT_DATE + 1
    ORDER BY rate_date DESC LIMIT 10;
  `);
  console.log('\n═══ FILAS rate_date > CURRENT_DATE+1 (legado UTC) ═══');
  if (future.length === 0) console.log('(ninguna)');
  for (const r of future) console.log(`${r.source} ${r.currency} ${r.rate_date} rate=${r.rate}`);

  // 4. Definiciones vivas de las 4 funciones del paso informal
  const funcs = await q(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_sale_v2','create_cash_flow_document','get_cash_balances_by_currency','open_cash_shift')
    ORDER BY p.proname;
  `);
  console.log(`\n═══ FUNCIONES VIVAS (${funcs.length}) ═══`);
  const outDir = '/home/z/my-project/costpro/scripts/mision-ic-diviza-003/live-funcs';
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of funcs) {
    const n = f.def.match(/IN \('elToque', 'Diviza'\)/g)?.length ?? 0;
    const file = path.join(outDir, `${f.proname}.sql`);
    fs.writeFileSync(file, f.def + '\n');
    console.log(`${f.proname.padEnd(32)} bytes=${String(f.def.length).padEnd(7)} IN('elToque','Diviza')×${n} → ${file}`);
  }

  // 5. ¿Cuál gana HOY como informal vigente bajo la regla actual (IN ambos)?
  const today = await q(`SELECT to_char(now() AT TIME ZONE 'America/Havana', 'YYYY-MM-DD') AS op;`);
  const opDate = today[0].op;
  const vigente = await q(`
    SELECT source, currency, rate_date, rate, capture_method, captured_at, source_updated_at
    FROM public.exchange_rates
    WHERE source IN ('elToque','Diviza') AND currency = 'USD' AND segment = '3'
      AND capture_method <> 'carry_forward'
    ORDER BY rate_date DESC, captured_at DESC LIMIT 3;
  `);
  console.log(`\n═══ INFORMAL USD VIGENTE BAJO REGLA ACTUAL (fecha operativa ${opDate}) ═══`);
  for (const r of vigente) {
    console.log(
      `${r.source.padEnd(8)} ${r.rate_date} rate=${r.rate} method=${r.capture_method} ` +
      `captured=${(r.captured_at || '').slice(0, 19)}`,
    );
  }

  console.log('\n✅ Diagnóstico read-only completado (0 escrituras).');
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
