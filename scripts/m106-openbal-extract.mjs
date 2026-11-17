#!/usr/bin/env node
// ============================================================================
// M106 — CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 · EXTRACCIÓN
// READ-ONLY sobre producción (CP-INFRA-019: mode 'read' + ALLOW_PROD).
// Secciones:
//   S1  tiendas                      S8  payment_transactions de las VENTA USD
//   S2  fin_opening_balances         S9  cash_flow_documents (los 6 + huérfanos)
//   S3  catálogo fin_categories      S10 tasa de cambio en fechas clave
//   S4  balance sheet 2026-11-17     S11 caja: arqueos (cash_closures USD)
//   S5  movimientos ACT_EFECTIVO_*   S12 RLS/grants fin_opening_balances
//   S6  los 6 movimientos del USD    S13 motor: errores/estado APERTURA_FIN
//   S7  asientos completos (entries) S14 legado: ingresos/egresos pre 01-07
// Salida: scripts/out/m015/extract.json (16 secciones)
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD = 'wthkddeleylijmonclxg';
const MISION = 'CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN ausente en .env');

async function q(sql, label) {
  assertNotProduction({ mode: 'read', projectRef: PROD, context: `m106:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text || '[]');
}

const out = { mision: MISION, generado: new Date().toISOString(), secciones: {} };
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
    console.log(`  ERROR: ${e.message.slice(0, 200)}`);
  }
}

// S1 — Tiendas
await sec(1, 'tiendas', `SELECT id, name, created_at, is_deleted FROM public.stores ORDER BY created_at;`);

// S2 — Saldos iniciales (¿sigue vacío?)
await sec(2, 'fin_opening_balances', `SELECT o.id, o.store_id, s.name AS store_name, o.category_code, o.amount, o.currency, o.exchange_rate, o.amount_cup, o.as_of_date, o.status, o.entry_id, o.notes, o.created_by, o.created_at, o.applied_at FROM public.fin_opening_balances o LEFT JOIN public.stores s ON s.id = o.store_id ORDER BY o.created_at;`);
await sec(21, 'fin_opening_counts', `SELECT (SELECT count(*) FROM public.fin_opening_balances) total, (SELECT count(*) FROM public.fin_opening_balances WHERE status='applied') applied, (SELECT count(*) FROM public.fin_opening_balances WHERE status='draft') draft, (SELECT count(*) FROM public.fin_opening_balances WHERE status='voided') voided;`);

// S3 — Catálogo de categorías
await sec(3, 'fin_categories', `SELECT code, name, clase, grupo, sort_order FROM public.fin_categories ORDER BY sort_order;`);

// S4 — Balance sheet a 2026-11-17 por tienda (SQL idéntico al RPC)
await sec(4, 'balance_sheet_20261117', `
WITH saldos AS (
  SELECT m.store_id, c.code, c.name, c.clase, c.grupo, c.sort_order,
         round(CASE WHEN c.clase IN ('activo','gasto')
               THEN sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END)
               ELSE sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END)
             END, 2) AS saldo,
         count(DISTINCT m.entry_id) AS movimientos
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.economic_date <= DATE '2026-11-17'
  GROUP BY m.store_id, c.code, c.name, c.clase, c.grupo, c.sort_order
  HAVING round(CASE WHEN c.clase IN ('activo','gasto')
               THEN sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END)
               ELSE sum(CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END)
             END, 2) <> 0
)
SELECT s.name AS tienda, d.code, d.name AS cuenta, d.clase, d.grupo, d.saldo, d.movimientos
FROM saldos d JOIN public.stores s ON s.id = d.store_id
ORDER BY s.name, d.sort_order;`);

// S5 — Movimientos por cuenta de efectivo/bancos (todas las tiendas, corte 11-17)
await sec(5, 'saldos_efectivo_por_tienda', `
SELECT s.name AS tienda, m.category_code,
       round(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),2) AS saldo_cup,
       count(*) AS n_movs,
       sum(CASE WHEN m.sense='debito' THEN 1 ELSE 0 END) AS n_debitos,
       sum(CASE WHEN m.sense='credito' THEN 1 ELSE 0 END) AS n_creditos
FROM public.fin_movements m JOIN public.stores s ON s.id = m.store_id
WHERE m.category_code IN ('ACT_EFECTIVO_CUP','ACT_EFECTIVO_USD','ACT_BANCOS')
  AND m.economic_date <= DATE '2026-11-17'
GROUP BY s.name, m.category_code ORDER BY s.name, m.category_code;`);

// S6 — TODOS los movimientos de ACT_EFECTIVO_USD con asiento y documento
await sec(6, 'usd_movimientos_completos', `
SELECT s.name AS tienda, m.id AS fin_movement_id, m.entry_id AS fin_entry_id,
       e.document_type, e.document_id, e.document_number AS doc_asiento, m.document_number AS doc_mov,
       e.event, m.economic_date, m.sense, m.amount AS importe_original, m.currency_origin,
       m.exchange_rate AS tasa_mov, m.amount_cup, m.description, e.posted_at, e.created_by,
       pe.email AS creado_por_email
FROM public.fin_movements m
JOIN public.fin_entries e ON e.id = m.entry_id
JOIN public.stores s ON s.id = m.store_id
LEFT JOIN public.profiles pe ON pe.id = e.created_by
WHERE m.category_code = 'ACT_EFECTIVO_USD'
ORDER BY m.economic_date, e.posted_at;`);

// S7 — Asientos completos de los entries implicados en el USD (para contrapartidas)
await sec(7, 'entries_relacionados_usd', `
WITH ids AS (SELECT DISTINCT entry_id AS id FROM public.fin_movements WHERE category_code='ACT_EFECTIVO_USD')
SELECT e.id AS fin_entry_id, s.name AS tienda, e.document_type, e.document_id, e.document_number,
       e.event, e.economic_date, e.description, e.posted_at, e.created_by, pe.email AS creado_por_email,
       m.category_code, m.sense, m.amount, m.currency_origin, m.exchange_rate, m.amount_cup, m.description AS mov_desc
FROM public.fin_entries e
JOIN ids ON ids.id = e.id
JOIN public.stores s ON s.id = e.store_id
LEFT JOIN public.profiles pe ON pe.id = e.created_by
JOIN public.fin_movements m ON m.entry_id = e.id
ORDER BY e.economic_date, e.posted_at, m.orden;`);

// S8 — Documentos origen de las VENTA (payments) y del FLUJO_CAJA
await sec(8, 'ventas_pagos_usd', `
WITH vts AS (
  SELECT DISTINCT e.document_id AS tx_id
  FROM public.fin_entries e
  JOIN public.fin_movements m ON m.entry_id = e.id
  WHERE e.document_type='VENTA' AND m.category_code='ACT_EFECTIVO_USD')
SELECT t.id AS transaction_id, s.name AS tienda, t.invoice_number, t.sale_currency,
       t.sale_exchange_rate, t.total_amount, t.status, t.created_at::date AS fecha,
       p.id AS payment_id, p.ref_type, p.ref_id, p.amount AS pago_original, p.currency AS pago_moneda,
       p.exchange_rate AS tasa_pago, p.amount_cup AS pago_cup, p.payment_method, p.direction,
       p.payment_date, p.reference, p.paid_by
FROM vts
LEFT JOIN public.transactions t ON t.id = vts.tx_id
LEFT JOIN public.stores s ON s.id = t.store_id
LEFT JOIN public.payment_transactions p ON p.ref_type='sale' AND p.ref_id = t.id
ORDER BY t.created_at, p.created_at;`);

await sec(22, 'transacciones_ventas_usd_items', `
WITH vts AS (
  SELECT DISTINCT e.document_id AS tx_id
  FROM public.fin_entries e
  JOIN public.fin_movements m ON m.entry_id = e.id
  WHERE e.document_type='VENTA' AND m.category_code='ACT_EFECTIVO_USD')
SELECT t.id AS transaction_id, t.invoice_number, t.sale_currency, t.sale_exchange_rate,
       t.total_amount, t.status, count(ti.id) AS n_items,
       sum(ti.quantity) AS n_unidades, sum(round(ti.quantity * coalesce(NULLIF(ti.cost_at_sale,0),0),2)) AS costo_declarado
FROM vts
JOIN public.transactions t ON t.id = vts.tx_id
LEFT JOIN public.transaction_items ti ON ti.transaction_id = t.id
GROUP BY t.id, t.invoice_number, t.sale_currency, t.sale_exchange_rate, t.total_amount, t.status
ORDER BY t.created_at;`);

// S9 — cash_flow_documents: el de 293,600 + inventario completo reciente
await sec(9, 'cash_flow_document_293600', `SELECT * FROM public.cash_flow_documents WHERE id = 'cd07fc7d-222c-423a-8afc-463252e4b411';`);
await sec(31, 'cash_flow_documents_todos', `
SELECT f.id, s.name AS tienda, f.doc_type, f.concept, f.currency, f.amount, f.amount_cup,
       f.operation_date, f.status, f.created_at, f.created_by, pe.email AS creado_por_email,
       (SELECT e.id FROM public.fin_entries e WHERE e.document_type='FLUJO_CAJA' AND e.document_id=f.id) AS fin_entry_id
FROM public.cash_flow_documents f
LEFT JOIN public.stores s ON s.id = f.store_id
LEFT JOIN public.profiles pe ON pe.id = f.created_by
ORDER BY f.operation_date DESC LIMIT 100;`);

// S10 — Tasa de cambio en fechas clave
await sec(10, 'tasas', `
SELECT * FROM public.exchange_rates
WHERE rate_date BETWEEN DATE '2026-06-25' AND DATE '2026-11-17'
ORDER BY rate_date DESC LIMIT 200;`);
await sec(23, 'tasas_tablas_existentes', `
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND (table_name LIKE '%exchange%' OR table_name LIKE '%rate%');`);

// S11 — Caja: arqueos y cierres con USD (evidencia de existencia física)
await sec(11, 'cash_closures_usd', `
SELECT c.id, s.name AS tienda, c.closure_date, c.*
FROM public.cash_closures c JOIN public.stores s ON s.id = c.store_id
ORDER BY c.closure_date DESC LIMIT 50;`);

// S12 — RLS y grants de fin_opening_balances
await sec(12, 'rls_fin_opening', `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename='fin_opening_balances';`);
await sec(24, 'rls_enable_fin_opening', `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='fin_opening_balances';`);
await sec(25, 'grants_fin_opening', `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='fin_opening_balances' ORDER BY grantee, privilege_type;`);
await sec(26, 'columnas_fin_opening', `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='fin_opening_balances' ORDER BY ordinal_position;`);

// S13 — Estado del motor: errores, APERTURA_FIN, eventos apertura
await sec(13, 'motor_estado', `
SELECT (SELECT count(*) FROM public.fin_posting_errors WHERE resolved_at IS NULL) errores_abiertos,
       (SELECT count(*) FROM public.fin_entries WHERE event='apertura') asientos_apertura,
       (SELECT count(*) FROM public.fin_entries e JOIN public.fin_document_types d ON d.code=e.document_type WHERE d.code='APERTURA_FIN') asientos_apertura_fin,
       (SELECT count(*) FROM public.fin_entries) total_asientos,
       (SELECT count(*) FROM public.fin_movements) total_movimientos,
       (SELECT count(*) FROM public.fin_document_types WHERE code='APERTURA_FIN' AND is_active) tipo_apertura_activo;`);
await sec(27, 'primeros_documentos_por_tienda', `
SELECT s.name AS tienda, min(e.economic_date) FILTER (WHERE e.event <> 'apertura') AS primer_doc,
       min(e.economic_date) FILTER (WHERE e.event = 'apertura') AS primera_apertura
FROM public.fin_entries e JOIN public.stores s ON s.id = e.store_id
GROUP BY s.name ORDER BY s.name;`);

// S14 — Caja legada: ingresos/egresos y ventas previas al 01/07/2026 (evidencia de apertura)
await sec(14, 'cash_flow_pre_apertura', `
SELECT s.name AS tienda, f.doc_type, f.currency, f.operation_date, f.amount, f.amount_cup, f.concept, f.status
FROM public.cash_flow_documents f JOIN public.stores s ON s.id = f.store_id
WHERE f.operation_date < DATE '2026-07-01'
ORDER BY f.operation_date LIMIT 100;`);
await sec(28, 'ventas_pre_apertura', `
SELECT s.name AS tienda, count(*) AS ventas, min(t.created_at::date) AS primera, max(t.created_at::date) AS ultima
FROM public.transactions t JOIN public.stores s ON s.id = t.store_id
WHERE t.created_at < TIMESTAMPTZ '2026-07-01 00:00:00-04'
GROUP BY s.name;`);
await sec(29, 'payment_transactions_pre_apertura', `
SELECT s.name AS tienda, count(*) AS pagos, min(p.payment_date) AS primero, max(p.payment_date) AS ultimo,
       sum(CASE WHEN p.currency='USD' THEN p.amount ELSE 0 END) AS usd_total,
       sum(CASE WHEN p.currency='USD' THEN p.amount_cup ELSE 0 END) AS usd_cup_total
FROM public.payment_transactions p JOIN public.stores s ON s.id = p.store_id
WHERE p.payment_date < DATE '2026-07-01'
GROUP BY s.name;`);

// S15 — Movimientos FLUJO_CAJA del USD (todos) + detalles por document_id
await sec(15, 'flujo_caja_usd_entries', `
SELECT e.id AS fin_entry_id, e.document_id, e.document_number, e.event, e.economic_date,
       e.description, e.posted_at, m.sense, m.amount, m.amount_cup, m.currency_origin, m.exchange_rate
FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
WHERE e.document_type='FLUJO_CAJA' AND m.category_code='ACT_EFECTIVO_USD'
ORDER BY e.economic_date;`);
await sec(30, 'flujo_caja_todas_categorias', `
SELECT e.id AS fin_entry_id, e.document_id, e.economic_date, m.category_code, m.sense, m.amount, m.amount_cup, m.currency_origin
FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
WHERE e.document_type='FLUJO_CAJA'
ORDER BY e.economic_date, m.category_code;`);

// S16 — Detalle del asiento FLUJO_CAJA cd07fc7d (contrapartida GAS_OTROS_OPER)
await sec(16, 'entry_cd07fc7d_completo', `
SELECT e.id AS fin_entry_id, e.store_id, e.document_type, e.document_id, e.document_number, e.event,
       e.economic_date, e.description, e.rule_version_id, e.posted_at, e.created_by,
       m.id AS fin_movement_id, m.category_code, m.sense, m.amount, m.currency_origin,
       m.exchange_rate, m.amount_cup, m.description AS mov_desc, m.traza
FROM public.fin_entries e
JOIN public.fin_movements m ON m.entry_id = e.id
WHERE e.id = (SELECT document_id FROM public.fin_entries WHERE document_type='FLUJO_CAJA' LIMIT 1)
   OR e.document_id::text = 'cd07fc7d-222c-423a-8afc-463252e4b411'
ORDER BY m.orden;`);

mkdirSync(resolve(process.cwd(), 'scripts/out/m015'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'scripts/out/m015/extract.json'), JSON.stringify(out, null, 1));
console.log(`\nGuardado: scripts/out/m015/extract.json (${n} secciones)`);
