#!/usr/bin/env node
// M106b — seguimiento read-only: banco, entregas de caja, esquemas faltantes
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function q(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m106b:${label}` });
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
  catch (e) { out[id] = { error: e.message }; console.log(`${id}: ERROR ${e.message.slice(0, 150)}`); }
}

// T1 tiendas
await sec('T1', `SELECT id, name, created_at FROM public.stores ORDER BY created_at;`);
// T2 columnas fin_movements / cash_closures / stores
await sec('T2', `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('fin_movements','cash_closures','stores','fin_entries','payment_transactions') ORDER BY table_name, ordinal_position;`);
// T3 movimientos de bancos (todos los documentos)
await sec('T3', `
SELECT e.document_type, e.event, e.economic_date, e.document_number, e.description,
       m.sense, m.amount_cup, m.currency_origin, count(*) AS n
FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
WHERE m.category_code='ACT_BANCOS'
GROUP BY e.document_type, e.event, e.economic_date, e.document_number, e.description, m.sense, m.amount_cup, m.currency_origin
ORDER BY e.economic_date LIMIT 300;`);
// T4 pago vinculado a la entrega USD
await sec('T4', `SELECT * FROM public.payment_transactions WHERE id='54e27645-4860-4fca-ba8e-b2949e7a1105' OR ref_id IN ('cd07fc7d-222c-423a-8afc-463252e4b411','f158d156-d067-4d88-8eae-a0638424d39a');`);
// T5 payments no venta/devolución (concepto entrega?)
await sec('T5', `SELECT ref_type, direction, count(*) n, sum(amount_cup) total_cup, sum(CASE WHEN currency='USD' THEN amount ELSE 0 END) usd_nominal FROM public.payment_transactions GROUP BY ref_type, direction ORDER BY ref_type;`);
// T6 efectivo CUP: movimientos por documento (para entender saldo 1,026,370)
await sec('T6', `
SELECT e.document_type, e.event, m.sense, count(*) n, round(sum(m.amount_cup),2) total
FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
WHERE m.category_code='ACT_EFECTIVO_CUP'
GROUP BY e.document_type, e.event, m.sense ORDER BY 1,2,3;`);
// T7 bancos por documento resumido
await sec('T7', `
SELECT e.document_type, e.event, m.sense, count(*) n, round(sum(m.amount_cup),2) total,
       sum(CASE WHEN m.currency_origin='USD' THEN m.amount ELSE 0 END) usd_nominal
FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
WHERE m.category_code='ACT_BANCOS'
GROUP BY e.document_type, e.event, m.sense ORDER BY 1,2,3;`);
// T8 cierres de caja (esquema real)
await sec('T8', `SELECT * FROM public.cash_closures ORDER BY 1 DESC LIMIT 20;`);
// T9 enum/valores concept de cash_flow_documents
await sec('T9', `SELECT DISTINCT concept, doc_type, currency, count(*) FROM public.cash_flow_documents GROUP BY 1,2,3;`);
// T10 payments en USD totales (cobros históricos USD)
await sec('T10', `
SELECT currency, payment_method, count(*) n, sum(amount) nominal, sum(amount_cup) cup, min(payment_date) desde, max(payment_date) hasta
FROM public.payment_transactions WHERE direction IN ('in','refund') OR direction IS NULL
GROUP BY currency, payment_method ORDER BY currency, payment_method;`);
// T11 movimientos USD del asiento VENTA: comprobar las 5 ventas y sus contrapartidas completas
await sec('T11', `
SELECT e.id AS entry_id, e.document_type, e.document_number, e.economic_date, m.category_code, m.sense, m.amount_cup, m.currency_origin, m.description
FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
WHERE e.document_id IN ('8757444f-f38b-4b05-8a51-77b322f3769d','e825ba93-e752-4c0e-87f8-f38fbf80c57c','6501f8da-e759-4493-945a-5e3adc76ebb2','9d1ccef8-83ab-4fca-8eb9-ab016eb98a85','97263a9c-054f-45a0-a6fe-bc52c155bcff')
ORDER BY e.economic_date, m.id;`);
// T12 ¿existen depósitos bancarios en caja (concept deposito/ingreso)?
await sec('T12', `SELECT f.id, f.doc_type, f.concept, f.currency, f.amount, f.amount_cup, f.operation_date, f.status, f.counterparty, f.justification, f.payment_transaction_id FROM public.cash_flow_documents f ORDER BY f.operation_date;`);
// T13 usuario responsable y perfiles implicados
await sec('T13', `SELECT id, email, full_name, role FROM public.profiles WHERE id IN ('a1111111-1111-1111-1111-111111111111','84ef824e-8066-4efa-afc7-102918c6c982');`);
// T14 vales/egresos de caja CUP posteriores a la entrega (flujo caja CUP saldo)
await sec('T14', `
SELECT m.economic_date, e.document_type, e.document_number, m.sense, m.amount_cup, m.description
FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
WHERE m.category_code='ACT_EFECTIVO_CUP' AND e.document_type='FLUJO_CAJA'
ORDER BY m.economic_date;`);
// T15 apertura: ¿qué entradas existen con event='apertura'? (debe ser 0)
await sec('T15', `SELECT count(*) FROM public.fin_entries WHERE event='apertura';`);

mkdirSync(resolve(process.cwd(), 'scripts/out/m015'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'scripts/out/m015/extract-b.json'), JSON.stringify(out, null, 1));
console.log('Guardado scripts/out/m015/extract-b.json');
