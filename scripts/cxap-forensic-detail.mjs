#!/usr/bin/env node
/**
 * cxap-forensic-detail.mjs — CP-AP-FORENSIC-RECONCILIATION-001 (FASE 1, detalle).
 * Solo lectura. Complementa cxap-forensic-audit.mjs con:
 *   A. Las 27 payment_transactions CxP (receipt/service) con fecha/método/actor.
 *   B. Documentos con proveedor nulo, vacío o '—'.
 *   C. Quirks de nombres de proveedor (Tienda Pueblo vs TiendaPueblo).
 *   D. Orphans por ref_type (verificar que ningún voided CxP tiene pagos).
 *   E. Fechas de pago vs creación de los docs pagados (flujo pago-inmediato SR).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'wthkddeleylijmonclxg';
const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}
const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* A. Transacciones CxP */
const cxpTx = await runSql(`
  SELECT t.id, t.ref_type, t.ref_id, t.amount, t.amount_cup, t.currency, t.payment_method,
         t.direction, t.payment_date, t.reference, t.paid_by, t.created_at,
         CASE t.ref_type WHEN 'receipt' THEN r.supplier WHEN 'service' THEN s.supplier END AS supplier,
         CASE t.ref_type WHEN 'receipt' THEN r.reference_doc WHEN 'service' THEN s.reference_doc END AS doc_ref
  FROM payment_transactions t
  LEFT JOIN receipts r ON t.ref_type='receipt' AND r.id = t.ref_id
  LEFT JOIN received_services s ON t.ref_type='service' AND s.id = t.ref_id
  WHERE t.store_id='${STORE_ID}' AND t.ref_type IN ('receipt','service')
  ORDER BY t.payment_date;`);
console.log(`══ A. payment_transactions CxP (receipt+service): ${cxpTx.length} ══`);
for (const t of cxpTx) {
  console.log(`  ${String(t.payment_date).slice(0, 10)} · ${t.ref_type} ${(t.doc_ref ?? t.ref_id).toString().slice(0, 24).padEnd(24)} · ${(t.supplier ?? '—').slice(0, 28).padEnd(28)} · ${t.direction ?? 'in'} · $${fmt(t.amount_cup)} ${t.currency} · ${t.payment_method} · ref=${t.reference ?? '—'}`);
}
console.log(`  Σ = $${fmt(cxpTx.reduce((s, t) => s + (t.direction === 'reversal' ? -1 : 1) * Number(t.amount_cup), 0))}`);

/* A2. Comisión pagada */
const com = await runSql(`
  SELECT cp.id, cp.final_amount, cp.status, cp.paid_at, cp.payment_method, cp.payment_reference,
         w.first_name, w.last_name
  FROM commission_payments cp LEFT JOIN workers w ON w.id=cp.worker_id
  WHERE cp.store_id='${STORE_ID}' AND cp.status='paid';`);
console.log(`\n══ A2. Comisiones pagadas: ${com.length} ══`);
for (const c of com) console.log(`  ${String(c.paid_at).slice(0, 10)} · ${(c.first_name ?? '')} ${c.last_name ?? ''} · $${fmt(c.final_amount)} · ${c.payment_method} · ref=${c.payment_reference ?? '—'}`);

/* B. Docs con proveedor raro */
const oddSup = await runSql(`
  SELECT 'receipt' AS tipo, id, supplier, total_cost AS total, paid_amount, payment_status, due_date, created_at, status
  FROM receipts WHERE store_id='${STORE_ID}'
    AND (supplier IS NULL OR btrim(supplier)='' OR supplier IN ('—','-','--','N/A','n/a'))
  UNION ALL
  SELECT 'service', id, supplier, total_amount, paid_amount, payment_status, due_date, created_at, status
  FROM received_services WHERE store_id='${STORE_ID}'
    AND (supplier IS NULL OR btrim(supplier)='' OR supplier IN ('—','-','--','N/A','n/a'));`);
console.log(`\n══ B. Docs con proveedor nulo/vacío/'—': ${oddSup.length} ══`);
for (const d of oddSup) console.log(`  [${d.tipo}] ${d.id} · supplier=${JSON.stringify(d.supplier)} · total=$${fmt(d.total)} · pagado=$${fmt(d.paid_amount)} · ${d.payment_status} · status=${d.status} · due=${d.due_date ?? '—'} · creado=${String(d.created_at).slice(0, 10)}`);

/* C. Nombres de proveedor únicos (detectar quirks) */
const sups = await runSql(`
  SELECT supplier, count(*) AS n, sum(total_cost) AS total FROM receipts
  WHERE store_id='${STORE_ID}' AND status<>'voided' GROUP BY supplier
  UNION ALL
  SELECT supplier, count(*), sum(total_amount) FROM received_services
  WHERE store_id='${STORE_ID}' AND status<>'voided' GROUP BY supplier
  ORDER BY supplier NULLS LAST;`);
console.log(`\n══ C. Proveedores únicos (receipts+services no voided) ══`);
for (const s of sups) console.log(`  ${JSON.stringify(s.supplier).padEnd(42)} docs=${String(s.n).padStart(3)} Σ=$${fmt(s.total)}`);

/* D. Orphans por ref_type */
const orph = await runSql(`
  SELECT ref_type, count(*) AS n, sum(amount_cup) AS s
  FROM payment_transactions t WHERE t.store_id='${STORE_ID}'
    AND NOT EXISTS (
      SELECT 1 FROM receipts r WHERE r.id=t.ref_id AND t.ref_type='receipt' AND r.store_id=t.store_id AND r.status<>'voided'
    ) AND NOT EXISTS (
      SELECT 1 FROM received_services s WHERE s.id=t.ref_id AND t.ref_type='service' AND s.store_id=t.store_id AND s.status<>'voided'
    )
  GROUP BY ref_type ORDER BY ref_type;`);
console.log(`\n══ D. payment_transactions fuera del alcance CxP (por ref_type) ══`);
for (const o of orph) console.log(`  ${o.ref_type}: ${o.n} txns · Σ=$${fmt(o.s)}`);

/* E. Docs pagados: fecha pago vs creación */
console.log(`\n══ E. Docs pagados — pago el MISMO día de creación (flujo pago inmediato SR) ══`);
let sameDay = 0, later = 0;
for (const t of cxpTx) {
  const doc = await runSql(`
    SELECT created_at FROM ${t.ref_type === 'receipt' ? 'receipts' : 'received_services'} WHERE id='${t.ref_id}';`);
  const created = String(doc[0]?.created_at ?? '').slice(0, 10);
  const paid = String(t.payment_date).slice(0, 10);
  if (created === paid) sameDay++; else { later++; console.log(`  PAGO POSTERIOR: ${t.ref_type} ${t.ref_id} creado=${created} pagado=${paid} ($${fmt(t.amount_cup)})`); }
}
console.log(`  → pagados el mismo día de creación: ${sameDay}; pagados después: ${later}`);

/* F. Distribución due_date de docs pendientes (validar julio-diciembre 2026) */
const pend = await runSql(`
  SELECT due_date, count(*) n, sum(saldo) AS saldo FROM (
    SELECT due_date, (total_cost-paid_amount) AS saldo FROM receipts
    WHERE store_id='${STORE_ID}' AND status<>'voided' AND payment_status<>'paid'
    UNION ALL
    SELECT due_date, (total_amount-paid_amount) FROM received_services
    WHERE store_id='${STORE_ID}' AND status<>'voided' AND payment_status<>'paid'
  ) x GROUP BY due_date ORDER BY due_date;`);
console.log(`\n══ F. Docs pendientes por due_date ══`);
for (const p of pend) console.log(`  ${p.due_date ?? 'SIN VENCIMIENTO'} · ${p.n} docs · saldo=$${fmt(p.saldo)}`);

/* G. El pago de $1,800 sobre servicio VOIDED (fuera de alcance de la vista) */
const voidedSvc = await runSql(`
  SELECT s.id, s.reference_doc, s.supplier, s.total_amount, s.paid_amount,
         s.payment_status, s.status, s.created_at, s.updated_at,
         (SELECT count(*) FROM payment_transactions t WHERE t.ref_type='service' AND t.ref_id=s.id) AS n_tx
  FROM received_services s
  WHERE s.store_id='${STORE_ID}' AND s.status='voided'
    AND EXISTS (SELECT 1 FROM payment_transactions t WHERE t.ref_type='service' AND t.ref_id=s.id);`);
console.log(`\n══ G. Servicios VOIDED con pagos aplicados ══`);
for (const v of voidedSvc) {
  console.log(`  ${v.id} · ref=${v.reference_doc} · ${v.supplier} · total=$${fmt(v.total_amount)} · paid_amount=$${fmt(v.paid_amount)} · pay_status=${v.payment_status} · creado=${String(v.created_at).slice(0, 16)} · actualizado=${String(v.updated_at).slice(0, 16)} · txns=${v.n_tx}`);
}
/* G2. Todos los servicios voided de la tienda (contexto) */
const voidedAll = await runSql(`
  SELECT id, reference_doc, supplier, total_amount, paid_amount, status, created_at
  FROM received_services WHERE store_id='${STORE_ID}' AND status='voided' ORDER BY created_at;`);
console.log(`\n══ G2. Todos los servicios voided: ${voidedAll.length} ══`);
for (const v of voidedAll) console.log(`  ${String(v.created_at).slice(0, 10)} · ${v.reference_doc} · ${v.supplier} · total=$${fmt(v.total_amount)} · paid=$${fmt(v.paid_amount)}`);

/* H. Recepciones voided con pagos */
const voidedRcp = await runSql(`
  SELECT id, reference_doc, supplier, total_cost, paid_amount, status, created_at
  FROM receipts WHERE store_id='${STORE_ID}' AND status='voided'
    AND EXISTS (SELECT 1 FROM payment_transactions t WHERE t.ref_type='receipt' AND t.ref_id=receipts.id);`);
console.log(`\n══ H. Recepciones voided con pagos: ${voidedRcp.length} ══`);
for (const v of voidedRcp) console.log(`  ${String(v.created_at).slice(0, 10)} · ${v.reference_doc} · ${v.supplier} · total=$${fmt(v.total_cost)} · paid=$${fmt(v.paid_amount)}`);

/* I. Anticipos: pagos en docs con estado draft/pending (no confirmados) */
const draftPaid = await runSql(`
  SELECT 'service' AS tipo, id, reference_doc, supplier, total_amount, paid_amount, status, payment_status
  FROM received_services WHERE store_id='${STORE_ID}' AND status IN ('draft','pending') AND paid_amount > 0
  UNION ALL
  SELECT 'receipt', id, reference_doc, supplier, total_cost, paid_amount, status, payment_status
  FROM receipts WHERE store_id='${STORE_ID}' AND status IN ('draft','pending') AND paid_amount > 0;`);
console.log(`\n══ I. Docs no-confirmados con pagos (anticipos irregulares): ${draftPaid.length} ══`);
for (const d of draftPaid) console.log(`  [${d.tipo}] ${d.reference_doc} · ${d.supplier} · total=$${fmt(d.total_amount)} · paid=$${fmt(d.paid_amount)} · ${d.status}/${d.payment_status}`);
