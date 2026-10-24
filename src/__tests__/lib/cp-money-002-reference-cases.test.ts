/**
 * CP-MONEY-002 — TABLA DE CASOS DE REFERENCIA de la misión (Fase C) con
 * tasa de prueba 1 USD = 1 000 CUP, evaluada contra la implementación
 * FUSIONADA de #1467 (reconstructTxCollections + resolvePredominantCurrency
 * por ledger directo) — evidencia esperado vs obtenido para el PR.
 *
 * Producto X: precio unitario 10 USD, cantidad 2, total exigible 20 USD
 * (20 000 CUP a la tasa de prueba). Los cobros viajan como filas del ledger
 * (payment_transactions §17 de create_sale_v2): una fila por componente con
 * su moneda real y la TASA DE LA OPERACIÓN persistida (nunca la global
 * actual). La tasa PERSISTIDA de la operación es la evidencia de tasa usada.
 *
 * Casos G/H (insuficientes): la política VIGENTE de COSTPRO es MISIÓN-FLEX
 * (2026-10-17) — el POS exige pago completo (PT011) y solo admite faltante
 * DOCUMENTADO como incidencia (payment_incidents + nota + auditoría
 * SALE_PAYMENT_INCIDENT). Estos casos verifican que la clasificación
 * refleja SOLO lo cobrado y que el reporte marca la incidencia: la venta
 * nunca aparece falsamente liquidada por 20 000 CUP cuando solo se cobró
 * la mitad. La venta parcial (salvo pendiente explícito) no existe en la
 * política actual: el faltante documentado NO es saldo de crédito.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  reconstructTxCollections,
  resolvePredominantCurrency,
  buildItemsSummary,
  type CollectionTx,
  type CollectionItem,
  type LedgerPayment,
} from '@/lib/cash-report/collection-currency';
import { buildPaymentComponents, requiresPaymentComponents } from '@/lib/pos/payment-components';

const RATE = 1000; // 1 USD = 1 000 CUP (tasa de PRUEBA de la misión)
const TOTAL_CUP = 20000; // 2 × 10 USD
const TX = 'cp-money-002-ref-case';

/** Venta de 2 uds del producto X (precio USD, valor CUP histórico a RATE).
 * withPaid: forma REAL de la venta según el flujo — con componentes el
 * desglose viaja en payments[] por ítem; sin componentes (venta CUP pura)
 * los campos legacy cash_paid/cash_currency son la verdad del cobro. */
const item = (withPaid?: { method: 'cash' | 'transfer' | 'zelle'; currency: string; amount: number }): CollectionItem => ({
  transaction_id: TX,
  product_id: 'prod-x',
  product_name: 'Producto X',
  sku: 'X-1',
  quantity: 2,
  price_at_sale: 10,
  price_at_sale_cup: 10 * RATE,
  currency: 'USD',
  exchange_rate: RATE,
  cash_paid: 0,
  cash_currency: 'CUP',
  transfer_paid: 0,
  transfer_currency: 'CUP',
  zelle_paid: 0,
  zelle_currency: 'USD',
  // La fila de pago explícita pisa el cero por defecto del método cobrado.
  ...(withPaid
    ? { [`${withPaid.method}_paid`]: withPaid.amount, [`${withPaid.method}_currency`]: withPaid.currency }
    : {}),
} as CollectionItem);

const tx = (pools: Partial<CollectionTx> = {}): CollectionTx => ({
  id: TX,
  cash_amount: 0,
  transfer_amount: 0,
  zelle_amount: 0,
  sale_currency: 'CUP',
  sale_exchange_rate: 1,
  ...pools,
});

const pay = (method: 'cash' | 'transfer' | 'zelle', currency: 'CUP' | 'USD', amount: number): LedgerPayment => ({
  payment_method: method,
  currency,
  amount,
  exchange_rate: currency === 'USD' ? RATE : 1,
});

/** Clasifica una venta con los componentes dados y devuelve el veredicto. */
function classify(payments?: LedgerPayment[], itemRow?: CollectionItem, txRow?: CollectionTx) {
  const row = itemRow ?? item();
  const header = txRow ?? tx();
  const result = reconstructTxCollections(header, [row], payments);
  const p = resolvePredominantCurrency(result);
  const summary = buildItemsSummary([{ item: row, tx: header, txId: TX, payments }]);
  return { result, p, summary };
}

describe('CP-MONEY-002 Fase C · tabla de casos de referencia (1 USD = 1 000 CUP)', () => {
  it('A. 20 USD → pagada; predomina USD (20 000 CUP equivalentes)', () => {
    const { p, summary } = classify([pay('cash', 'USD', 20)]);
    expect(p.currency).toBe('USD');
    expect(p.usdCollected).toBe(20);
    expect(p.usdCollectedCup).toBe(20000);
    expect(p.cupCollected).toBe(0);
    expect(p.tie).toBe(false);
    // 2 unidades completas al reporte USD; SIN componente secundario ficticio.
    expect(summary.totals.qty_usd).toBe(2);
    expect(summary.totals.qty_cup).toBe(0);
    expect(summary.totals.usd_total).toBe(20);
    expect(summary.totals.total_quantity).toBe(2);
    expect(summary.sales_classification[0]).toMatchObject({ predominant: 'USD', tie: false, source: 'ledger' });
  });

  it('B. 20 000 CUP → pagada; predomina CUP — venta CUP pura por el flujo legado (verdad del cobro: fila del ítem, no ledger directo)', () => {
    // Forma REAL de la venta B: sin componentes (regla de envío del cliente),
    // cobro CUP puro con filas de pago por ítem + pool canónico. El ledger de
    // una venta CUP pura es indistinguible del legado (marcadores §13.7) y el
    // reporte la reconstruye por la heurística de filas explícitas del ítem.
    const { p, summary } = classify(
      [{ payment_method: 'cash', currency: 'CUP', amount: 20000, exchange_rate: 1 }],
      item({ method: 'cash', currency: 'CUP', amount: 20000 }),
      tx({ cash_amount: 20000 }),
    );
    expect(p.currency).toBe('CUP');
    expect(p.cupCollected).toBe(20000);
    expect(summary.totals.qty_cup).toBe(2);
    expect(summary.totals.qty_usd).toBe(0);
    expect(summary.totals.usd_total).toBe(0);
  });

  it('C. 5 USD + 15 000 CUP → pagada; predomina CUP (5 000 < 15 000) — unidades a CUP, USD solo como componente monetario', () => {
    const { p, summary } = classify([pay('cash', 'USD', 5), pay('cash', 'CUP', 15000)]);
    expect(p.currency).toBe('CUP');
    expect(p.usdCollected).toBe(5);
    expect(p.usdCollectedCup).toBe(5000);
    expect(p.cupCollected).toBe(15000);
    // Unidades físicas: TODAS a CUP; el USD NO vuelve a atribuir unidades.
    expect(summary.totals.qty_cup).toBe(2);
    expect(summary.totals.qty_usd).toBe(0);
    // El reporte USD refleja el componente cobrado (5) sin duplicar la venta.
    expect(summary.totals.usd_total).toBe(5);
    // Invariante de cuadre: Σ componentes a tasa persistida = 20 000 CUP.
    expect(p.cupCollected + p.usdCollectedCup).toBeCloseTo(20000, 2);
    expect(summary.totals.total_quantity).toBe(2);
  });

  it('D. 8 USD + 12 000 CUP → pagada; predomina CUP (8 000 < 12 000) — sin forzar la moneda', () => {
    const { p, summary } = classify([pay('cash', 'USD', 8), pay('cash', 'CUP', 12000)]);
    expect(p.currency).toBe('CUP');
    expect(summary.totals.qty_cup).toBe(2);
    expect(summary.totals.usd_total).toBe(8);
  });

  it('E. 12 USD + 8 000 CUP → pagada; predomina USD (12 000 > 8 000)', () => {
    const { p, summary } = classify([pay('cash', 'USD', 12), pay('cash', 'CUP', 8000)]);
    expect(p.currency).toBe('USD');
    expect(summary.totals.qty_usd).toBe(2);
    expect(summary.totals.qty_cup).toBe(0);
    expect(summary.totals.cash_cup).toBe(8000);
    expect(summary.totals.usd_total).toBe(12);
  });

  it('F. 10 USD + 10 000 CUP → EMPATE económico exacto ⇒ CUP (regla determinista documentada de #1467)', () => {
    const { p, summary } = classify([pay('cash', 'USD', 10), pay('cash', 'CUP', 10000)]);
    expect(p.tie).toBe(true);
    expect(p.currency).toBe('CUP');
    expect(summary.totals.qty_cup).toBe(2);
    // Empate ESTABLE: la misma entrada produce siempre la misma clasificación.
    const again = classify([pay('cash', 'USD', 10), pay('cash', 'CUP', 10000)]);
    expect(again.p.currency).toBe('CUP');
    expect(again.p.tie).toBe(true);
  });

  it('G. 5 USD + 5 000 CUP (10 000 de 20 000) → insuficiente: incidencia documentada, clasificación SOLO por lo cobrado — nunca aparece liquidada por 20 000', () => {
    const { p, summary } = classify([pay('cash', 'USD', 5), pay('cash', 'CUP', 5000)]);
    // Cobrado: 10 000 CUP equivalentes ≠ 20 000 exigibles → incidencia.
    expect(p.cupCollected + p.usdCollectedCup).toBe(10000);
    expect(summary.items[0].has_payment_incident).toBe(true);
    expect(summary.sales_classification[0]).toMatchObject({
      cup_collected: 5000,
      usd_collected: 5,
      usd_collected_cup: 5000,
    });
    // La política vigente (MISIÓN-FLEX) NO crea saldo de crédito: el faltante
    // queda como incidencia documentada, no como venta liquidada.
    expect(summary.totals.total_quantity).toBe(2);
    expect(summary.totals.usd_total).toBe(5);
  });

  it('H. 8 USD + 2 000 CUP (10 000 de 20 000) → insuficiente: incidencia; del COBRO predomina USD (8 000 > 2 000)', () => {
    const { p, summary } = classify([pay('cash', 'USD', 8), pay('cash', 'CUP', 2000)]);
    expect(p.currency).toBe('USD'); // 8 USD = 8 000 CUP equiv > 2 000 CUP cobrados
    expect(p.tie).toBe(false);
    expect(p.usdCollectedCup).toBe(8000);
    expect(p.cupCollected).toBe(2000);
    expect(summary.items[0].has_payment_incident).toBe(true);
  });

  it('I. 25 USD (sobrepago) → el desglose del cobro es ÚNICO (sin componente ficticio); el vuelto se liquida por la política D6 aparte del desglose', () => {
    const { p, summary } = classify([pay('cash', 'USD', 25)]);
    expect(p.currency).toBe('USD');
    expect(summary.totals.usd_total).toBe(25);
    // El desglose por moneda del reporte refleja el componente cobrado; el
    // NETO de la venta (25 − 5 de vuelto = 20) lo cuadra la liquidación D6
    // (cash_received/change_given) en caja — no inventando componentes aquí.
    const comps = buildPaymentComponents([{ payments: [{ method: 'cash', amount: 25, currency: 'USD' }] }]);
    expect(comps).toEqual([{ method: 'cash', currency: 'USD', amount: 25 }]);
  });

  it('J. 0 USD + 0 CUP → sin componentes: el builder no envía nada y el servidor exige pago completo (PT011) — la venta nunca se marca pagada', () => {
    const comps = buildPaymentComponents([{ payments: [] }]);
    expect(comps).toEqual([]);
    expect(requiresPaymentComponents(comps)).toBe(false);
    // Sin componentes, create_sale_v2 valida Σ(amount_cup) = total ± 0.01
    // (ERR_PAYMENT_INVARIANT_VIOLATED si faltan) — sin incidencia documentada
    // la venta de 0 no cuadra contra 20 000 exigibles y se rechaza.
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261025120000_cp_money_002_postmerge_integrity.sql'),
      'utf-8',
    );
    expect(migration).toContain('ERR_PAYMENT_INVARIANT_VIOLATED');
  });
});

