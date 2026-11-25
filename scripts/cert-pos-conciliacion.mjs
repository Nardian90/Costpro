#!/usr/bin/env node
/**
 * cert-pos-conciliacion.mjs — CP-POS-SMOKE-PRODUCTION-001 (FASE 3+4).
 * ───────────────────────────────────────────────────────────────────────────
 * CONCILIACIÓN FINANCIERA INDEPENDIENTE de las ventas creadas por la suite
 * de certificación E2E (e2e/flows/pos-peritem-cert.spec.ts → test-results/
 * cert-sales.jsonl). NO repite las aserciones del test: re-verifica cada
 * venta DIRECTAMENTE contra la BD aislada (REST service-role, SOLO lectura)
 * y emite un acta de conciliación (JSON + Markdown) por venta y global.
 *
 * Reglas monetarias aplicadas (contrato CP-POS):
 *   · Las distribuciones conservan la moneda ORIGEN de cada fila.
 *   · Prohibido sumar monedas distintas: el equivalente CUP de una fila
 *     = amount × exchange_rate (CUP → ×1).
 *   · El ledger (payment_transactions) es la autoridad financiera
 *     consolidada: amount_cup por fila; moneda original preservada.
 *   · Inventario: delta exacto por línea + movimiento 'sale' trazado a la
 *     venta (reference_id = transaction_id), sin duplicados.
 *
 * Uso:
 *   node scripts/cert-pos-conciliacion.mjs [--in test-results/cert-sales.jsonl]
 *   (requiere E2E_SUPABASE_URL + E2E_SUPABASE_SERVICE_ROLE_KEY en el entorno)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const URL_ = process.env.E2E_SUPABASE_URL;
const KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('FALLO: E2E_SUPABASE_URL y E2E_SUPABASE_SERVICE_ROLE_KEY requeridas.');
  process.exit(2);
}
const inArg = process.argv.includes('--in') ? process.argv[process.argv.indexOf('--in') + 1] : 'test-results/cert-sales.jsonl';
const raw = readFileSync(inArg, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
// Solo entradas de VENTA real (con store_id; las entradas informativas —
// CERT-UI-D sin venta, CERT-UI-E solo persistencia, y el meta del run — se
// excluyen) y deduplicadas por sale_id.
const sales = raw.filter((r) => r.sale_id && r.store_id);
const seen = new Set();
for (const r of [...sales]) {
  if (seen.has(r.sale_id)) sales.splice(sales.indexOf(r), 1);
  else seen.add(r.sale_id);
}
const runMeta = raw.find((r) => r._run) || {};
const ref = URL_.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || '';

async function rest(table, query) {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`REST ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}
const n = (v) => Number(v ?? 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;
const cupEq = (d) => n(d.amount) * (String(d.currency || 'CUP').toUpperCase() === 'CUP' ? 1 : n(d.exchange_rate ?? 0) || null);

const findings = [];
function check(sale, id, ok, detail) {
  findings.push({ sale: sale.test, sale_id: sale.sale_id, id, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id} — ${detail}`);
  return ok;
}

console.log(`Conciliación independiente — ref aislada ${ref} · ${sales.length} ventas`);
let allOk = true;
const reports = [];

for (const sale of sales) {
  const txId = sale.sale_id;
  console.log(`\n== ${sale.test} · venta ${txId.slice(0, 8)} (esperado: ${sale.expected_total})`);
  const [tx] = await rest('transactions', `id=eq.${txId}&select=*`);
  if (!tx) { check(sale, 'TX-EXISTE', false, 'venta no encontrada'); allOk = false; continue; }
  const items = await rest('transaction_items', `transaction_id=eq.${txId}&select=product_id,quantity,price_at_sale,price_at_sale_cup,payment_distributions`);
  const ledger = await rest('payment_transactions', `transaction_id=eq.${txId}&select=payment_method,currency,amount,amount_cup,reference,exchange_rate`);
  const rep = { test: sale.test, sale_id: txId, created_at: tx.created_at, checks: [], tables: {} };

  // C1 — Σ líneas = total de la venta
  const sumLines = items.reduce((s, i) => s + r2(n(i.price_at_sale) * n(i.quantity)), 0);
  rep.checks.push({ id: 'C1', ok: r2(sumLines) === r2(n(tx.total_amount)), detail: `Σ líneas ${sumLines} = total ${n(tx.total_amount)}` });
  allOk = check(sale, 'C1', r2(sumLines) === r2(n(tx.total_amount)), `Σ líneas (${items.length}) ${sumLines} vs total ${n(tx.total_amount)}`);

  // C2 — Σ distribuciones (equivalente CUP por tasa registrada) = total
  const distRows = items.flatMap((i) => (i.payment_distributions || []).map((d) => ({ ...d, product_id: i.product_id })));
  const sumDistCup = distRows.reduce((s, d) => s + (cupEq(d) ?? 0), 0);
  allOk = check(sale, 'C2', r2(sumDistCup) === r2(n(tx.total_amount)), `Σ distribuciones en CUP ${r2(sumDistCup)} vs total ${n(tx.total_amount)} (${distRows.length} filas)`);

  // C3 — Σ ledger amount_cup = total
  const sumLedgerCup = ledger.reduce((s, l) => s + n(l.amount_cup), 0);
  allOk = check(sale, 'C3', r2(sumLedgerCup) === r2(n(tx.total_amount)), `Σ ledger amount_cup ${r2(sumLedgerCup)} vs total ${n(tx.total_amount)} (${ledger.length} filas)`);

  // C4 — por MÉTODO: Σ distribuciones (CUP eq) = Σ ledger por método
  const byMethod = {};
  for (const d of distRows) {
    const eq = cupEq(d) ?? 0;
    byMethod[d.method] = r2((byMethod[d.method] || 0) + eq);
  }
  const ledgerByMethod = {};
  for (const l of ledger) ledgerByMethod[l.payment_method] = r2((ledgerByMethod[l.payment_method] || 0) + n(l.amount_cup));
  const methodsOk = Object.keys({ ...byMethod, ...ledgerByMethod }).every(
    (m) => r2(byMethod[m] || 0) === r2(ledgerByMethod[m] || 0),
  );
  allOk = check(sale, 'C4', methodsOk, `por método dist=${JSON.stringify(byMethod)} ledger=${JSON.stringify(ledgerByMethod)}`);

  // C5 — por MONEDA (importes ORIGINALES, sin conversión; NUNCA sumados entre sí)
  const byCurrency = {};
  for (const d of distRows) {
    const cur = String(d.currency || 'CUP').toUpperCase();
    byCurrency[cur] = r2((byCurrency[cur] || 0) + n(d.amount));
  }
  const ledgerByCurrency = {};
  for (const l of ledger) ledgerByCurrency[String(l.currency || 'CUP').toUpperCase()] = r2((ledgerByCurrency[String(l.currency || 'CUP').toUpperCase()] || 0) + n(l.amount));
  const curOk = Object.keys({ ...byCurrency, ...ledgerByCurrency }).every(
    (c) => r2(byCurrency[c] || 0) === r2(ledgerByCurrency[c] || 0),
  );
  allOk = check(sale, 'C5', curOk, `por moneda (origen) dist=${JSON.stringify(byCurrency)} ledger=${JSON.stringify(ledgerByCurrency)}`);

  // C6 — vinculación línea→producto: cada product_id de las distribuciones existe en los items
  const itemIds = new Set(items.map((i) => i.product_id));
  const linkOk = distRows.every((d) => itemIds.has(d.product_id));
  allOk = check(sale, 'C6', linkOk, `todas las distribuciones vinculadas a líneas (${itemIds.size} productos)`);

  // C7 — transferencias con monto>0 llevan referencia
  const refOk = distRows
    .filter((d) => (d.method === 'transfer' || d.method === 'external_transfer') && n(d.amount) > 0)
    .every((d) => String(d.reference || '').trim().length > 0);
  allOk = check(sale, 'C7', refOk, 'referencia de operación presente en cada fila de transferencia con monto>0');

  // C8 — inventario: delta exacto + movimiento 'sale' único por línea
  let invOk = true;
  const invDetail = [];
  for (const it of items) {
    const [inv] = await rest('inventory', `store_id=eq.${sale.store_id}&product_id=eq.${it.product_id}&select=quantity`);
    const prod = await rest('products', `id=eq.${it.product_id}&select=name,stock_current`);
    const moves = await rest('stock_movements', `store_id=eq.${sale.store_id}&product_id=eq.${it.product_id}&reference_id=eq.${txId}&select=movement_type,quantity_change,created_at`);
    const saleMoves = moves.filter((m) => m.movement_type === 'sale');
    const expectedDelta = -n(it.quantity);
    const actualDelta = saleMoves.reduce((s, m) => s + n(m.quantity_change), 0);
    const ok = saleMoves.length === 1 && r2(actualDelta) === r2(expectedDelta);
    if (!ok) invOk = false;
    invDetail.push(`${prod[0]?.name}: Δ${actualDelta} (esp ${expectedDelta}), movimientos 'sale'=${saleMoves.length}, stock_actual=${n(inv?.quantity)}`);
  }
  allOk = check(sale, 'C8', invOk, invDetail.join(' · '));

  // C9 — sin doble contabilización: cada fila del ledger corresponde a ≥1 distribución
  // (componentes agrupados por método/moneda/ref) y Σ coincide (ya cubierto en C2/C3/C4/C5);
  // aquí se valida que NO existan filas de ledger huérfanas (método sin distribuciones).
  const ledgerOrphans = ledger.filter((l) => !distRows.some((d) => d.method === l.payment_method));
  allOk = check(sale, 'C9', ledgerOrphans.length === 0, `filas de ledger sin distribución origen: ${ledgerOrphans.length}`);

  // C10 — caja: moneda original preservada en el ledger + amount_cup coherente con la tasa
  let c10ok = true;
  const c10detail = [];
  for (const l of ledger) {
    const cur = String(l.currency || 'CUP').toUpperCase();
    const rate = n(l.exchange_rate) || 1;
    const expectedCup = cur === 'CUP' ? n(l.amount) : n(l.amount) * rate;
    if (r2(expectedCup) !== r2(n(l.amount_cup))) c10ok = false;
    c10detail.push(`${l.payment_method}/${cur}: ${n(l.amount)} → amount_cup ${n(l.amount_cup)}`);
  }
  allOk = check(sale, 'C10', c10ok, c10detail.join(' · '));

  // Datos del cliente (trazabilidad F/G)
  const custOk = sale.customer
    ? tx.customer_name === sale.customer.name && tx.customer_ci === sale.customer.ci
    : tx.customer_name === null && tx.customer_ci === null;
  allOk = check(sale, 'C11', custOk, sale.customer ? `cliente ${tx.customer_name}/${tx.customer_ci}` : 'sin datos personales (null)');

  rep.tables = {
    transaccion: { total: n(tx.total_amount), payment_method: tx.payment_method, status: tx.status, customer: `${tx.customer_name ?? '—'} / ${tx.customer_ci ?? '—'}` },
    lineas: items.map((i) => ({ product_id: i.product_id, qty: n(i.quantity), price: n(i.price_at_sale), distribuciones: i.payment_distributions })),
    ledger,
    por_metodo: { distribuciones: byMethod, ledger: ledgerByMethod },
    por_moneda: { distribuciones: byCurrency, ledger: ledgerByCurrency },
    inventario: invDetail,
  };
  reports.push(rep);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = 'docs/audits/CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001/evidencia/certificacion';
mkdirSync(outDir, { recursive: true });
const jsonPath = join(outDir, `CONCILIACION_${stamp}.json`);
const mdPath = join(outDir, `CONCILIACION_${stamp}.md`);

const md = [
  `# CONCILIACIÓN FINANCIERA INDEPENDIENTE — certificación CP-POS (${stamp})`,
  ``,
  `- **BD:** aislada CostproE2E (\`${ref}\`) · **ventas:** ${sales.length} · **entorno:** certificación E2E UI (PR #1708/#1709)`,
  `- **Artefacto de entrada:** \`${inArg}\` (ventas capturadas por la interfaz real)`,
  `- **Regla monetaria:** equivalente CUP de una distribución = \`amount × exchange_rate\` (CUP ×1); monedas NUNCA sumadas entre sí.`,
  ``,
  ...reports.map((r) => [
    `## ${r.test} — venta \`${r.sale_id.slice(0, 8)}\` (total ${r.tables.transaccion.total})`,
    ``,
    `| Check | Resultado |`,
    `|---|---|`,
    ...r.checks.map((c) => `| ${c.id} | ${c.ok ? 'OK' : 'FAIL'} — ${c.detail} |`),
    ``,
    `**Por método** (CUP eq): ${JSON.stringify(r.tables.por_metodo)}`,
    ``,
    `**Por moneda origen** (sin conversión): ${JSON.stringify(r.tables.por_moneda)}`,
    ``,
  ].join('\n')),
  `## VEREDICTO`,
  ``,
  allOk
    ? `**CONCILIACIÓN EXACTA** — todas las verificaciones pasaron (${findings.filter((f) => f.ok).length}/${findings.length}).`
    : `**DISCREPANCIAS DETECTADAS** — ver checks FAIL arriba (${findings.filter((f) => !f.ok).length} de ${findings.length}).`,
].join('\n');

writeFileSync(jsonPath, JSON.stringify({ run: runMeta, ref, stamp, verdict: allOk ? 'CONCILIACION_EXACTA' : 'DISCREPANCIAS', findings, reports }, null, 2));
writeFileSync(mdPath, md);
console.log(`\n=== VEREDICTO: ${allOk ? 'CONCILIACIÓN EXACTA' : 'DISCREPANCIAS'} — ${findings.filter((f) => f.ok).length}/${findings.length} checks OK`);
console.log(`Acta: ${jsonPath}\n      ${mdPath}`);
process.exit(allOk ? 0 : 1);
