#!/usr/bin/env node
/**
 * cpbra-r11-historical-sales.mjs — CP-BRA-FINAL-VERIFICATION (FASE 4 · R-11)
 * SOLO LECTURA: detalle de las 3 ventas 'completed' con Σpagos ≠ total
 * (diferencias −200, −12.000, +8.100 CUP) para determinar si son
 * explicables, trazables y compatibles con las reglas actuales.
 * NO modifica nada.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'wthkddeleylijmonclxg';
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  try {
    const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), 'utf8');
    const m = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
    if (m) process.env.SUPABASE_ACCESS_TOKEN = m[1].trim();
  } catch { /* noop */ }
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: token'); process.exit(2); }

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const rows = await runSql(`
  SELECT t.id, t.created_at, t.total_amount, t.payment_method, t.payment_incidents, t.notes,
         s.name AS store_name,
         (SELECT COALESCE(SUM(pt.amount_cup),0) FROM payment_transactions pt
           WHERE pt.transaction_id = t.id) AS pagado_cup,
         (SELECT json_agg(json_build_object('m', pt.payment_method, 'cur', pt.currency,
                       'amt', pt.amount, 'cup', pt.amount_cup, 'dir', pt.direction, 'date', pt.payment_date))
            FROM payment_transactions pt WHERE pt.transaction_id = t.id) AS pagos,
         (SELECT count(*) FROM transaction_items ti WHERE ti.transaction_id = t.id) AS n_items
  FROM transactions t LEFT JOIN stores s ON s.id = t.store_id
  WHERE t.status = 'completed'
    AND t.payment_incidents IS NOT NULL
    AND jsonb_array_length(t.payment_incidents) > 0
  ORDER BY t.created_at`);

let n = 0;
for (const r of rows) {
  const diff = Number(r.pagado_cup) - Number(r.total_amount);
  if (Math.abs(diff) <= 0.01) continue; // explican el total: no son descuadre
  n++;
  console.log(`\n■ VENTA ${r.id.slice(0,8)} · ${new Date(r.created_at).toISOString().slice(0,16)} · tienda=${r.store_name}`);
  console.log(`  total=${Number(r.total_amount).toFixed(2)} pagado=${Number(r.pagado_cup).toFixed(2)} DIFERENCIA=${diff.toFixed(2)} items=${r.n_items}`);
  console.log(`  incidencias=${JSON.stringify(r.payment_incidents)}`);
  console.log(`  notas=${JSON.stringify((r.notes ?? '').slice(0, 200))}`);
  (r.pagos ?? []).forEach(p => console.log(`    pago ${p.m}/${p.cur} amt=${Number(p.amt).toFixed(2)} cup=${Number(p.cup).toFixed(2)} dir=${p.dir ?? 'in'} ${String(p.date).slice(0,16)}`));
  // ¿El descuadre real está EXPLICADO por alguna incidencia (regla actual)?
  const incs = r.payment_incidents ?? [];
  const explained = incs.some(i => Math.abs(Number(i.difference_cup ?? NaN) - diff) <= 0.01);
  // ¿La incidencia es estructuralmente válida bajo la regla nueva?
  const structurallyValid = incs.length > 0 && incs.every(i =>
    ['insufficient_payment','overpayment','mixed_breakdown_mismatch','rate_difference'].includes(i.type ?? '') &&
    Number.isFinite(Number(i.expected_cup)) && Number.isFinite(Number(i.received_cup)) && Number.isFinite(Number(i.difference_cup)) &&
    Math.abs(Number(i.difference_cup) - (Number(i.received_cup) - Number(i.expected_cup))) <= 0.01);
  console.log(`  → ¿diferencia EXPLICADA por una incidencia (regla §18 actual)? ${explained ? 'SÍ' : 'NO'}`);
  console.log(`  → ¿incidencia(s) estructuralmente válidas (regla §11.6 actual)? ${structurallyValid ? 'SÍ' : 'NO'}`);
  console.log(`  → ¿compatibles con las reglas actuales? ${explained && structurallyValid ? 'SÍ (el payload actual las habría aceptado y trazado)' : 'NO (la venta actual sería rechazada: ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE)'}`);
}
console.log(`\nTotal ventas 'completed' con incidencias y Σpagos≠total: ${n}`);
console.log('SOLO LECTURA — ninguna venta fue modificada.');
