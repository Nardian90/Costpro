#!/usr/bin/env node
/**
 * cpbra-forensic-7criticals.mjs — CP-BRA-REMEDIATION-001 (FASE 2)
 *
 * Auditoría forense de datos (SOLO LECTURA, producción) de los siete
 * hallazgos CRÍTICOS del RISK-REGISTER CP-BRA-001:
 *   R-01 trigger update_payment_status sin rama OT (paid_amount desactualizado)
 *   R-02 CxC con tasa fija 450 (vs jerarquía canónica de tasas)
 *   R-04 recepciones anuladas con pagos vivos (estado tras guards 20261126120000)
 *   R-05 ajustes de inventario confirmados con autorización mínima
 *   R-11 ventas con payment_incidents (PT011 desactivado sin verificación)
 *   R-14 reversiones de pagos en períodos fiscales cerrados/locked
 *   R-15 duplicados de proveedores/clientes por nombre normalizado
 *
 * SOLO LECTURA vía Management API (POST /database/query exclusivamente con
 * SELECT; el método POST dispara la heurística de escritor pero el script no
 * contiene ninguna operación INSERT/UPDATE/DELETE/DDL). Re-ejecutable.
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}
const fmt = (n) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log('CP-BRA-REMEDIATION-001 — FORENSE 7 CRÍTICOS — ' + new Date().toISOString());
console.log('Proyecto producción: ' + PROD_REF + ' (SOLO LECTURA)');

/* ══ R-01 · OT: paid_amount desactualizado (rama perdida del trigger) ══ */
console.log('\n══ R-01 · production_orders.paid_amount vs pagos reales (neteo) ══');
{
  const rows = await runSql(`
    SELECT po.id, po.order_number, po.status, po.budget_currency, po.budget_total,
           po.paid_amount AS paid_column, po.payment_status,
           COALESCE(SUM(CASE WHEN COALESCE(pt.direction,'in')='reversal' THEN -pt.amount_cup
                             ELSE pt.amount_cup END),0) AS paid_real,
           COUNT(pt.id) AS n_pagos
    FROM production_orders po
    JOIN payment_transactions pt ON pt.ref_id = po.id AND pt.ref_type IN ('production_order','work')
    GROUP BY po.id
    ORDER BY po.order_number;`);
  let stale = 0, ok = 0, total = rows.length;
  for (const r of rows) {
    const diff = Number(r.paid_column) - Number(r.paid_real);
    const mark = Math.abs(diff) > 0.01 ? 'STALE' : 'OK';
    if (mark === 'STALE') stale++; else ok++;
    console.log(`  ${mark} ${r.order_number} [${r.status}] ${r.budget_currency} total=${fmt(r.budget_total)} col=${fmt(r.paid_column)} real=${fmt(r.paid_real)} diff=${fmt(diff)} pagos=${r.n_pagos} pstatus=${r.payment_status}`);
  }
  console.log(`  → OTs con pagos: ${total} · coherentes: ${ok} · DESACTUALIZADAS (R-01): ${stale}`);
  // pagos a OT en estado no admisible (draft/voided)
  const bad = await runSql(`
    SELECT po.order_number, po.status, pt.id, pt.amount_cup, pt.payment_date, pt.direction
    FROM payment_transactions pt
    JOIN production_orders po ON po.id = pt.ref_id
    WHERE pt.ref_type IN ('production_order','work')
      AND po.status IN ('draft','voided')
      AND COALESCE(pt.direction,'in') = 'in';`);
  console.log(`  → pagos 'in' sobre OT draft/voided: ${bad.length}`);
  for (const b of bad.slice(0, 10)) console.log(`    ${b.order_number} [${b.status}] pago=${fmt(b.amount_cup)} fecha=${b.payment_date}`);
}

/* ══ R-02 · CxC: conversión con tasa fija 450 vs canónica ══ */
console.log('\n══ R-02 · OT no-CUP con saldo: tasa 450 (ruta actual) vs tasa de tienda ══');
{
  const rows = await runSql(`
    SELECT po.id, po.order_number, po.budget_currency, po.budget_total, po.paid_amount,
           po.status, po.store_id
    FROM production_orders po
    WHERE po.budget_currency <> 'CUP'
      AND po.status NOT IN ('voided')
    ORDER BY po.order_number LIMIT 30;`);
  const rates = await runSql(`SELECT store_id, currency, rate FROM store_exchange_rates;`);
  const rateOf = (store, cur) => rates.find((r) => r.store_id === store && r.currency === cur)?.rate ?? null;
  for (const r of rows) {
    const bal = Number(r.budget_total) - Number(r.paid_amount);
    const fixed = bal * 450;
    const canon = rateOf(r.store_id, r.budget_currency);
    const canonCup = canon ? bal * Number(canon) : null;
    console.log(`  ${r.order_number} [${r.status}] ${r.budget_currency} bal=${fmt(bal)} → ruta(×450)=${fmt(fixed)} | tienda(${canon ?? 'SIN TASA'})=${canonCup === null ? '—' : fmt(canonCup)}`);
  }
  console.log(`  → OT no-CUP activas: ${rows.length} (de ellas con saldo>0: ${rows.filter((r) => Number(r.budget_total) - Number(r.paid_amount) > 0.01).length})`);
  // pagos en moneda distinta a la del presupuesto (mezcla de monedas)
  const mix = await runSql(`
    SELECT po.order_number, po.budget_currency, pt.currency AS pago_currency, pt.amount, pt.amount_cup
    FROM payment_transactions pt
    JOIN production_orders po ON po.id = pt.ref_id
    WHERE pt.ref_type IN ('production_order','work') AND po.budget_currency <> 'CUP';`);
  console.log(`  → pagos sobre OT no-CUP: ${mix.length}`);
  for (const m of mix.slice(0, 10)) console.log(`    ${m.order_number} presupuesto=${m.budget_currency} pago=${m.pago_currency} ${fmt(m.amount)} (amount_cup=${fmt(m.amount_cup)})`);
}

/* ══ R-04 · recepciones anuladas con pagos vivos ══ */
console.log('\n══ R-04 · recepciones voided/reversed con pagos vivos (tras guards 20261126120000) ══');
{
  const rows = await runSql(`
    SELECT r.id, r.reference_doc, r.status, r.total_cost, r.paid_amount,
           COALESCE(SUM(CASE WHEN COALESCE(pt.direction,'in')='reversal' THEN -pt.amount_cup
                             ELSE pt.amount_cup END),0) AS live_paid,
           COUNT(pt.id) AS n
    FROM receipts r
    JOIN payment_transactions pt ON pt.ref_id = r.id AND pt.ref_type = 'receipt'
    WHERE r.status IN ('voided','reversed')
    GROUP BY r.id
    HAVING COALESCE(SUM(CASE WHEN COALESCE(pt.direction,'in')='reversal' THEN -pt.amount_cup
                             ELSE pt.amount_cup END),0) > 0.01;`);
  console.log(`  → recepciones anuladas con pagos VIVOS: ${rows.length}`);
  for (const r of rows) console.log(`    ${r.reference_doc} [${r.status}] total=${fmt(r.total_cost)} vivo=${fmt(r.live_paid)} (${r.n} filas)`);
  // servicios ídem
  const rows2 = await runSql(`
    SELECT s.id, s.service_number, s.status, s.total_amount,
           COALESCE(SUM(CASE WHEN COALESCE(pt.direction,'in')='reversal' THEN -pt.amount_cup
                             ELSE pt.amount_cup END),0) AS live_paid,
           COUNT(pt.id) AS n
    FROM received_services s
    JOIN payment_transactions pt ON pt.ref_id = s.id AND pt.ref_type = 'service'
    WHERE s.status IN ('voided','cancelled')
    GROUP BY s.id
    HAVING COALESCE(SUM(CASE WHEN COALESCE(pt.direction,'in')='reversal' THEN -pt.amount_cup
                             ELSE pt.amount_cup END),0) > 0.01;`);
  console.log(`  → servicios anulados con pagos VIVOS: ${rows2.length}`);
  for (const r of rows2) console.log(`    ${r.service_number} [${r.status}] total=${fmt(r.total_amount)} vivo=${fmt(r.live_paid)} (${r.n} filas)`);
}

/* ══ R-05 · ajustes confirmados: desviación y rol del confirmante ══ */
console.log('\n══ R-05 · inventory_adjustments confirmados: desviación y autorización ══');
{
  const rows = await runSql(`
    SELECT ia.id, ia.status, ia.created_at, ia.confirmed_by, p.role,
           COUNT(iai.id) AS n_items,
           COALESCE(SUM(ABS(iai.counted_quantity - iai.expected_quantity)),0) AS desviacion_abs,
           COALESCE(SUM(ABS(iai.counted_quantity - iai.expected_quantity) /
                 NULLIF(ABS(iai.expected_quantity),0)),0) AS desviacion_rel
    FROM inventory_adjustments ia
    LEFT JOIN inventory_adjustment_items iai ON iai.adjustment_id = ia.id
    LEFT JOIN profiles p ON p.id = ia.confirmed_by
    WHERE ia.status = 'confirmed'
    GROUP BY ia.id, p.role
    ORDER BY ia.created_at;`);
  const byRole = {};
  for (const r of rows) {
    const role = r.role ?? 'sin-perfil';
    byRole[role] = (byRole[role] ?? 0) + 1;
    if (rows.length <= 20 || Number(r.desviacion_abs) > 0) {
      console.log(`  ${r.created_at} rol=${role} items=${r.n_items} desv_abs=${fmt(r.desviacion_abs)}`);
    }
  }
  console.log(`  → ajustes confirmados: ${rows.length} · por rol: ${JSON.stringify(byRole)}`);
}

/* ══ R-11 · ventas con payment_incidents ══ */
console.log('\n══ R-11 · ventas con payment_incidents (PT011 desactivado) ══');
{
  const rows = await runSql(`
    SELECT t.id, t.created_at, t.total_amount, t.payment_incidents,
           COALESCE((SELECT SUM(pt.amount_cup) FROM payment_transactions pt
                     WHERE pt.transaction_id = t.id),0) AS sum_paid
    FROM transactions t
    WHERE t.payment_incidents IS NOT NULL
      AND jsonb_typeof(t.payment_incidents) = 'array'
      AND jsonb_array_length(t.payment_incidents) > 0
    ORDER BY t.created_at;`);
  let withDiff = 0;
  const types = {};
  for (const r of rows) {
    const diff = Number(r.total_amount) - Number(r.sum_paid);
    if (Math.abs(diff) > 0.01) withDiff++;
    for (const inc of (r.payment_incidents ?? [])) {
      types[inc?.type ?? 'sin-type'] = (types[inc?.type ?? 'sin-type'] ?? 0) + 1;
    }
    if (rows.length <= 25) {
      console.log(`  ${r.created_at} total=${fmt(r.total_amount)} pagado=${fmt(r.sum_paid)} diff=${fmt(diff)} tipos=${(r.payment_incidents ?? []).map((i) => i?.type).join('|')}`);
    }
  }
  console.log(`  → ventas con incidencias: ${rows.length} · con Σpagos≠total: ${withDiff} · tipos: ${JSON.stringify(types)}`);
}

/* ══ R-14 · reversiones de pagos en períodos fiscales cerrados ══ */
console.log('\n══ R-14 · contra-filas sobre pagos en período fiscal cerrado/locked ══');
{
  const rows = await runSql(`
    SELECT pt.id AS reversal_id, pt.created_at AS reversal_at, orig.id AS orig_id,
           orig.payment_date AS orig_date, orig.amount_cup, fc.period_year, fc.period_month, fc.status AS fc_status
    FROM payment_transactions pt
    JOIN payment_transactions orig ON pt.reverses_payment_id = orig.id
    JOIN fiscal_closings fc ON fc.store_id = orig.store_id
         AND fc.status IN ('closed','locked')
         AND orig.payment_date >= make_date(fc.period_year, fc.period_month, 1)
         AND orig.payment_date < make_date(fc.period_year, fc.period_month, 1) + interval '1 month'
    ORDER BY pt.created_at;`);
  console.log(`  → reversiones sobre pagos en período fiscal CERRADO: ${rows.length}`);
  for (const r of rows) console.log(`    reversión ${r.reversal_id} (${r.reversal_at}) sobre pago ${r.orig_id} fecha=${r.orig_date} ${fmt(r.amount_cup)} período ${r.period_year}-${r.period_month} [${r.fc_status}]`);
  const total = await runSql(`
    SELECT COUNT(*) AS n FROM payment_transactions WHERE reverses_payment_id IS NOT NULL;`);
  const fc = await runSql(`SELECT store_id, period_year, period_month, status FROM fiscal_closings ORDER BY period_year, period_month;`);
  console.log(`  → total contra-filas de reversión: ${total[0]?.n} · cierres fiscales: ${fc.length}`);
  for (const f of fc.slice(0, 10)) console.log(`    cierre ${f.period_year}-${f.period_month} [${f.status}]`);
}

/* ══ R-15 · duplicados de terceros ══ */
console.log('\n══ R-15 · duplicados por nombre normalizado ══');
{
  const sup = await runSql(`
    SELECT store_id, lower(btrim(name)) AS norm, COUNT(*) AS n,
           ARRAY_AGG(name ORDER BY name) AS variantes,
           SUM(CASE WHEN tax_id IS NULL THEN 1 ELSE 0 END) AS sin_tax
    FROM suppliers
    WHERE COALESCE(is_active, true)
    GROUP BY store_id, lower(btrim(name))
    HAVING COUNT(*) > 1;`);
  console.log(`  → GRUPOS de proveedores duplicados (nombre normalizado): ${sup.length}`);
  for (const s of sup.slice(0, 15)) console.log(`    store=${s.store_id} "${s.norm}" ×${s.n} variantes=${JSON.stringify(s.variantes)} sin_tax=${s.sin_tax}`);
  const supTotal = await runSql(`SELECT COUNT(*) AS n, SUM(CASE WHEN tax_id IS NULL THEN 1 ELSE 0 END) AS sin_tax FROM suppliers;`);
  console.log(`  → proveedores totales: ${supTotal[0]?.n} · sin tax_id: ${supTotal[0]?.sin_tax}`);
  const cus = await runSql(`
    SELECT store_id, lower(btrim(name)) AS norm, COUNT(*) AS n, ARRAY_AGG(name ORDER BY name) AS variantes
    FROM customers
    GROUP BY store_id, lower(btrim(name))
    HAVING COUNT(*) > 1;`);
  console.log(`  → GRUPOS de clientes duplicados: ${cus.length}`);
  for (const c of cus.slice(0, 10)) console.log(`    store=${c.store_id} "${c.norm}" ×${c.n} ${JSON.stringify(c.variantes)}`);
  const cusTotal = await runSql(`SELECT COUNT(*) AS n FROM customers;`);
  console.log(`  → clientes totales: ${cusTotal[0]?.n}`);
}

console.log('\nFIN — evidencia re-ejecutable: node scripts/cpbra-forensic-7criticals.mjs');
