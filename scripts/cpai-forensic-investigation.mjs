#!/usr/bin/env node
/**
 * cpai-forensic-investigation.mjs — CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001
 * FASES 3/5/6 (solo LECTURA, producción). Expedientes de datos:
 *   A. Pixelarte F-23112026: servicio, pagos, asientos, audit, evidencia de caja.
 *   B. Recepciones sin proveedor (grupo «—», $19,435).
 *   C. Tienda Pueblo vs TiendaPueblo: suppliers locales + master_parties + documentos.
 *   D. Víctimas de la asimetría: receipts reversed/voided con pagos vivos.
 *   E. Recomputo CxP con semántica corregida (excluye reversed/cancelled).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'wthkddeleylijmonclxg';
const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
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
const fmt = (n) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const J = (o) => JSON.stringify(o);

/* ══ A. PIXELARTE F-23112026 ══ */
console.log('══════════════════════════════════════════════════════════════');
console.log('══ A. EXPEDIENTE PIXELARTE F-23112026 ══');
const svc = await runSql(`
  SELECT s.*, st.name AS store_name FROM received_services s
  LEFT JOIN stores st ON st.id = s.store_id
  WHERE s.store_id='${STORE_ID}' AND s.reference_doc='F-23112026' ORDER BY s.created_at;`);
for (const s of svc) {
  console.log(`\n[SERVICIO] id=${s.id}`);
  console.log(`  supplier=${J(s.supplier)} supplier_id=${J(s.supplier_id)} master_party_id=${J(s.master_party_id)}`);
  console.log(`  status=${s.status} payment_status=${s.payment_status} paid_amount=${fmt(s.paid_amount)} total=${fmt(s.total_amount)} ${s.currency} tasa=${s.exchange_rate}`);
  console.log(`  description=${J((s.description ?? '').slice(0, 120))} due=${s.due_date ?? '—'} creado=${s.created_at} updated=${s.updated_at}`);
  console.log(`  notes=${J((s.notes ?? '').slice(0, 300))}`);
  const md = s.metadata ?? s.distribution;
  if (md) console.log(`  metadata=${J(md).slice(0, 400)}`);
}
if (svc.length) {
  // A.0 — TODOS los servicios Pixelarte del período (incluye el de reemplazo)
  const allPixel = await runSql(`
    SELECT s.id, s.reference_doc, s.status, s.payment_status, s.paid_amount, s.total_amount,
           s.created_at, s.updated_at, s.supplier, s.supplier_id
    FROM received_services s
    WHERE s.store_id='${STORE_ID}' AND s.supplier ILIKE '%pixelarte%'
    ORDER BY s.created_at;`);
  console.log(`\n  [TODOS LOS SERVICIOS PIXELARTE] ${allPixel.length}`);
  for (const s of allPixel) {
    const pays = await runSql(`
      SELECT id, amount, amount_cup, currency, payment_method, direction, reverses_payment_id,
             payment_date, paid_by, idempotency_key, notes
      FROM payment_transactions WHERE ref_type='service' AND ref_id='${s.id}' ORDER BY payment_date;`);
    console.log(`  - ${s.id} doc=${J(s.reference_doc)} status=${s.status} total=${fmt(s.total_amount)} paid_amount=${fmt(s.paid_amount)} ${s.payment_status}`);
    console.log(`      creado=${s.created_at} updated=${s.updated_at} supplier_id=${J(s.supplier_id)}`);
    for (const p of pays) {
      console.log(`      pago ${p.id} $${fmt(p.amount)} ${p.currency} método=${p.payment_method} dir=${J(p.direction)} reverses=${J(p.reverses_payment_id)} fecha=${p.payment_date} idem=${J(p.idempotency_key)} notes=${J((p.notes ?? '').slice(0, 150))}`);
    }
  }
  const sid = svc[0].id;
  const pays = await runSql(`
    SELECT * FROM payment_transactions WHERE ref_type='service' AND ref_id='${sid}' ORDER BY payment_date;`);
  console.log(`\n  [PAGOS del F-23112026 voided] ${pays.length}`);
  for (const p of pays) {
    console.log(`  - pago ${p.id}`);
    console.log(`    amount=${fmt(p.amount)} ${p.currency} amount_cup=${fmt(p.amount_cup)} método=${p.payment_method} direction=${J(p.direction)} reverses=${J(p.reverses_payment_id)}`);
    console.log(`    fecha=${p.payment_date} creado=${p.created_at} paid_by=${p.paid_by} ref=${J(p.reference)} idem=${J(p.idempotency_key)}`);
    console.log(`    notes=${J((p.notes ?? '').slice(0, 200))}`);
  }
  const entries = await runSql(`
    SELECT e.id, e.event, e.status, e.payment_ref, e.reversal_of, e.economic_date, e.posted_at,
           m.category_code, m.sense, m.amount AS mov_amount, m.currency AS mov_currency
    FROM fin_entries e LEFT JOIN fin_movements m ON m.entry_id = e.id
    WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id IN ('${svc.map(s => s.id).join("','")}')
    ORDER BY e.posted_at, e.event, m.sense;`);
  console.log(`\n  [ASIENTOS fin_entries×movements de AMBOS servicios] ${entries.length}`);
  for (const e of entries) {
    console.log(`  - entry ${e.id} evento=${e.event} status=${e.status} pago_ref=${J(e.payment_ref)} rev_of=${J(e.reversal_of)} eco=${e.economic_date} posted=${e.posted_at}`);
    if (e.category_code) console.log(`      mov ${e.sense} ${e.category_code} $${fmt(e.mov_amount)} ${e.mov_currency}`);
  }
  const audits = await runSql(`
    SELECT action, created_at, user_id, metadata FROM audit_logs
    WHERE (record_id='${sid}' OR metadata::text LIKE '%${sid}%')
    ORDER BY created_at;`);
  console.log(`\n  [AUDIT_LOGS] ${audits.length}`);
  for (const a of audits) console.log(`  - ${a.created_at} ${a.action} user=${a.user_id}\n      ${J(a.metadata).slice(0, 500)}`);
  // Evidencia de desembolso: cajas/cierres de ese día que incluyan el pago
  const cash = await runSql(`
    SELECT cs.id, cs.opened_at, cs.closed_at, cs.status, cs.cashier_id
    FROM cash_sessions cs
    WHERE cs.store_id='${STORE_ID}'
      AND cs.opened_at::date IN ('2026-11-23','2026-11-24')
    ORDER BY cs.opened_at;`).catch(() => []);
  console.log(`\n  [CAJA sesiones 23-24/11] ${cash.length}`);
  for (const c of cash) console.log(`  - ${c.id} abierta=${c.opened_at} cerrada=${c.closed_at} estado=${J(c.status)} cajero=${c.cashier_id}`);
}

/* ══ B. RECEPCIONES SIN PROVEEDOR ══ */
console.log('\n══════════════════════════════════════════════════════════════');
console.log('══ B. RECEPCIONES SIN PROVEEDOR (grupo «—») ══');
const noSup = await runSql(`
  SELECT id, reference_doc, supplier, supplier_code, supplier_tax_id, supplier_phone, total_cost, paid_amount,
         payment_status, status, due_date, created_at, notes
  FROM receipts
  WHERE store_id='${STORE_ID}'
    AND (supplier IS NULL OR btrim(supplier)='' OR supplier IN ('—','-','--','N/A','n/a'))
  ORDER BY created_at;`);
let sum = 0;
for (const r of noSup) {
  sum += Number(r.total_cost);
  console.log(`\n[RECEPCIÓN] ${r.id} doc=${J(r.reference_doc)}`);
  console.log(`  supplier=${J(r.supplier)} supplier_code=${J(r.supplier_code)} tax_id=${J(r.supplier_tax_id)} tel=${J(r.supplier_phone)}`);
  console.log(`  total=${fmt(r.total_cost)} pagado=${fmt(r.paid_amount)} ${r.payment_status} status=${r.status} due=${r.due_date ?? '—'} creado=${r.created_at} por=${r.created_by}`);
  console.log(`  notes=${J((r.notes ?? '').slice(0, 400))}`);
  const items = await runSql(`SELECT count(*) AS n FROM receipt_items WHERE receipt_id='${r.id}';`).catch(() => []);
  if (items.length) console.log(`  items=${items[0].n}`);
  const pays = await runSql(`SELECT count(*) AS n, coalesce(sum(amount_cup),0) AS s FROM payment_transactions WHERE ref_type='receipt' AND ref_id='${r.id}';`);
  console.log(`  pagos_asociados=${pays[0].n} Σ=${fmt(pays[0].s)}`);
}
console.log(`\n  Σ total de las ${noSup.length} recepciones sin proveedor = $${fmt(sum)} (esperado forense: $19,435.00)`);

/* ══ C. TIENDA PUEBLO vs TIENDAPUEBLO ══ */
console.log('\n══════════════════════════════════════════════════════════════');
console.log('══ C. TIENDA PUEBLO / TIENDAPUEBLO ══');
const locSups = await runSql(`
  SELECT id, name, tax_id, phone, address, email, master_party_id, is_active, created_at, notes
  FROM suppliers
  WHERE store_id='${STORE_ID}' AND (name ILIKE '%pueblo%' OR name ILIKE '%tienda%')
  ORDER BY name;`);
console.log(`\n[suppliers locales coincidentes] ${locSups.length}`);
for (const s of locSups) {
  console.log(`  - ${s.id} nombre=${J(s.name)} tax_id=${J(s.tax_id)} tel=${J(s.phone)} email=${J(s.email)}`);
  console.log(`      dir=${J(s.address)} master=${J(s.master_party_id)} activo=${s.is_active} creado=${s.created_at}`);
  console.log(`      notes=${J((s.notes ?? '').slice(0, 200))}`);
}
const masters = await runSql(`
  SELECT m.* FROM master_parties m
  JOIN stores s ON s.tenant_id = m.tenant_id
  WHERE s.id='${STORE_ID}' AND (m.name ILIKE '%pueblo%' OR m.name ILIKE '%tienda%')
  ORDER BY m.name;`).catch(async () => []);
console.log(`\n[master_parties coincidentes] ${masters.length}`);
for (const m of masters) {
  console.log(`  - ${m.id} code=${m.code} nombre=${J(m.name)} tax_id=${J(m.tax_id)} tel=${J(m.phone)} tipo=${m.party_type}`);
  console.log(`      is_client=${m.is_client} is_supplier=${m.is_supplier} status=${m.status} creado=${m.created_at}`);
}
const byName = await runSql(`
  SELECT supplier, count(*) AS n, sum(total_cost) AS total, sum(paid_amount) AS pagado,
         min(created_at) AS primero, max(created_at) AS ultimo
  FROM receipts
  WHERE store_id='${STORE_ID}' AND status NOT IN ('voided')
    AND (supplier ILIKE '%pueblo%')
  GROUP BY supplier ORDER BY supplier;`);
console.log(`\n[recepciones agrupadas por nombre 'pueblo'] ${byName.length}`);
for (const b of byName) console.log(`  - ${J(b.supplier)}: ${b.n} docs · total=$${fmt(b.total)} · pagado=$${fmt(b.pagado)} · ${String(b.primero).slice(0, 10)}→${String(b.ultimo).slice(0, 10)}`);
const byNameSvc = await runSql(`
  SELECT supplier, count(*) AS n, sum(total_amount) AS total
  FROM received_services
  WHERE store_id='${STORE_ID}' AND status NOT IN ('voided') AND (supplier ILIKE '%pueblo%')
  GROUP BY supplier;`);
console.log(`\n[servicios agrupados por nombre 'pueblo'] ${byNameSvc.length}`);
for (const b of byNameSvc) console.log(`  - ${J(b.supplier)}: ${b.n} docs · total=$${fmt(b.total)}`);
// ¿los receipts con nombre 'pueblo' tienen supplier_id estructurado?
const sidCheck = await runSql(`
  SELECT supplier, supplier_code, count(*) AS n FROM receipts
  WHERE store_id='${STORE_ID}' AND status NOT IN ('voided') AND supplier ILIKE '%pueblo%'
  GROUP BY supplier, supplier_code ORDER BY supplier;`);
console.log(`\n[identidad estructurada en receipts 'pueblo']`);
for (const s of sidCheck) console.log(`  - ${J(s.supplier)} supplier_code=${J(s.supplier_code)} × ${s.n}`);

/* ══ D. VÍCTIMAS DE LA ASIMETRÍA (receipts reversed/voided con pagos vivos) ══ */
console.log('\n══════════════════════════════════════════════════════════════');
console.log('══ D. RECEIPTS REVERSED/VOIDED CON PAGOS ══');
const victims = await runSql(`
  SELECT r.id, r.reference_doc, r.supplier, r.status, r.total_cost, r.paid_amount, r.payment_status,
         (SELECT count(*) FROM payment_transactions p WHERE p.ref_type='receipt' AND p.ref_id=r.id
            AND COALESCE(p.direction,'in')='in') AS pagos_in,
         (SELECT count(*) FROM payment_transactions p WHERE p.ref_type='receipt' AND p.ref_id=r.id
            AND COALESCE(p.direction,'in')='in'
            AND NOT EXISTS (SELECT 1 FROM payment_transactions c WHERE c.reverses_payment_id=p.id)) AS pagos_vivos,
         (SELECT coalesce(sum(p.amount_cup),0) FROM payment_transactions p WHERE p.ref_type='receipt' AND p.ref_id=r.id
            AND COALESCE(p.direction,'in')='in'
            AND NOT EXISTS (SELECT 1 FROM payment_transactions c WHERE c.reverses_payment_id=p.id)) AS suma_vivos
  FROM receipts r
  WHERE r.store_id='${STORE_ID}' AND r.status IN ('reversed','voided')
  ORDER BY r.created_at;`);
let vSum = 0;
for (const v of victims) {
  vSum += Number(v.suma_vivos);
  console.log(`  - ${v.id} doc=${J(v.reference_doc)} ${J(v.supplier)} status=${v.status} total=${fmt(v.total_cost)} paid_amount=${fmt(v.paid_amount)} ${v.payment_status} · pagos_in=${v.pagos_in} VIVOS=${v.pagos_vivos} Σvivos=$${fmt(v.suma_vivos)}`);
}
console.log(`  Σ pagos vivos sobre receipts anulados/revertidos = $${fmt(vSum)}`);
const vicSvc = await runSql(`
  SELECT s.id, s.reference_doc, s.supplier, s.status, s.total_amount, s.paid_amount, s.payment_status,
         (SELECT count(*) FROM payment_transactions p WHERE p.ref_type='service' AND p.ref_id=s.id
            AND COALESCE(p.direction,'in')='in'
            AND NOT EXISTS (SELECT 1 FROM payment_transactions c WHERE c.reverses_payment_id=p.id)) AS pagos_vivos,
         (SELECT coalesce(sum(p.amount_cup),0) FROM payment_transactions p WHERE p.ref_type='service' AND p.ref_id=s.id
            AND COALESCE(p.direction,'in')='in'
            AND NOT EXISTS (SELECT 1 FROM payment_transactions c WHERE c.reverses_payment_id=p.id)) AS suma_vivos
  FROM received_services s
  WHERE s.store_id='${STORE_ID}' AND s.status IN ('voided','cancelled')
  ORDER BY s.created_at;`);
let vSumS = 0;
for (const v of vicSvc) {
  vSumS += Number(v.suma_vivos);
  console.log(`  [SVC] ${v.id} doc=${J(v.reference_doc)} ${J(v.supplier)} status=${v.status} total=${fmt(v.total_amount)} paid_amount=${fmt(v.paid_amount)} ${v.payment_status} · VIVOS=${v.pagos_vivos} Σvivos=$${fmt(v.suma_vivos)}`);
}
console.log(`  Σ pagos vivos sobre servicios anulados/cancelados = $${fmt(vSumS)}`);

/* ══ E. RECOMPUTO CxP SEMÁNTICA CORREGIDA ══ */
console.log('\n══════════════════════════════════════════════════════════════');
console.log('══ E. RECOMPUTO CxP (semántica corregida) ══');
const recompute = await runSql(`
  WITH docs AS (
    SELECT 'receipt' AS tipo, r.id, r.supplier, r.total_cost AS total, r.paid_amount, r.due_date, r.created_at, r.status
    FROM receipts r WHERE r.store_id='${STORE_ID}' AND r.status NOT IN ('voided','reversed')
    UNION ALL
    SELECT 'service', s.id, s.supplier, s.total_amount, s.paid_amount, s.due_date, s.created_at, s.status
    FROM received_services s WHERE s.store_id='${STORE_ID}' AND s.status = 'active'
  )
  SELECT count(*) AS n,
         sum(total) AS total_origen,
         sum(paid_amount) AS pagado_aplicado,
         sum(total - paid_amount) AS saldo
  FROM docs;`);
const rc = recompute[0];
console.log(`  Docs activos (excluye voided+reversed receipts, y services no-active): ${rc.n}`);
console.log(`  Total original=$${fmt(rc.total_origen)} Pagado=$${fmt(rc.pagado_aplicado)} Saldo=$${fmt(rc.saldo)}`);
console.log(`  (Punto forense previo: Total $3,032,493.90 − Pagado $68,665.00 = Saldo $2,963,828.90)`);
// desglose de lo excluido
const excl = await runSql(`
  SELECT 'receipt reversed' AS causa, count(*) AS n, sum(total_cost) AS total, sum(paid_amount) AS pagado
  FROM receipts WHERE store_id='${STORE_ID}' AND status='reversed'
  UNION ALL SELECT 'receipt voided', count(*), sum(total_cost), sum(paid_amount)
  FROM receipts WHERE store_id='${STORE_ID}' AND status='voided'
  UNION ALL SELECT 'service voided/cancelled', count(*), sum(total_amount), sum(paid_amount)
  FROM received_services WHERE store_id='${STORE_ID}' AND status IN ('voided','cancelled');`);
console.log(`\n  [Excluidos del recomputo]`);
for (const e of excl) console.log(`  - ${e.causa}: ${e.n} docs · total=$${fmt(e.total)} · paid_amount=$${fmt(e.pagado)}`);
console.log('\nFIN (solo lectura — nada fue modificado)');
