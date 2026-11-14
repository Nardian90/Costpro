#!/usr/bin/env node
/**
 * M025b — CP-RECEIPT-INTEGRITY-001: inserción de la auditoría TRACEABILITY_BACKFILL
 * de los 101 movimientos de FAC-VITALLCONS-001. El UPDATE idempotente de M025 ya
 * se aplicó y verificó (101/101 con reference_id); este paso completa el requisito
 * «registrar usuario, fecha y motivo» con jsonb_build_object (sin escapes frágiles).
 * Idempotente: NOT EXISTS por (record_id, action) — re-ejecutable sin duplicar.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: env.NEXT_PUBLIC_SUPABASE_URL, context: 'm025b-auditoria-trazabilidad.mjs' });
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const ACTOR = 'a1111111-1111-1111-1111-111111111111';

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 400)}`);
  return JSON.parse(text || '[]');
}

// Pareo determinista (idéntico a M024/M025)
const lineas = await q(`SELECT ri.id::text, ri.product_id::text, ri.quantity::float8,
    (ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1))::float8 AS uc_cup
  FROM public.receipt_items ri WHERE ri.receipt_id='${FVC}' ORDER BY ri.created_at, ri.id`);
const movs = await q(`SELECT sm.id::text, sm.product_id::text, sm.quantity_change::float8, sm.unit_cost::float8
  FROM public.stock_movements sm
  WHERE sm.store_id='${ENER}' AND sm.movement_type='purchase' AND sm.reference_id='${FVC}'
  ORDER BY sm.id`);
console.log('movimientos ya corregidos (reference_id=FVC):', movs.length);

const pareo = [];
for (const m of movs) {
  const cand = lineas.filter((l) => l.product_id === m.product_id
    && Math.abs(l.quantity - Math.abs(m.quantity_change)) <= 1e-6
    && Math.abs(l.uc_cup - m.unit_cost) <= 0.005);
  if (cand.length === 1) pareo.push({ mov: m.mov || m.id, linea: cand[0].id });
}
console.log('pareo unívoco:', pareo.length, '(esperado 101)');
if (pareo.length !== 101) { console.error('ABORT: pareo ≠ 101'); process.exit(3); }

// Inserción idempotente de auditoría por movimiento
let ok = 0, ya = 0;
for (const p of pareo) {
  const sql = `INSERT INTO public.audit_logs
    (user_id, table_name, record_id, action, old_data, new_data, metadata, store_id)
  SELECT '${ACTOR}', 'stock_movements', '${p.mov}', 'TRACEABILITY_BACKFILL',
    jsonb_build_object('reference_id', NULL),
    jsonb_build_object('reference_id', '${FVC}'),
    jsonb_build_object(
      'motivo', 'CP-RECEIPT-INTEGRITY-001 seccion 8: backfill trazable de reference_id con asociacion univoca demostrada (producto+cantidad+costo CUP, analisis M024); solo se anade la referencia, valores economicos intactos',
      'linea_recepcion', '${p.linea}',
      'recepcion', '${FVC}',
      'mision', 'CP-RECEIPT-INTEGRITY-001',
      'aplicado_por', 'm025-corrige-trazabilidad-movimientos.mjs (UPDATE) + m025b (auditoria)',
      'reversible', 'UPDATE stock_movements SET reference_id=NULL WHERE id=registro AND reference_id=recepcion — inversion documentada en el expediente'),
    '${ENER}'
  WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs a
    WHERE a.table_name='stock_movements' AND a.record_id='${p.mov}' AND a.action='TRACEABILITY_BACKFILL')`;
  try { await q(sql); ok++; } catch (e) { console.error('FALLO', p.mov, e.message.slice(0, 120)); }
}
const total = await q(`SELECT count(*)::int AS n FROM public.audit_logs
  WHERE action='TRACEABILITY_BACKFILL'`);
console.log(`auditoría insertada: ${ok}/101 | filas TRACEABILITY_BACKFILL en audit_logs: ${total[0].n}`);
if (total[0].n !== 101) { console.error('FALLO: auditoría incompleta'); process.exit(9); }
console.log('OK — auditoría completa (usuario, fecha, motivo, old/new por movimiento).');
