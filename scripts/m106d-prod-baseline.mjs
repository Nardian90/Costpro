#!/usr/bin/env node
// ============================================================================
// M106d — CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 · LÍNEA BASE
// READ-ONLY de PRODUCCIÓN (wthkddeleylijmonclxg) antes de m109. Re-ejecutable.
//   S1  reglas VENTA/FLUJO_CAJA (versiones/estado)    S6  6 movimientos del USD
//   S2  CHECK de fin_opening_balances                 S7  ventas USD espejo (3)
//   S3  funciones con marcador M-015                  S8  saldos de cuenta clave
//   S4  trigger fin_opening_applied_guard             S9  fin_posting_errors
//   S5  fin_opening_balances                          S10 egresos entrega_efectivo
// Guard CP-INFRA-019: modo 'read' sobre producción.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const OUT = 'scripts/out/m015';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN ausente en .env');

async function q(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m106d:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text || '[]');
}

const out = { mision: 'CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015', script: 'm106d-linea-base', generado: new Date().toISOString(), secciones: {} };
let n = 0;
async function sec(id, nombre, sql) {
  n += 1;
  console.log(`S${id} ${nombre} ...`);
  try {
    const rows = await q(sql, `S${id}_${nombre}`);
    out.secciones[`S${id}`] = { nombre, filas: rows.length, data: rows };
    console.log(`  OK ${rows.length} filas`);
  } catch (e) {
    out.secciones[`S${id}`] = { nombre, error: e.message };
    console.log(`  ERROR ${e.message.slice(0, 200)}`);
  }
}

await sec(1, 'reglas', `SELECT document_type, version, status, created_at::date, effective_from
  FROM public.fin_rule_versions WHERE document_type IN ('VENTA','FLUJO_CAJA') AND store_id IS NULL
  ORDER BY document_type, version, created_at;`);
await sec(2, 'check_amount', `SELECT conname, pg_get_constraintdef(oid) def
  FROM pg_constraint WHERE conrelid='public.fin_opening_balances'::regclass AND contype='c' AND conname LIKE '%amount%';`);
await sec(3, 'funciones_m015', `SELECT proname,
  (prosrc LIKE '%diferencia_cobro_debe_cup%') tiene_diferencia,
  (prosrc LIKE '%apertura en cero%' OR prosrc LIKE '%declaración de apertura en cero%' OR prosrc LIKE '%declaracion de apertura en cero%') tiene_cero
  FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND proname IN ('fin_compute_metrics','fin_apply_opening_balance');`);
await sec(4, 'trigger_apertura', `SELECT tgname, tgenabled FROM pg_trigger
  WHERE tgrelid='public.fin_opening_balances'::regclass AND NOT tgisinternal;`);
await sec(5, 'opening_balances', `SELECT count(*) n FROM public.fin_opening_balances;`);
await sec(6, 'seis_movimientos', `SELECT e.id fin_entry_id, m.id fin_movement_id, e.document_type, m.economic_date, m.sense, m.amount_cup, m.currency_origin
  FROM public.fin_movements m JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND m.category_code='ACT_EFECTIVO_USD'
  ORDER BY m.economic_date;`);
await sec(7, 'ventas_espejo', `SELECT left(t.id::text,8) tid, t.created_at::date fecha, t.total_amount, t.status,
  (SELECT count(*) FROM public.fin_entries e WHERE e.document_type='VENTA' AND e.document_id=t.id) posted
  FROM public.transactions t
  WHERE t.id IN ('68e7464d-c50d-426f-a8ff-cbe701e9d1a5','28e94349-0a3e-499c-935f-c4a25c9db3fe','23ccd04f-db81-4537-a3db-2dabf40e31a8');`);
await sec(8, 'saldos_clave', `SELECT category_code, round(sum(CASE WHEN sense='debito' THEN amount_cup ELSE -amount_cup END),2) saldo
  FROM public.fin_movements WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND category_code IN ('ACT_EFECTIVO_CUP','ACT_EFECTIVO_USD','ACT_BANCOS','ACT_INVENTARIO','ACT_OTROS_CORR','GAS_OTROS_OPER','GAS_COSTO_VENTAS','ING_VENTAS','PAS_CXP_PROV')
  GROUP BY 1 ORDER BY 1;`);
await sec(9, 'posting_errors', `SELECT count(*) n FROM public.fin_posting_errors WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND resolved_at IS NULL;`);
await sec(10, 'entregas_efectivo', `SELECT document_number, concept, amount, currency, exchange_rate, amount_cup, operation_date::date, status
  FROM public.cash_flow_documents WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND concept='entrega_efectivo' ORDER BY operation_date;`);

mkdirSync(resolve(process.cwd(), OUT), { recursive: true });
const f = resolve(process.cwd(), `${OUT}/prod-baseline.json`);
writeFileSync(f, JSON.stringify(out, null, 1));
console.log(`Guardado: ${f}`);
