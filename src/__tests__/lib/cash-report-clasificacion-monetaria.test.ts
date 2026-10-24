/**
 * MISIÓN DEFINITIVA (2026-10-24) — CLASIFICACIÓN POR MONEDA EN REPORTE ENTREGA
 * Casos de regresión obligatorios §7 del brief, con datos CONTROLADOS.
 *
 * Cubre el ciclo completo de clasificación:
 *   reconstructTxCollections (moneda real de cobro — ledger v2.25.0 y
 *   reconstrucción histórica) → accumulateSalesSplit/buildSalesGroups →
 *   computeDailySummary (hojas CUP/USD — ingreso nativo + equivalencia
 *   canónica separada).
 *
 * Caso central (incidencia ENERVIDA 23/10/2026): venta íntegra en USD
 * (SKU 22 · 7 USD × tasa 800 = 5.600 CUP canónico) NO debe aparecer como
 * segunda venta de 5.600 CUP en el reporte CUP.
 */
import { describe, it, expect } from 'vitest';
import {
  reconstructTxCollections,
  accumulateSalesSplit,
  buildSalesGroups,
  resolvePredominantCurrency,
  type CollectionTx,
  type CollectionItem,
  type LedgerPayment,
  type SalesSplitAccum,
} from '@/lib/cash-report/collection-currency';
import { computeDailySummary, type CashReportLike } from '@/lib/cash-report/summary';

const TX_BASE = (over: Partial<CollectionTx>): CollectionTx => ({
  id: 'tx-1',
  cash_amount: 0,
  transfer_amount: 0,
  zelle_amount: 0,
  sale_currency: 'CUP',
  sale_exchange_rate: 1,
  ...over,
});

const ITEM_BASE = (over: Partial<CollectionItem>): CollectionItem => ({
  transaction_id: 'tx-1',
  product_id: 'p-22',
  product_name: 'Conectores MC4',
  sku: '22',
  quantity: 1,
  price_at_sale: 7,
  price_at_sale_cup: 5600,
  currency: 'USD',
  exchange_rate: 800,
  cash_paid: 0,
  cash_currency: 'USD',
  transfer_paid: 0,
  transfer_currency: 'USD',
  zelle_paid: 0,
  zelle_currency: 'USD',
  ...over,
});

const R = (partial: Partial<CashReportLike>): CashReportLike => ({
  sales: [], payments: [], commissions: [], production: [],
  sales_split: {}, adjustments: [],
  ...partial,
});

/** Reconstruye una venta, acumula el split y devuelve (split, grupos, resultados). */
function classify(txs: Array<{ tx: CollectionTx; items: CollectionItem[]; payments?: LedgerPayment[] }>) {
  const acc: SalesSplitAccum = {};
  const results = txs.map(({ tx, items, payments }) => ({ tx, result: reconstructTxCollections(tx, items, payments) }));
  for (const { result } of results) accumulateSalesSplit(acc, result);
  return { acc, groups: buildSalesGroups(results), results };
}

// ══════════════ CASO 1 — VENTA ÍNTEGRAMENTE EN USD (la incidencia 23/10) ══════════════
describe('Caso 1 — venta íntegra en USD (7 USD, SKU 22, tasa 800)', () => {
  // Ítem V2 con fila explícita cash_paid 7 USD (flujo real del POS)
  const items = [ITEM_BASE({ cash_paid: 7, cash_currency: 'USD' })];
  const tx = TX_BASE({ cash_amount: 5600, sale_currency: 'CUP', sale_exchange_rate: 1 });

  it('la reconstrucción clasifica el cobro UNA vez, en USD por 7 (no 5.600 CUP)', () => {
    const { acc, groups } = classify([{ tx, items }]);
    expect(acc['USD']).toBeDefined();
    expect(acc['USD'].cash).toBe(7);
    expect(acc['CUP']).toBeUndefined();          // NO hay venta CUP
    expect(groups).toEqual([
      { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 7, total_cup: 5600 },
    ]);
  });

  it('hojas del reporte: USD 7 una vez; CUP sin ingreso de venta; equivalencia en línea propia', () => {
    const { acc, groups } = classify([{ tx, items }]);
    const report = R({ sales_split: acc, sales: groups, sales_equiv_cash_other_cup: 5600, sales_equiv_voucher_other_cup: 0 });
    const cup = computeDailySummary(report, 'CUP');
    const usd = computeDailySummary(report, 'USD');
    expect(usd.ventasCash).toBe(7);
    expect(usd.ventasTotales).toBe(7);
    expect(cup.ventasCash).toBe(0);              // ← el defecto reportado (segunda venta 5.600) está muerto
    expect(cup.ventasTotales).toBe(0);
    expect(cup.equivCashOtraMoneda).toBe(5600);  // canónico contable, tasa trazable
    expect(cup.efectivoEsperado).toBe(5600);     // consolidación del comprobante de entrega
  });

  it('vía fallback de grupos (sin split): mismo resultado — una sola fuente de verdad', () => {
    const report = R({
      sales: [{ payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 7, total_cup: 5600 }],
    });
    const cup = computeDailySummary(report, 'CUP');
    expect(cup.ventasCash).toBe(0);
    expect(cup.ventasTotales).toBe(0);
    expect(cup.equivCashOtraMoneda).toBe(5600);
    expect(cup.efectivoEsperado).toBe(5600);
  });
});

// ══════════════ CASO 2 — VENTA ÍNTEGRAMENTE EN CUP ══════════════
describe('Caso 2 — venta íntegra en CUP (5.600 CUP)', () => {
  const items = [ITEM_BASE({
    price_at_sale: 5600, price_at_sale_cup: 5600, currency: 'CUP', exchange_rate: 1,
    cash_paid: 5600, cash_currency: 'CUP',
  })];
  const tx = TX_BASE({ cash_amount: 5600, sale_currency: 'CUP', sale_exchange_rate: 1 });

  it('reconstrucción: una sola vez en CUP; nada en USD', () => {
    const { acc } = classify([{ tx, items }]);
    expect(acc['CUP'].cash).toBe(5600);
    expect(acc['USD']).toBeUndefined();
  });

  it('hojas: CUP 5.600 una vez; USD 0; sin equivalencias', () => {
    const { acc, groups } = classify([{ tx, items }]);
    const report = R({ sales_split: acc, sales: groups, sales_equiv_cash_other_cup: 0, sales_equiv_voucher_other_cup: 0 });
    const cup = computeDailySummary(report, 'CUP');
    const usd = computeDailySummary(report, 'USD');
    expect(cup.ventasCash).toBe(5600);
    expect(cup.efectivoEsperado).toBe(5600);
    expect(usd.ventasCash).toBe(0);
    expect(usd.efectivoEsperado).toBe(0);
    expect(cup.equivCashOtraMoneda).toBe(0);
  });
});

// ══════════════ CASO 3 — VENTA MIXTA (componentes en dos monedas) ══════════════
describe('Caso 3 — venta mixta 7 USD con componente CUP (ledger v2.25.0)', () => {
  // Venta 7 USD liquidada 5 USD efectivo + 1.600 CUP (tasa 800):
  // ledger autoritativo: una fila por componente con su moneda y tasa real.
  const payments: LedgerPayment[] = [
    { payment_method: 'cash', currency: 'USD', amount: 5, exchange_rate: 800 },
    { payment_method: 'cash', currency: 'CUP', amount: 1600, exchange_rate: 1 },
  ];
  const items = [ITEM_BASE({})];
  const tx = TX_BASE({ cash_amount: 5600, sale_currency: 'CUP' });

  it('reconstrucción por LEDGER: cada componente en su moneda efectiva (sin duplicar el importe completo)', () => {
    const { acc, groups, results } = classify([{ tx, items, payments }]);
    expect(results[0].result.source).toBe('ledger');
    expect(acc['USD'].cash).toBe(5);
    expect(acc['CUP'].cash).toBe(1600);
    // Grupos por (método, moneda): dos grupos, Σ = venta una vez (5×800 + 1600 = 5.600 canónico)
    expect(groups).toHaveLength(2);
    const totalCup = groups.reduce((s, g) => s + g.total_cup, 0);
    expect(totalCup).toBe(5600);
  });

  it('hojas: cada hoja su componente; equivalencia CUP solo con el canónico del tramo USD', () => {
    const { acc, groups } = classify([{ tx, items, payments }]);
    const report = R({
      sales_split: acc,
      sales: groups,
      sales_equiv_cash_other_cup: 4000, // 5 USD × 800 (tramo USD del cobro mixto)
      sales_equiv_voucher_other_cup: 0,
    });
    const cup = computeDailySummary(report, 'CUP');
    const usd = computeDailySummary(report, 'USD');
    expect(cup.ventasCash).toBe(1600);           // componente CUP nativo — UNA vez
    expect(cup.equivCashOtraMoneda).toBe(4000);  // canónico del componente USD
    expect(cup.efectivoEsperado).toBe(5600);     // 1600 + 4000 (consolidación completa, sin duplicar)
    expect(usd.ventasCash).toBe(5);              // componente USD nativo — UNA vez
    expect(usd.efectivoEsperado).toBe(5);
  });

  it('clasificación de CANTIDAD por moneda predominante (no duplica unidades)', () => {
    const { results } = classify([{ tx, items, payments }]);
    const pred = resolvePredominantCurrency(results[0].result);
    // 5 USD × 800 = 4.000 > 1.600 CUP ⇒ predomina USD
    expect(pred.currency).toBe('USD');
    expect(pred.usdCollected).toBe(5);
    expect(pred.cupCollected).toBe(1600);
    expect(pred.rate).toBe(800);
  });
});

// ══════════════ CASO 4 — USD CON VUELTO EN CUP (10 USD → vuelto 2.400 CUP) ══════════════
describe('Caso 4 — venta 7 USD, cliente entrega 10 USD, vuelto 2.400 CUP (tasa 800)', () => {
  // Representación persistida (flujo POS): ítem con cobro NETO 7 USD explícito;
  // cabecera con cash_received_usd=10 / change_given_cup=2400 (metadatos físicos).
  const items = [ITEM_BASE({ cash_paid: 7, cash_currency: 'USD' })];
  const tx = TX_BASE({ cash_amount: 5600, sale_currency: 'CUP', sale_exchange_rate: 1 });

  it('ingreso por venta: 7 USD UNA vez — el vuelto NO es ingreso ni crea venta CUP', () => {
    const { acc } = classify([{ tx, items }]);
    expect(acc['USD'].cash).toBe(7);             // ingreso = 7, no 10 (el vuelto no es ingreso)
    expect(acc['CUP']).toBeUndefined();          // el vuelto −2.400 CUP no crea venta CUP
    expect(acc['USD'].total).toBe(7);
  });

  it('hojas: USD 7 / CUP 0 de venta; equivalencia canónica 5.600 separada (nunca 10 ni 2.400 como venta)', () => {
    const { acc, groups } = classify([{ tx, items }]);
    const report = R({ sales_split: acc, sales: groups, sales_equiv_cash_other_cup: 5600, sales_equiv_voucher_other_cup: 0 });
    const cup = computeDailySummary(report, 'CUP');
    const usd = computeDailySummary(report, 'USD');
    expect(usd.ventasCash).toBe(7);
    expect(cup.ventasCash).toBe(0);
    expect(cup.ventasTotales).toBe(0);
    expect(cup.equivCashOtraMoneda).toBe(5600);  // 7×800 — jamás 10×800=8.000 ni el vuelto como venta
  });
});

// ══════════════ CASO 5 — VARIOS PAGOS/LÍNEAS RELACIONADOS (anti-JOIN) ══════════════
describe('Caso 5 — venta con varios pagos e ítems: JOIN/agregación no multiplica', () => {
  // Venta de 2 ítems (línea A 2×7 USD, línea B 1×5600 CUP) pagada con DOS
  // componentes de ledger en USD (3+11) — la reconstrucción agrupa por
  // (método,moneda) una vez por venta.
  const items = [
    ITEM_BASE({ quantity: 2, price_at_sale: 7, price_at_sale_cup: 11200, cash_paid: 0 }),
    ITEM_BASE({ quantity: 1, price_at_sale: 5600, price_at_sale_cup: 5600, currency: 'CUP', exchange_rate: 1, cash_paid: 0 }),
  ];
  const payments: LedgerPayment[] = [
    { payment_method: 'cash', currency: 'USD', amount: 3, exchange_rate: 800 },
    { payment_method: 'cash', currency: 'USD', amount: 11, exchange_rate: 800 },
  ];
  const tx = TX_BASE({ cash_amount: 16800, sale_currency: 'CUP' });

  it('el ledger suma los componentes a UN bucket (14 USD) — sin filas duplicadas', () => {
    const { acc, groups } = classify([{ tx, items, payments }]);
    expect(acc['USD'].cash).toBe(14);
    const usdGroups = groups.filter(g => g.currency === 'USD');
    expect(usdGroups).toHaveLength(1);           // un solo grupo, no uno por fila de pago
    expect(usdGroups[0].total).toBe(14);
    expect(usdGroups[0].transaction_count).toBe(1); // UNA venta, no dos
  });

  it('la tabla por producto reparte la venta una sola vez por ítem (Σ perItem = bucket)', () => {
    const { results } = classify([{ tx, items, payments }]);
    const perItem = results[0].result.perItem;
    const sumUsd = perItem.reduce((s, p) => s + p.usd.cash, 0);
    expect(sumUsd).toBeCloseTo(14, 6);           // el bucket se reparte, no se copia
    const sumCup = perItem.reduce((s, p) => s + p.cup.cash, 0);
    expect(sumCup).toBe(0);
  });

  it('hojas: USD 14 una vez; equivalencia 11.200 (14×800) separada; CUP sin venta', () => {
    const { acc, groups } = classify([{ tx, items, payments }]);
    const report = R({ sales_split: acc, sales: groups, sales_equiv_cash_other_cup: 11200, sales_equiv_voucher_other_cup: 0 });
    const cup = computeDailySummary(report, 'CUP');
    const usd = computeDailySummary(report, 'USD');
    expect(usd.ventasCash).toBe(14);
    expect(cup.ventasCash).toBe(0);
    expect(cup.equivCashOtraMoneda).toBe(11200);
    expect(cup.efectivoEsperado).toBe(11200);
  });
});

// ══════════════ CASO 6 — REVERSOS, ANULACIONES Y DEVOLUCIONES ══════════════
describe('Caso 6 — anulaciones/reversos no reaparecen como ventas duplicadas', () => {
  it('los buckets solo se construyen desde ventas COMPLETADAS (la API filtra status y voided)', () => {
    // Contrato de la cadena: /api/cash-report filtra transactions.status='completed'
    // y el RPC get_cash_report excluye status='voided' — una venta voided nunca
    // llega a la reconstrucción. Prueba el contrato de la función pura: la
    // clasificación de una venta dada es determinista y única; la exclusión de
    // anuladas es responsabilidad de la consulta (verificada en su test propio).
    const items = [ITEM_BASE({ cash_paid: 7, cash_currency: 'USD' })];
    const tx = TX_BASE({ cash_amount: 5600, sale_currency: 'CUP' });
    const { acc } = classify([{ tx, items }]);
    expect(Object.keys(acc)).toEqual(['USD']);   // una venta ⇒ un bucket ⇒ sin fantasmas
  });

  it('devolución con reembolso cash: resta del esperado de SU moneda una sola vez (regla P1)', () => {
    const report = R({
      sales_split: { CUP: { cash: 1000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 1000 } },
      refund_rows: [{ id: 'rf1', payment_method: 'cash', currency: 'CUP', amount: 300, amount_cup: 300 }],
      sales_equiv_cash_other_cup: 5600,
    });
    const cup = computeDailySummary(report, 'CUP');
    expect(cup.reembolsosCash).toBe(300);
    expect(cup.efectivoEsperado).toBe(1000 + 5600 - 300); // venta CUP + equivalencia − reembolso, cada término una vez
  });
});

// ══════════════ CASO 7 — FILTROS / REINTENTOS: DETERMINISMO ══════════════
describe('Caso 7 — determinismo ante refrescos y vías de cálculo', () => {
  const items = [ITEM_BASE({ cash_paid: 7, cash_currency: 'USD' })];
  const tx = TX_BASE({ cash_amount: 5600, sale_currency: 'CUP' });

  it('reconstruir dos veces produce el mismo split (sin acumulación en reintentos de la pantalla)', () => {
    const a = classify([{ tx, items }]);
    const b = classify([{ tx, items }]);
    expect(a.acc).toEqual(b.acc);
    expect(a.groups).toEqual(b.groups);
  });

  it('la equivalencia se aplica a la hoja canónica CUP únicamente (USD nunca la hereda)', () => {
    const { acc, groups } = classify([{ tx, items }]);
    const report = R({ sales_split: acc, sales: groups, sales_equiv_cash_other_cup: 5600, sales_equiv_voucher_other_cup: 0 });
    const usd = computeDailySummary(report, 'USD');
    expect(usd.equivCashOtraMoneda).toBe(0);
    expect(usd.ventasCash).toBe(7);
    expect(usd.efectivoEsperado).toBe(7);
  });

  it('la tasa usada para la equivalencia es la PERSISTIDA de la operación (800), no inventada', () => {
    const { results } = classify([{ tx, items }]);
    const bucket = results[0].result.buckets[0];
    expect(bucket.amount).toBe(7);
    expect(bucket.amountCup).toBe(5600);         // 7 × 800 del exchange_rate del ítem/ledger
  });
});

// ══════════════ CASO 8 — AISLAMIENTO MULTITIENDA (contrato de consulta) ══════════════
describe('Caso 8 — aislamiento multitienda', () => {
  it('la clasificación es función de los datos entregados: las consultas filtran por store_id y la función no mezcla orígenes', () => {
    // Contrato: /api/cash-report y payment-totals consultan con
    // .eq('store_id', active_store_id) (RLS + membership en la ruta); la
    // función pura clasifica SOLO lo recibido — dos tiendas con la misma
    // venta no se contaminan porque cada request trae sus propias filas.
    const itemsA = [ITEM_BASE({ cash_paid: 7, cash_currency: 'USD' })];
    const txA = TX_BASE({ id: 'tx-A', cash_amount: 5600 });
    const itemsB = [ITEM_BASE({ cash_paid: 5600, cash_currency: 'CUP', price_at_sale: 5600, price_at_sale_cup: 5600, currency: 'CUP', exchange_rate: 1 })];
    const txB = TX_BASE({ id: 'tx-B', cash_amount: 5600 });

    const a = classify([{ tx: txA, items: itemsA }]);
    const b = classify([{ tx: txB, items: itemsB }]);
    expect(a.acc['USD'].cash).toBe(7);
    expect(a.acc['CUP']).toBeUndefined();
    expect(b.acc['CUP'].cash).toBe(5600);
    expect(b.acc['USD']).toBeUndefined();
  });
});
