#!/usr/bin/env node
/**
 * cxap-forensic-audit.mjs — CP-AP-FORENSIC-RECONCILIATION-001 (FASE 1).
 * ───────────────────────────────────────────────────────────────────────────
 * Auditoría forense SOLO LECTURA de Cuentas por Pagar en PRODUCCIÓN
 * (CostproBD, wthkddeleylijmonclxg) para la tienda ENERVIDA-VITALLCONS.
 *
 * Objetivo:
 *   1. Reproducir EXACTAMENTE los KPIs que calcula /api/accounts-payable
 *      (misma lógica, incluida la paginación por query con limit=200)
 *      y verificar contra los importes observados por el propietario:
 *        Vencido $2,352,085.70 · Próx.7d $556,766.00 ·
 *        Total pendiente $2,963,828.90 · Pagado $68,665.00
 *   2. Desglose documental del «Pagado» (¿de dónde salen los $68,665.00?).
 *   3. Desglose por proveedor (tabla Por proveedor: Total/Pagado/Saldo/aging).
 *   4. Conciliación documento↔pago: pagos sin doc, docs con pagos,
 *      reversiones, duplicados, monedas, nulos.
 *
 * Uso (read-only, no escribe jamás):
 *   SUPABASE_ACCESS_TOKEN=… node scripts/cxap-forensic-audit.mjs
 *   SUPABASE_ACCESS_TOKEN=… node scripts/cxap-forensic-audit.mjs --json   (salida máquina)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));

if (!TOKEN) {
  // fallback: leer del .env del repo (local, jamás se commitea)
  try {
    const env = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    const m = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
    if (m) process.env.SUPABASE_ACCESS_TOKEN = m[1].trim();
  } catch { /* sin .env */ }
}
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }

const apiBase = `https://api.supabase.com/v1/projects/${PROD_REF}/database/query`;
async function runSql(query) {
  const res = await fetch(apiBase, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

const asJson = process.argv.includes('--json');
const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const log = (...a) => { if (!asJson) console.log(...a); };

/* ═══ 0. Tienda ENERVIDA-VITALLCONS ═══ */
const stores = await runSql(`
  SELECT id, name FROM stores
  WHERE name ILIKE '%enervida%' OR name ILIKE '%vitallcons%'
  ORDER BY name;`);
log('══ TIENDAS ══');
for (const s of stores) log(`  ${s.id} · ${s.name}`);
if (stores.length === 0) { console.error('FALLO: tienda no encontrada'); process.exit(1); }
const STORE_ID = stores.find(s => /enervida/i.test(s.name))?.id || stores[0].id;
log(`  → STORE_ID = ${STORE_ID}\n`);

/* ═══ 1. Documentos (misma selección que el API: status <> 'voided') ═══ */
const receipts = await runSql(`
  SELECT id, supplier, total_cost, paid_amount, payment_status, payment_method,
         due_date, reference_doc, status, created_at
  FROM receipts WHERE store_id = '${STORE_ID}' AND status <> 'voided'
  ORDER BY due_date ASC NULLS LAST;`);
const services = await runSql(`
  SELECT id, supplier, total_amount, paid_amount, payment_status, payment_method,
         due_date, reference_doc, status, currency, exchange_rate, created_at
  FROM received_services WHERE store_id = '${STORE_ID}' AND status <> 'voided'
  ORDER BY due_date ASC NULLS LAST;`);
const commissions = await runSql(`
  SELECT cp.id, cp.final_amount, cp.status, cp.due_date, cp.paid_at, cp.created_at,
         cp.payment_method, w.first_name, w.last_name
  FROM commission_payments cp
  LEFT JOIN workers w ON w.id = cp.worker_id
  WHERE cp.store_id = '${STORE_ID}' AND cp.status IN ('approved','paid')
  ORDER BY cp.due_date ASC NULLS LAST;`);
log(`══ DOCUMENTOS ══  receipts=${receipts.length}  services=${services.length}  commissions=${commissions.length}`);

/* ═══ 2. Reproducir KPIs del API (lógica exacta, UTC-midnight) ═══ */
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const payables = [];
for (const r of receipts) {
  const total = Number(r.total_cost) || 0, paid = Number(r.paid_amount) || 0;
  const due = r.due_date ? new Date(r.due_date + 'T00:00:00Z') : null;
  const days = due ? Math.round((due - today) / 86400000) : null;
  const overdue = due ? due < today && r.payment_status !== 'paid' : false;
  payables.push({ id: 'receipt-' + r.id, ref_type: 'receipt', ref_id: r.id, supplier: r.supplier ?? null,
    total, total_cup: total, paid, paid_cup: paid, balance: total - paid, balance_cup: total - paid,
    currency: 'CUP', due_date: r.due_date, days_until_due: days, is_overdue: overdue,
    payment_status: r.payment_status || 'unpaid', created_at: r.created_at });
}
for (const s of services) {
  const total = Number(s.total_amount) || 0, paid = Number(s.paid_amount) || 0;
  const ex = Number(s.exchange_rate) || 1, cur = s.currency || 'CUP';
  const totalCup = cur === 'CUP' ? total : total * ex, paidCup = cur === 'CUP' ? paid : paid * ex;
  const due = s.due_date ? new Date(s.due_date + 'T00:00:00Z') : null;
  const days = due ? Math.round((due - today) / 86400000) : null;
  const overdue = due ? due < today && s.payment_status !== 'paid' : false;
  payables.push({ id: 'service-' + s.id, ref_type: 'service', ref_id: s.id, supplier: s.supplier ?? null,
    total, total_cup: totalCup, paid, paid_cup: paidCup, balance: total - paid, balance_cup: totalCup - paidCup,
    currency: cur, due_date: s.due_date, days_until_due: days, is_overdue: overdue,
    payment_status: s.payment_status || 'unpaid', created_at: s.created_at });
}
for (const c of commissions) {
  const total = Number(c.final_amount) || 0;
  const paid = c.status === 'paid' ? total : 0;
  const due = c.due_date ? new Date(c.due_date + 'T00:00:00Z') : null;
  const days = due ? Math.round((due - today) / 86400000) : null;
  const overdue = due ? due < today && c.status !== 'paid' : false;
  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Trabajador desconocido';
  payables.push({ id: 'commission-' + c.id, ref_type: 'commission', ref_id: c.id, supplier: name,
    total, total_cup: total, paid, paid_cup: paid, balance: total - paid, balance_cup: total - paid,
    currency: 'CUP', due_date: c.due_date, days_until_due: days, is_overdue: overdue,
    payment_status: c.status === 'paid' ? 'paid' : 'unpaid', created_at: c.created_at });
}

const kpis = {
  totalOverdue: payables.filter(p => p.is_overdue && p.payment_status !== 'paid').reduce((s, p) => s + p.balance_cup, 0),
  totalUpcoming: payables.filter(p => !p.is_overdue && p.payment_status !== 'paid' && p.days_until_due !== null && p.days_until_due <= 7).reduce((s, p) => s + p.balance_cup, 0),
  totalPending: payables.filter(p => p.payment_status !== 'paid').reduce((s, p) => s + p.balance_cup, 0),
  totalPaid: payables.filter(p => p.payment_status === 'paid').reduce((s, p) => s + p.total_cup, 0),
};
log(`\n══ KPIs reproducidos (lógica exacta del API, hoy=${today.toISOString().slice(0, 10)}) ══`);
log(`  Vencido        = $${fmt(kpis.totalOverdue)}   (observado $2,352,085.70)`);
log(`  Próximos 7d    = $${fmt(kpis.totalUpcoming)}   (observado $556,766.00)`);
log(`  Total pendiente= $${fmt(kpis.totalPending)}   (observado $2,963,828.90)`);
log(`  Pagado (KPI)   = $${fmt(kpis.totalPaid)}   (observado $68,665.00)`);

/* Aging por intervalos sobre saldo (como la tabla agrupada) */
const agingTotals = { current: 0, upcoming7: 0, '30': 0, '60': 0, '90': 0, '120': 0, '120+': 0 };
for (const p of payables) {
  if (p.payment_status === 'paid') continue;
  if (p.is_overdue) {
    const od = Math.abs(p.days_until_due ?? 0);
    if (od > 120) agingTotals['120+'] += p.balance_cup;
    else if (od > 90) agingTotals['120'] += p.balance_cup;
    else if (od > 60) agingTotals['90'] += p.balance_cup;
    else if (od > 30) agingTotals['60'] += p.balance_cup;
    else agingTotals['30'] += p.balance_cup;
  } else if (p.days_until_due !== null && p.days_until_due <= 7) agingTotals.upcoming7 += p.balance_cup;
  else agingTotals.current += p.balance_cup;
}
log(`  Aging: corriente=$${fmt(agingTotals.current)} próx7=$${fmt(agingTotals.upcoming7)} 0-30=$${fmt(agingTotals['30'])} 31-60=$${fmt(agingTotals['60'])} 61-90=$${fmt(agingTotals['90'])} 91-120=$${fmt(agingTotals['120'])} +120=$${fmt(agingTotals['120+'])}`);
log(`  Σ intervals=$${fmt(Object.values(agingTotals).reduce((a, b) => a + b, 0))}`);

/* ═══ 3. Desglose del PAGADO — documentos totalmente pagados ═══ */
const paidDocs = payables.filter(p => p.payment_status === 'paid');
log(`\n══ DESGLOSE DEL «PAGADO» (docs payment_status='paid': ${paidDocs.length}) ══`);
for (const p of paidDocs) {
  log(`  [${p.ref_type}] ${p.ref_id} · ${p.supplier ?? '—'} · total=$${fmt(p.total_cup)} · ${p.currency} · creado=${String(p.created_at).slice(0, 10)} · due=${p.due_date ?? '—'}`);
}
log(`  Σ total_cup de docs pagados = $${fmt(paidDocs.reduce((s, p) => s + p.total_cup, 0))}`);
const partialDocs = payables.filter(p => p.payment_status === 'partial');
log(`  Docs PARCIALES (paid>0, no paid): ${partialDocs.length} → Σ paid_cup=$${fmt(partialDocs.reduce((s, p) => s + p.paid_cup, 0))}`);

/* ═══ 4. payment_transactions de la tienda (todas, con dirección) ═══ */
const txns = await runSql(`
  SELECT id, ref_type, ref_id, amount, amount_cup, payment_method, currency,
         exchange_rate, direction, reverses_payment_id, payment_date, reference,
         paid_by, created_at
  FROM payment_transactions WHERE store_id = '${STORE_ID}'
  ORDER BY payment_date ASC;`);
log(`\n══ payment_transactions (tienda) = ${txns.length} ══`);
let netCup = 0, inCup = 0, revCup = 0;
for (const t of txns) {
  const dir = t.direction ?? 'in';
  const amt = Number(t.amount_cup) || 0;
  if (dir === 'reversal') { revCup += amt; netCup -= amt; } else { inCup += amt; netCup += amt; }
}
log(`  Σ amount_cup 'in'      = $${fmt(inCup)}`);
log(`  Σ amount_cup 'reversal'= $${fmt(revCup)}`);
log(`  NETO                   = $${fmt(netCup)}`);

/* Pagos por documento referenciado */
const byRef = new Map();
for (const t of txns) {
  const k = t.ref_type + ':' + t.ref_id;
  if (!byRef.has(k)) byRef.set(k, []);
  byRef.get(k).push(t);
}
/* Pagos cuyo documento NO está en payables (voided u otro estado) */
const payableKeys = new Set(payables.map(p => p.ref_type + ':' + p.ref_id));
const orphanTxns = txns.filter(t => !payableKeys.has(t.ref_type + ':' + t.ref_id));
log(`\n  Pagos sobre docs NO incluidos en la vista (voided/etc): ${orphanTxns.length} → Σ=$${fmt(orphanTxns.reduce((s, t) => s + (t.direction === 'reversal' ? -1 : 1) * (Number(t.amount_cup) || 0), 0))}`);
for (const t of orphanTxns.slice(0, 20)) {
  log(`    ${t.ref_type}:${t.ref_id} · ${t.direction ?? 'in'} · $${fmt(t.amount_cup)} ${t.currency} · ${String(t.payment_date).slice(0, 10)} · ref=${t.reference ?? '—'}`);
}

/* Conciliación por doc: paid_amount declarado vs neto de txns */
log(`\n══ CONCILIACIÓN doc↔pagos (diferencias > ±0.01) ══`);
let mismatch = 0;
for (const p of payables) {
  const list = byRef.get(p.ref_type + ':' + p.ref_id) || [];
  const net = list.reduce((s, t) => s + (t.direction === 'reversal' ? -1 : 1) * (Number(t.amount_cup) || 0), 0);
  const declared = p.ref_type === 'commission'
    ? (p.payment_status === 'paid' ? p.paid_cup : 0)
    : p.paid_cup;
  if (Math.abs(net - declared) > 0.01) {
    mismatch++;
    log(`  ≠ [${p.ref_type}] ${p.ref_id} ${p.supplier ?? ''}: txns_net=$${fmt(net)} vs paid_amount=$${fmt(declared)}`);
  }
}
log(`  ${mismatch === 0 ? 'OK — todos los docs concilian con sus payment_transactions' : mismatch + ' docs NO concilian'}`);

/* Duplicados de aplicación: misma transacción original revertida 2+ veces */
const revCount = new Map();
for (const t of txns) if (t.direction === 'reversal' && t.reverses_payment_id) revCount.set(t.reverses_payment_id, (revCount.get(t.reverses_payment_id) || 0) + 1);
const dupRev = [...revCount.entries()].filter(([, n]) => n > 1);
log(`\n  Reversiones duplicadas (mismo original 2+): ${dupRev.length}`);
for (const [orig, n] of dupRev) log(`    ${orig} revertido ${n} veces`);

/* ═══ 5. Agrupación por proveedor (como la tabla, con y sin docs pagados) ═══ */
function group(includePaid) {
  const m = new Map();
  for (const p of payables) {
    if (p.payment_status === 'paid' && !includePaid) continue;
    const key = p.supplier || 'Sin proveedor';
    if (!m.has(key)) m.set(key, { supplier: key, total: 0, paid: 0, balance: 0, count: 0, aging: { current: 0, upcoming7: 0, '30': 0, '60': 0, '90': 0, '120': 0, '120+': 0 } });
    const e = m.get(key);
    e.total += p.total_cup; e.paid += p.paid_cup; e.balance += p.balance_cup; e.count += 1;
    if (p.payment_status === 'paid') continue;
    if (p.is_overdue) {
      const od = Math.abs(p.days_until_due ?? 0);
      if (od > 120) e.aging['120+'] += p.balance_cup;
      else if (od > 90) e.aging['120'] += p.balance_cup;
      else if (od > 60) e.aging['90'] += p.balance_cup;
      else if (od > 30) e.aging['60'] += p.balance_cup;
      else e.aging['30'] += p.balance_cup;
    } else if (p.days_until_due !== null && p.days_until_due <= 7) e.aging.upcoming7 += p.balance_cup;
    else e.aging.current += p.balance_cup;
  }
  return [...m.values()].sort((a, b) => b.balance - a.balance);
}
const gCurrent = group(false);  // lo que muestra HOY la tabla (excluye pagados)
const gTarget = group(true);    // lo que DEBE mostrar (incluye pagados)
log(`\n══ TABLA POR PROVEEDOR — COMO ESTÁ HOY (excluye docs pagados) ══`);
log(`  Proveedor | Docs | Total | Pagado | Saldo`);
for (const g of gCurrent) log(`  ${g.supplier.slice(0, 40).padEnd(40)} | ${String(g.count).padStart(3)} | ${fmt(g.total).padStart(14)} | ${fmt(g.paid).padStart(12)} | ${fmt(g.balance).padStart(14)}`);
const tc = gCurrent.reduce((s, g) => ({ t: s.t + g.total, p: s.p + g.paid, b: s.b + g.balance }), { t: 0, p: 0, b: 0 });
log(`  ${'TOTALES (tabla actual)'.padEnd(40)} |     | ${fmt(tc.t).padStart(14)} | ${fmt(tc.p).padStart(12)} | ${fmt(tc.b).padStart(14)}`);
log(`\n══ TABLA POR PROVEEDOR — OBJETIVO (incluye docs pagados: Total−Pagado=Saldo) ══`);
for (const g of gTarget) log(`  ${g.supplier.slice(0, 40).padEnd(40)} | ${String(g.count).padStart(3)} | ${fmt(g.total).padStart(14)} | ${fmt(g.paid).padStart(12)} | ${fmt(g.balance).padStart(14)}`);
const tt = gTarget.reduce((s, g) => ({ t: s.t + g.total, p: s.p + g.paid, b: s.b + g.balance }), { t: 0, p: 0, b: 0 });
log(`  ${'TOTALES (objetivo)'.padEnd(40)} |     | ${fmt(tt.t).padStart(14)} | ${fmt(tt.p).padStart(12)} | ${fmt(tt.b).padStart(14)}`);
log(`  → Total−Pagado = $${fmt(tt.t - tt.p)} (debe = Total pendiente $${fmt(kpis.totalPending)})`);

/* ═══ 6. Registros sin proveedor ═══ */
const noSupplier = payables.filter(p => !p.supplier);
log(`\n══ REGISTROS SIN PROVEEDOR: ${noSupplier.length} ══`);
for (const p of noSupplier.slice(0, 30)) {
  log(`  [${p.ref_type}] ${p.ref_id} · total=$${fmt(p.total_cup)} · saldo=$${fmt(p.balance_cup)} · estado=${p.payment_status} · due=${p.due_date ?? '—'} · creado=${String(p.created_at).slice(0, 10)}`);
}

/* ═══ 7. Pagos en moneda no-CUP ═══ */
const foreign = txns.filter(t => t.currency !== 'CUP');
log(`\n══ PAGOS EN MONEDA EXTRANJERA: ${foreign.length} ══`);
for (const t of foreign) log(`  ${t.ref_type}:${t.ref_id} · ${t.direction ?? 'in'} · ${fmt(t.amount)} ${t.currency} (tasa ${t.exchange_rate}) = $${fmt(t.amount_cup)} CUP · ${String(t.payment_date).slice(0, 10)}`);

/* ═══ 8. Verificación del efecto paginación (limit=200 por query) ═══ */
log(`\n══ EFECTO PAGINACIÓN (API aplica range(0,199) POR CADA fuente) ══`);
log(`  receipts=${receipts.length} (¿>200? ${receipts.length > 200 ? 'SÍ — PÉRDIDA DE DATOS' : 'no'})  services=${services.length} (¿>200? ${services.length > 200 ? 'SÍ — PÉRDIDA DE DATOS' : 'no'})  commissions=${commissions.length} (¿>200? ${commissions.length > 200 ? 'SÍ' : 'no'})`);

/* ═══ 9. Dump máquina ═══ */
if (asJson) {
  console.log(JSON.stringify({
    store_id: STORE_ID, stores, kpis, agingTotals,
    counts: { receipts: receipts.length, services: services.length, commissions: commissions.length, txns: txns.length },
    paidDocs: paidDocs.map(p => ({ ref_type: p.ref_type, ref_id: p.ref_id, supplier: p.supplier, total_cup: p.total_cup, currency: p.currency, created_at: p.created_at, due_date: p.due_date })),
    partialDocs: partialDocs.map(p => ({ ref_type: p.ref_type, ref_id: p.ref_id, supplier: p.supplier, paid_cup: p.paid_cup, balance_cup: p.balance_cup })),
    txnSummary: { inCup, revCup, netCup, orphanCount: orphanTxns.length, dupRevCount: dupRev.length },
    groupedCurrent: gCurrent, groupedTarget: gTarget,
    noSupplier: noSupplier.map(p => ({ ref_type: p.ref_type, ref_id: p.ref_id, total_cup: p.total_cup, balance_cup: p.balance_cup, payment_status: p.payment_status, due_date: p.due_date, created_at: p.created_at })),
    foreignPayments: foreign,
  }, null, 2));
}
