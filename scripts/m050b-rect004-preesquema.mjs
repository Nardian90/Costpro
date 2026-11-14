// ============================================================================
// M050b-pre — CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004:
// PROBE de esquema de producción (READ-ONLY): tablas y columnas para la
// verificación exhaustiva de DP-2 (deuda proveedor) y DP-3 (salidas).
// Solo SELECT sobre information_schema / pg_catalog. Producción INTACTA.
// Uso: node scripts/m050b-rect004-preesquema.mjs
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
  return JSON.parse(text || '[]');
}

const OUT = { mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004', generado: new Date().toISOString(), esquema: {} };

// 1. payment_transactions — columnas y relaciones posibles
OUT.esquema.payment_transactions = await q(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='payment_transactions' ORDER BY ordinal_position`, 'payment_transactions cols');

// 2. ¿Qué tablas existen con 'payment' o 'credit' o 'nota' en el nombre?
OUT.esquema.tablas_fin_pagos = await q(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND (table_name ILIKE '%payment%' OR table_name ILIKE '%cred%'
     OR table_name ILIKE '%cxp%' OR table_name ILIKE '%supplier%' OR table_name ILIKE '%provider%'
     OR table_name ILIKE '%nota%')
   ORDER BY table_name`, 'tablas pagos/credito');

// 3. devolutions — estructura (devoluciones a proveedor como nota de crédito potencial)
OUT.esquema.devolutions_cols = await q(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='devolutions' ORDER BY ordinal_position`, 'devolutions cols');

// 4. vistas con 'cxp'/'purchase'/'provider'
OUT.esquema.vistas_cxp = await q(
  `SELECT viewname FROM pg_views WHERE schemaname='public'
     AND (viewname ILIKE '%cxp%' OR viewname ILIKE '%purchase%' OR viewname ILIKE '%provider%' OR viewname ILIKE '%pago%')
   ORDER BY viewname`, 'vistas cxp');

// 5. receipts — columnas de liquidación
OUT.esquema.receipts_cols = await q(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='receipts' ORDER BY ordinal_position`, 'receipts cols');

// 6. triggers sobre receipts / fin_entries (nombre + función)
OUT.esquema.triggers_fin = await q(
  `SELECT event_object_table, trigger_name FROM information_schema.triggers
   WHERE trigger_schema='public' AND event_object_table IN ('receipts','receipt_items','fin_entries','fin_movements','payment_transactions','issue_slips','inventory_adjustments')
   ORDER BY event_object_table, trigger_name`, 'triggers');

console.log(JSON.stringify(OUT.esquema, null, 1).slice(0, 3000));
writeFileSync('/home/z/my-project/scripts/out/m050b-preesquema.json', JSON.stringify(OUT, null, 2));
console.log('[OK] esquema → scripts/out/m050b-preesquema.json');
