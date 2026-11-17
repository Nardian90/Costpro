#!/usr/bin/env node
// M106c — read-only: pagos USD ENERVIDA, ventana caja, turnos y state del turno 23-10
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function q(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m106c:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text || '[]');
}

const out = {};
async function sec(id, sql) {
  try { out[id] = await q(sql, id); console.log(`${id}: ${out[id].length} filas`); }
  catch (e) { out[id] = { error: e.message }; console.log(`${id}: ERROR ${e.message.slice(0, 160)}`); }
}

// U1 todos los pagos USD de ENERVIDA (cualquier ref_type)
await sec('U1', `SELECT ref_type, ref_id, payment_method, currency, amount, exchange_rate, amount_cup, direction, payment_date, notes FROM public.payment_transactions WHERE store_id='${STORE}' AND currency='USD' ORDER BY payment_date LIMIT 200;`);
// U2 pagos USD cash ENERVIDA antes del egreso 23-10 16:00Z
await sec('U2', `SELECT count(*) n, sum(amount) usd, sum(amount_cup) cup FROM public.payment_transactions WHERE store_id='${STORE}' AND currency='USD' AND payment_method='cash' AND payment_date < '2026-10-23 16:00:00+00' AND coalesce(direction,'in')='in';`);
// U3 get_cash_currency_summary: definición viva
await sec('U3', `SELECT prosrc FROM pg_proc WHERE proname='get_cash_currency_summary';`);
// U4 create_cash_flow_document: definición viva (validaciones de egreso)
await sec('U4', `SELECT prosrc FROM pg_proc WHERE proname='create_cash_flow_document';`);
// U5 turno/caja sesiones de ENERVIDA alrededor del 23-10
await sec('U5', `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%cash%' OR table_name LIKE '%shift%' OR table_name LIKE '%turno%');`);
// U6 ¿más egresos FLUJO_CAJA en fin engine? (documento de egreso anulado?)
await sec('U6', `SELECT e.id, e.document_id, e.event, e.economic_date, e.description, e.posted_at FROM public.fin_entries e WHERE e.document_type='FLUJO_CAJA' ORDER BY e.economic_date;`);
// U7 pagos USD zelle ENERVIDA (para el banco) resumen
await sec('U7', `SELECT payment_method, count(*) n, sum(amount) usd, sum(amount_cup) cup, min(payment_date) desde, max(payment_date) hasta FROM public.payment_transactions WHERE store_id='${STORE}' AND currency='USD' GROUP BY payment_method;`);
// U8 estado del documento egreso: anulado? IDs de reversión
await sec('U8', `SELECT id, doc_type, concept, status, annulled_at, annulment_reason, annulment_payment_transaction_id, related_document_id, amount, currency FROM public.cash_flow_documents WHERE store_id='${STORE}';`);

mkdirSync(resolve(process.cwd(), 'scripts/out/m015'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'scripts/out/m015/extract-c.json'), JSON.stringify(out, null, 1));
console.log('Guardado scripts/out/m015/extract-c.json');
