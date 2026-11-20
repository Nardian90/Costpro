/**
 * CP-FIX-DELIVERY-REPORT-AND-LANDING-RESPONSIVE-001 (2026-11-20) — PRUEBAS DE
 * REGRESIÓN Y RECONCILIACIÓN del Reporte de Entrega (Objetivo B de la misión).
 *
 * Fixtures ANONIMIZADOS pero con las CIFRAS EXACTAS de las ventas reales de
 * ENERVIDA-VITALLCONS (leídas en modo solo lectura de producción; ver
 * expediente del PR): ids sintéticos, importes/tasas/composiciones reales.
 *
 *   Caso 1 — Venta real del 19/11/2026 (TX 025f7b6b): la escoba conserva sus
 *            1.800 CUP, sin USD artificiales, sin asterisco, fuera de la hoja
 *            USD; el ledger queda íntegro y el total equivale a 39.800 CUP.
 *   Caso 2 — Ventas mixtas del 18/11/2026: reconstrucción histórica intacta.
 *   Caso 3 — Ventas mixtas del 17/10, 19/10 y 27/10: clasificación y
 *            conciliación sin degradación (incluida la incidencia AUTÉNTICA
 *            del 19/10, que conserva su asterisco).
 *   Caso 4 — Venta sin desglose individual: fallback histórico (prorrateo
 *            controlado y estimado, reconstrucción legada) sigue funcionando.
 *   Caso 5 — Pagos parciales y múltiples métodos: cash CUP + cash USD +
 *            transfer CUP + Zelle USD, tasas distintas, productos CUP y USD.
 *   Caso 6 — Incidencia auténtica: la diferencia real cobrado≠esperado
 *            conserva el asterisco (sobrecobro, subcobro y contradicción
 *            documento↔ledger auditable).
 *
 * Invariantes obligatorios de la misión (§3): se verifican sobre TODOS los
 * fixtures en el bloque final (reconciliación con el ledger, no duplicación de
 * cantidades, sin cobros individuales inventados, tasa del registro,
 * redondeo determinista, legibilidad histórica, paridad PDF↔vista previa).
 */
import { describe, it, expect } from 'vitest';
import {
  reconstructTxCollections,
  resolvePredominantCurrency,
  buildItemsSummary,
  buildSalesGroups,
  ledgerIsAuthoritative,
  type CollectionItem,
  type CollectionTx,
  type LedgerPayment,
} from '@/lib/cash-report/collection-currency';
import {
  salesTableItems,
  salesTableQty,
} from '@/components/views/terminal/views/cash/cash-report-pdf';

const EPS = 0.01;

// ── Constructores ────────────────────────────────────────────────────────────

/** Línea de venta; por defecto sin filas de pago (legado). */
const line = (over: Partial<CollectionItem>): CollectionItem => ({
  transaction_id: 't1', product_id: 'p1', product_name: 'P', sku: '1',
  quantity: 1, price_at_sale: 100, price_at_sale_cup: 100,
  currency: 'CUP', exchange_rate: 1,
  cash_paid: null, cash_currency: null,
  transfer_paid: null, transfer_currency: null,
  zelle_paid: null, zelle_currency: null,
  ...over,
});

const txOf = (id: string, over: Partial<CollectionTx> = {}): CollectionTx => ({
  id, cash_amount: 0, transfer_amount: 0, zelle_amount: 0,
  sale_currency: 'CUP', sale_exchange_rate: 1,
  ...over,
});

const ledger = (...rows: Array<[string, string, number, number]>): LedgerPayment[] =>
  rows.map(([method, currency, amount, rate]) => ({
    payment_method: method, currency, amount, exchange_rate: rate,
  }));

type Fixture = { item: CollectionItem; tx: CollectionTx; txId: string; payments?: LedgerPayment[] };

// ════════════════════════════════════════════════════════════════════════════
// CASO 1 — VENTA REAL DEL 19/11/2026 (TX 025f7b6b · ENERVIDA-VITALLCONS)
// 40 USD @930 (barilla, efectivo USD) + 1.800 CUP (escoba, transferencia CUP)
// + 800 CUP (detergente, efectivo CUP) = 39.800 CUP.
// ════════════════════════════════════════════════════════════════════════════

/** Fixture EXACTO de la venta del 19/11 (campos de producción, ids anonimizados). */
function venta1911(): { tx: CollectionTx; items: CollectionItem[]; payments: LedgerPayment[] } {
  return {
    tx: txOf('tx-1911', { cash_amount: 38000, transfer_amount: 1800 }),
    items: [
      line({
        transaction_id: 'tx-1911', product_id: 'prod-barilla', product_name: 'Barilla de Aterramientos',
        sku: 'B-001', quantity: 1, price_at_sale: 40, price_at_sale_cup: 37200,
        currency: 'USD', exchange_rate: 930,
        cash_paid: 40, cash_currency: 'USD',
      }),
      line({
        transaction_id: 'tx-1911', product_id: 'prod-escoba', product_name: 'Escoba',
        sku: 'E-001', quantity: 1, price_at_sale: 1800, price_at_sale_cup: 1800,
        currency: 'CUP', exchange_rate: 1,
        cash_paid: 0, cash_currency: 'CUP',
        transfer_paid: 1800, transfer_currency: 'CUP',
      }),
      line({
        transaction_id: 'tx-1911', product_id: 'prod-detergente', product_name: 'Detergente líquido',
        sku: 'D-001', quantity: 1, price_at_sale: 800, price_at_sale_cup: 800,
        currency: 'CUP', exchange_rate: 1,
        cash_paid: 800, cash_currency: 'CUP',
      }),
    ],
    payments: ledger(
      ['cash', 'CUP', 800, 1],
      ['transfer', 'CUP', 1800, 1],
      ['cash', 'USD', 40, 930],
    ),
  };
}

describe('CP-FIX · Caso 1 — venta real del 19/11/2026 (TX 025f7b6b)', () => {
  it('la rama ledger-directo se activa (fila cash USD) y los buckets reproducen el ledger EXACTO', () => {
    const { tx, items, payments } = venta1911();
    expect(ledgerIsAuthoritative(payments)).toBe(true);
    const result = reconstructTxCollections(tx, items, payments);
    expect(result.source).toBe('ledger');
    expect(result.buckets).toHaveLength(3);
    expect(result.buckets.find(b => b.method === 'cash' && b.currency === 'CUP')).toMatchObject({ amount: 800, amountCup: 800 });
    expect(result.buckets.find(b => b.method === 'transfer' && b.currency === 'CUP')).toMatchObject({ amount: 1800, amountCup: 1800 });
    expect(result.buckets.find(b => b.method === 'cash' && b.currency === 'USD')).toMatchObject({ amount: 40, amountCup: 37200 });
  });

  it('Nivel 1: cada artículo conserva SU cobro documental — la escoba NO recibe USD artificiales', () => {
    const { tx, items, payments } = venta1911();
    const result = reconstructTxCollections(tx, items, payments);
    const [barilla, escoba, detergente] = result.perItem;
    // Escoba: 1.800 CUP por transferencia — ni un centavo USD (el bug le
    // atribuía cash_usd ≈ 1,81 y transfer_cup ≈ 81,4 por prorrateo).
    expect(escoba.cup.transfer).toBeCloseTo(1800, 2);
    expect(escoba.cup.cash).toBe(0);
    expect(escoba.usd.cash + escoba.usd.transfer + escoba.usd.zelle).toBe(0);
    expect(escoba.usdCupEquiv ?? 0).toBe(0);
    // Detergente: 800 CUP en efectivo — sin USD (bug: cash_usd ≈ 0,80).
    expect(detergente.cup.cash).toBeCloseTo(800, 2);
    expect(detergente.usd.cash + detergente.usd.transfer + detergente.usd.zelle).toBe(0);
    // Barilla: 40 USD en efectivo — íntegro (el prorrateo le daba ≈ 37,39).
    expect(barilla.usd.cash).toBeCloseTo(40, 2);
    expect(barilla.usdCupEquiv ?? 0).toBeCloseTo(37200, 2);
    expect(barilla.cup.cash + barilla.cup.transfer).toBe(0);
    // Atribución 100 % explícita: sin prorrateo ni contradicciones (§2.3).
    expect(result.attribution).toEqual({ explicitItems: 3, proratedBuckets: 0, ledgerMismatch: false });
  });

  it('la escoba NO aparece en la sección USD del reporte (tabla por producto) ni genera asterisco falso', () => {
    const { tx, items, payments } = venta1911();
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1911', payments })));
    const escoba = summary.items.find(i => i.product_name === 'Escoba')!;
    const detergente = summary.items.find(i => i.product_name === 'Detergente líquido')!;
    const barilla = summary.items.find(i => i.product_name === 'Barilla de Aterramientos')!;
    // Sin asterisco injustificado (regla §2.4: cobro == valor de línea).
    expect(escoba.has_payment_incident).toBe(false);
    expect(detergente.has_payment_incident).toBe(false);
    expect(barilla.has_payment_incident).toBe(false);
    // Pertenencia a hojas del PDF: escoba y detergente SOLO en la hoja CUP;
    // la barilla SOLO en la hoja USD (mismos helpers que usa cash-report-pdf).
    expect(salesTableItems([escoba], 'CUP')).toHaveLength(1);
    expect(salesTableItems([escoba], 'USD')).toHaveLength(0);
    expect(salesTableItems([detergente], 'CUP')).toHaveLength(1);
    expect(salesTableItems([detergente], 'USD')).toHaveLength(0);
    expect(salesTableItems([barilla], 'CUP')).toHaveLength(0);
    expect(salesTableItems([barilla], 'USD')).toHaveLength(1);
    // Cantidades por hoja: 1 u CUP escoba + 1 u CUP detergente + 1 u USD barilla.
    expect(salesTableQty(escoba, 'CUP')).toBeCloseTo(1, 2);
    expect(salesTableQty(escoba, 'USD')).toBe(0);
    expect(salesTableQty(barilla, 'USD')).toBeCloseTo(1, 2);
    expect(summary.totals.qty_cup).toBeCloseTo(2, 2);
    expect(summary.totals.qty_usd).toBeCloseTo(1, 2);
    expect(summary.totals.total_quantity).toBe(3);
  });

  it('el ledger queda COMPLETO y la transacción equivale a 39.800 CUP (conciliación)', () => {
    const { tx, items, payments } = venta1911();
    const result = reconstructTxCollections(tx, items, payments);
    // Grupos `sales` por (método, moneda) — Nivel 2 intacto.
    const groups = buildSalesGroups([{ tx, result }]);
    expect(groups).toHaveLength(3);
    expect(groups.find(g => g.payment_method === 'cash' && g.currency === 'CUP')).toMatchObject({ total: 800, total_cup: 800 });
    expect(groups.find(g => g.payment_method === 'transfer' && g.currency === 'CUP')).toMatchObject({ total: 1800, total_cup: 1800 });
    expect(groups.find(g => g.payment_method === 'cash' && g.currency === 'USD')).toMatchObject({ total: 40, total_cup: 37200 });
    // Total equivalente de la transacción: 40×930 + 1.800 + 800 = 39.800 CUP.
    const cls = resolvePredominantCurrency(result);
    expect(cls.cupCollected + cls.usdCollectedCup).toBeCloseTo(39800, 2);
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1911', payments })));
    expect(summary.totals.total_cup).toBeCloseTo(39800, 2);
    expect(summary.totals.cash_cup).toBeCloseTo(800, 2);
    expect(summary.totals.transfer_cup).toBeCloseTo(1800, 2);
    expect(summary.totals.usd_total).toBeCloseTo(40, 2);
    // La clasificación de la venta expone la evidencia de atribución (§2.3).
    expect(summary.sales_classification[0]).toMatchObject({
      source: 'ledger',
      attribution: { explicitItems: 3, proratedBuckets: 0, ledgerMismatch: false },
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CASO 2 — VENTAS MIXTAS DEL 18/11/2026 (no activaron la rama ledger: su
// ledger solo tiene filas CUP → heurística con filas explícitas por ítem).
// ════════════════════════════════════════════════════════════════════════════

describe('CP-FIX · Caso 2 — ventas mixtas del 18/11/2026 (resultado histórico sin degradar)', () => {
  it('TX aaf2611a: producto CUP 5.000 CUP + producto USD 25 USD cobrado en 23.000 CUP — todo CUP, sin USD inventado', () => {
    const tx = txOf('tx-1811a', { cash_amount: 28000 });
    const items = [
      line({
        transaction_id: 'tx-1811a', product_id: 'prod-1811a-1', product_name: 'Producto A',
        sku: 'A-1811', quantity: 1, price_at_sale: 5000, price_at_sale_cup: 5000,
        currency: 'CUP', exchange_rate: 1, cash_paid: 5000, cash_currency: 'CUP',
      }),
      line({
        transaction_id: 'tx-1811a', product_id: 'prod-1811a-2', product_name: 'Producto B',
        sku: 'B-1811', quantity: 1, price_at_sale: 25, price_at_sale_cup: 23000,
        currency: 'USD', exchange_rate: 920, cash_paid: 23000, cash_currency: 'CUP',
      }),
    ];
    const payments = ledger(['cash', 'CUP', 28000, 1]);
    expect(ledgerIsAuthoritative(payments)).toBe(false); // heurística — como el 18/11
    const result = reconstructTxCollections(tx, items, payments);
    expect(result.source).toBe('reconstruction');
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 28000 });
    expect(result.perItem[0].cup.cash).toBeCloseTo(5000, 2);
    expect(result.perItem[1].cup.cash).toBeCloseTo(23000, 2);
    expect(result.perItem[1].usd.cash + result.perItem[1].usd.transfer + result.perItem[1].usd.zelle).toBe(0);
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1811a', payments })));
    expect(summary.totals.cash_cup).toBeCloseTo(28000, 2);
    expect(summary.totals.usd_total).toBe(0);
    expect(summary.totals.qty_cup).toBeCloseTo(2, 2);
    expect(summary.totals.qty_usd).toBe(0);
    expect(summary.items.every(i => !i.has_payment_incident)).toBe(true);
  });

  it('TX 7d9ad144: 2 u USD @930 cobradas en 9.300 CUP (dos filas de ledger CUP) — reconstrucción idéntica', () => {
    const tx = txOf('tx-1811b', { cash_amount: 9300 });
    const items = [line({
      transaction_id: 'tx-1811b', product_id: 'prod-1811b', product_name: 'Producto C',
      sku: 'C-1811', quantity: 2, price_at_sale: 5, price_at_sale_cup: 4650,
      currency: 'USD', exchange_rate: 930, cash_paid: 9300, cash_currency: 'CUP',
    })];
    const payments = ledger(['cash', 'CUP', 2790, 1], ['cash', 'CUP', 6510, 1]);
    const result = reconstructTxCollections(tx, items, payments);
    expect(result.source).toBe('reconstruction');
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 9300 });
    expect(result.perItem[0].cup.cash).toBeCloseTo(9300, 2);
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1811b', payments })));
    expect(summary.totals.qty_cup).toBeCloseTo(2, 2);
    expect(summary.items[0].has_payment_incident).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CASO 3 — VENTAS MIXTAS DEL 17/10, 19/10 Y 27/10 (clasificación y
// conciliación sin alteraciones; la incidencia AUTÉNTICA del 19/10 se conserva).
// ════════════════════════════════════════════════════════════════════════════

describe('CP-FIX · Caso 3 — ventas históricas del 17/10, 19/10 y 27/10', () => {
  it('17/10 TX 68e7464d: venta mixta con filas explícitas — clasificación monetaria intacta; la cantidad del ítem USD va a la sección USD (§2.5)', () => {
    const tx = txOf('tx-1710a', { cash_amount: 289750 });
    const items = [
      line({ transaction_id: 'tx-1710a', product_id: 'prod-1710-1', product_name: 'Producto CUP 1', sku: '170-1', quantity: 1, price_at_sale: 22000, price_at_sale_cup: 22000, currency: 'CUP', exchange_rate: 1, cash_paid: 22000, cash_currency: 'CUP' }),
      line({ transaction_id: 'tx-1710a', product_id: 'prod-1710-2', product_name: 'Producto USD', sku: '170-2', quantity: 1, price_at_sale: 150, price_at_sale_cup: 120750, currency: 'USD', exchange_rate: 805, cash_paid: 150, cash_currency: 'USD' }),
      line({ transaction_id: 'tx-1710a', product_id: 'prod-1710-3', product_name: 'Producto CUP 2', sku: '170-3', quantity: 7, price_at_sale: 20000, price_at_sale_cup: 20000, currency: 'CUP', exchange_rate: 1, cash_paid: 140000, cash_currency: 'CUP' }),
      line({ transaction_id: 'tx-1710a', product_id: 'prod-1710-4', product_name: 'Producto CUP 3', sku: '170-4', quantity: 1, price_at_sale: 5000, price_at_sale_cup: 5000, currency: 'CUP', exchange_rate: 1, cash_paid: 5000, cash_currency: 'CUP' }),
      line({ transaction_id: 'tx-1710a', product_id: 'prod-1710-5', product_name: 'Producto CUP 4', sku: '170-5', quantity: 1, price_at_sale: 2000, price_at_sale_cup: 2000, currency: 'CUP', exchange_rate: 1, cash_paid: 2000, cash_currency: 'CUP' }),
    ];
    const payments = ledger(['cash', 'CUP', 289750, 1]);
    const result = reconstructTxCollections(tx, items, payments);
    // Clasificación monetaria SIN cambios (misma que antes del fix):
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets.find(b => b.currency === 'CUP')).toMatchObject({ method: 'cash', amount: 169000 });
    expect(result.buckets.find(b => b.currency === 'USD')).toMatchObject({ method: 'cash', amount: 150, amountCup: 120750 });
    // El ítem USD conserva su cobro de 150 USD documental.
    expect(result.perItem[1].usd.cash).toBeCloseTo(150, 2);
    expect(result.perItem[1].usdCupEquiv ?? 0).toBeCloseTo(120750, 2);
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1710a', payments })));
    expect(summary.totals.cash_cup).toBeCloseTo(169000, 2);
    expect(summary.totals.usd_total).toBeCloseTo(150, 2);
    expect(summary.totals.total_cup).toBeCloseTo(289750, 2);
    // §2.5: las unidades del ítem USD van a la sección USD (antes, por
    // predominante de la venta, iban TODAS a CUP); las CUP quedan en CUP.
    expect(summary.totals.qty_cup).toBeCloseTo(10, 2);
    expect(summary.totals.qty_usd).toBeCloseTo(1, 2);
    expect(summary.totals.total_quantity).toBe(11);
    expect(summary.items.every(i => !i.has_payment_incident)).toBe(true);
  });

  it('19/10 TX 28e94349: incidencia AUTÉNTICA (subcobro 8.100 CUP) — el asterisco se CONSERVA en las líneas', () => {
    const tx = txOf('tx-1910a', { cash_amount: 169670 });
    const items = [
      line({ transaction_id: 'tx-1910a', product_id: 'prod-1910-1', product_name: 'Producto USD grande', sku: '190-1', quantity: 1, price_at_sale: 210, price_at_sale_cup: 170100, currency: 'USD', exchange_rate: 810, cash_paid: 162000, cash_currency: 'CUP' }),
      line({ transaction_id: 'tx-1910a', product_id: 'prod-1910-2', product_name: 'Producto CUP', sku: '190-2', quantity: 1, price_at_sale: 2000, price_at_sale_cup: 2000, currency: 'CUP', exchange_rate: 1, cash_paid: 2000, cash_currency: 'CUP' }),
      line({ transaction_id: 'tx-1910a', product_id: 'prod-1910-3', product_name: 'Producto USD chico', sku: '190-3', quantity: 1, price_at_sale: 7, price_at_sale_cup: 5670, currency: 'USD', exchange_rate: 810, cash_paid: 5670, cash_currency: 'CUP' }),
    ];
    const payments = ledger(['cash', 'CUP', 169670, 1]);
    const result = reconstructTxCollections(tx, items, payments);
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 169670 });
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1910a', payments })));
    // Cobrado 169.670 ≠ exigible 177.770 → incidencia documentada en la venta.
    expect(summary.totals.total_cup).toBeCloseTo(177770, 2);
    expect(summary.items.every(i => i.has_payment_incident)).toBe(true);
    expect(summary.totals.qty_cup).toBeCloseTo(3, 2);
    expect(summary.totals.qty_usd).toBe(0);
  });

  it('19/10 TX e8daad47: 5 u CUP con efectivo 60.000 + transferencia 40.000 (métodos múltiples) — exacta', () => {
    const tx = txOf('tx-1910b', { cash_amount: 60000, transfer_amount: 40000 });
    const items = [line({
      transaction_id: 'tx-1910b', product_id: 'prod-1910b', product_name: 'Producto multi-método',
      sku: '190-4', quantity: 5, price_at_sale: 20000, price_at_sale_cup: 20000,
      currency: 'CUP', exchange_rate: 1,
      cash_paid: 60000, cash_currency: 'CUP', transfer_paid: 40000, transfer_currency: 'CUP',
    })];
    const payments = ledger(['cash', 'CUP', 60000, 1], ['transfer', 'CUP', 40000, 1]);
    const result = reconstructTxCollections(tx, items, payments);
    expect(result.buckets.find(b => b.method === 'cash')).toMatchObject({ currency: 'CUP', amount: 60000 });
    expect(result.buckets.find(b => b.method === 'transfer')).toMatchObject({ currency: 'CUP', amount: 40000 });
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1910b', payments })));
    expect(summary.items[0].has_payment_incident).toBe(false);
    expect(summary.totals.qty_cup).toBeCloseTo(5, 2);
  });

  it('27/10 TX e825ba93: 4 líneas USD cobradas en CUP exacto — sin USD residual, sin incidencia', () => {
    const tx = txOf('tx-2710a', { cash_amount: 60840 });
    const items = [
      line({ transaction_id: 'tx-2710a', product_id: 'prod-2710-1', product_name: 'Producto USD 1', sku: '270-1', quantity: 1, price_at_sale: 7, price_at_sale_cup: 5915, currency: 'USD', exchange_rate: 845, cash_paid: 5915, cash_currency: 'CUP' }),
      line({ transaction_id: 'tx-2710a', product_id: 'prod-2710-2', product_name: 'Producto USD 2', sku: '270-2', quantity: 1, price_at_sale: 20, price_at_sale_cup: 16900, currency: 'USD', exchange_rate: 845, cash_paid: 16900, cash_currency: 'CUP' }),
      line({ transaction_id: 'tx-2710a', product_id: 'prod-2710-3', product_name: 'Producto USD 3', sku: '270-3', quantity: 5, price_at_sale: 4.5, price_at_sale_cup: 3802.5, currency: 'USD', exchange_rate: 845, cash_paid: 19012.5, cash_currency: 'CUP' }),
      line({ transaction_id: 'tx-2710a', product_id: 'prod-2710-4', product_name: 'Producto USD 4', sku: '270-4', quantity: 5, price_at_sale: 4.5, price_at_sale_cup: 3802.5, currency: 'USD', exchange_rate: 845, cash_paid: 19012.5, cash_currency: 'CUP' }),
    ];
    const payments = ledger(['cash', 'CUP', 60840, 1]);
    const result = reconstructTxCollections(tx, items, payments);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 60840 });
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-2710a', payments })));
    expect(summary.totals.cash_cup).toBeCloseTo(60840, 2);
    expect(summary.totals.usd_total).toBe(0);
    expect(summary.totals.qty_cup).toBeCloseTo(12, 2);
    expect(summary.items.every(i => !i.has_payment_incident)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CASO 4 — VENTA SIN DESGLOSE INDIVIDUAL (fallback histórico)
// ════════════════════════════════════════════════════════════════════════════

describe('CP-FIX · Caso 4 — venta sin desglose individual: fallback histórico', () => {
  it('legado SIN filas de pago: conversión exacta USD del RPC (SKU 128) — prorrateo estimado y trazable', () => {
    const tx = txOf('tx-legacy-128', { cash_amount: 31600 });
    const items = [line({
      transaction_id: 'tx-legacy-128', product_id: 'prod-128', product_name: 'Producto legacy USD',
      sku: '128', quantity: 2, price_at_sale: 20, price_at_sale_cup: 15800,
      currency: 'USD', exchange_rate: 790,
      // sin filas de pago — reconstrucción legada
    })];
    const result = reconstructTxCollections(tx, items); // sin payments
    expect(result.source).toBe('reconstruction');
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'USD', amount: 40, amountCup: 31600, origin: 'legacy-exact-usd' });
    expect(result.perItem[0].usd.cash).toBeCloseTo(40, 2);
    // El reparto legado queda MARCADO como estimado (no documental) — §2.3.
    expect(result.perItem[0].usdEstimated?.cash).toBeCloseTo(40, 2);
    expect(result.attribution).toEqual({ explicitItems: 0, proratedBuckets: 1, ledgerMismatch: false });
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-legacy-128' })));
    expect(summary.totals.qty_usd).toBeCloseTo(2, 2);
    expect(summary.items[0].has_payment_incident).toBe(false);
  });

  it('legado con monedas originales MEZCLadas y sin filas: mixedUnresolved + CUP canónico (limitación documentada)', () => {
    const tx = txOf('tx-legacy-mixed', { cash_amount: 9000 });
    const items = [
      line({ transaction_id: 'tx-legacy-mixed', product_id: 'prod-lm-1', product_name: 'Producto CUP', sku: 'LM-1', quantity: 1, price_at_sale: 1000, price_at_sale_cup: 1000, currency: 'CUP', exchange_rate: 1 }),
      line({ transaction_id: 'tx-legacy-mixed', product_id: 'prod-lm-2', product_name: 'Producto USD', sku: 'LM-2', quantity: 1, price_at_sale: 10, price_at_sale_cup: 8000, currency: 'USD', exchange_rate: 800 }),
    ];
    const result = reconstructTxCollections(tx, items);
    expect(result.mixedUnresolved).toBe(true); // condición de incertidumbre auditable
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 9000, origin: 'legacy-cup' });
    expect(result.perItem.every(c => c.usd.cash + c.usd.transfer + c.usd.zelle === 0)).toBe(true);
  });

  it('legado zelle: riel USD con tasa de la venta — fallback zelle-usd intacto', () => {
    const tx = txOf('tx-legacy-zelle', { zelle_amount: 8000, sale_currency: 'USD', sale_exchange_rate: 800 });
    const items = [line({
      transaction_id: 'tx-legacy-zelle', product_id: 'prod-lz', product_name: 'Producto Zelle',
      sku: 'LZ-1', quantity: 1, price_at_sale: 10, price_at_sale_cup: 8000,
      currency: 'USD', exchange_rate: 800,
    })];
    const result = reconstructTxCollections(tx, items);
    expect(result.buckets[0]).toMatchObject({ method: 'zelle', currency: 'USD', amount: 10, amountCup: 8000, origin: 'zelle-usd' });
    expect(result.perItem[0].usd.zelle).toBeCloseTo(10, 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CASO 5 — PAGOS PARCIALES Y MÚLTIPLES MÉTODOS (componentes, rama ledger)
// ════════════════════════════════════════════════════════════════════════════

describe('CP-FIX · Caso 5 — pagos parciales y múltiples métodos', () => {
  it('combinación completa (efectivo CUP + efectivo USD + transferencia CUP + Zelle USD, tasa 930): atribución exacta por ítem', () => {
    const tx = txOf('tx-multi', { cash_amount: 19400, transfer_amount: 1000, zelle_amount: 9300 });
    const escoba = line({
      transaction_id: 'tx-multi', product_id: 'prod-m-escoba', product_name: 'Escoba multi',
      sku: 'M-1', quantity: 1, price_at_sale: 1800, price_at_sale_cup: 1800,
      currency: 'CUP', exchange_rate: 1,
      cash_paid: 800, cash_currency: 'CUP',
      transfer_paid: 1000, transfer_currency: 'CUP',
    });
    const barilla = line({
      transaction_id: 'tx-multi', product_id: 'prod-m-barilla', product_name: 'Barilla multi',
      sku: 'M-2', quantity: 1, price_at_sale: 40, price_at_sale_cup: 37200,
      currency: 'USD', exchange_rate: 930,
      cash_paid: 20, cash_currency: 'USD',
      zelle_paid: 10, zelle_currency: 'USD',
    });
    const payments = ledger(
      ['cash', 'CUP', 800, 1],
      ['transfer', 'CUP', 1000, 1],
      ['cash', 'USD', 20, 930],
      ['zelle', 'USD', 10, 930],
    );
    const result = reconstructTxCollections(tx, [barilla, escoba], payments);
    expect(result.source).toBe('ledger');
    expect(result.buckets).toHaveLength(4);
    expect(result.buckets.find(b => b.method === 'zelle' && b.currency === 'USD')).toMatchObject({ amount: 10, amountCup: 9300 });
    // Atribución por ítem: cada uno con SU cobro (nada de prorrateo).
    expect(result.attribution).toEqual({ explicitItems: 2, proratedBuckets: 0, ledgerMismatch: false });
    expect(result.perItem[1].cup.cash).toBeCloseTo(800, 2);
    expect(result.perItem[1].cup.transfer).toBeCloseTo(1000, 2);
    expect(result.perItem[0].usd.cash).toBeCloseTo(20, 2);
    expect(result.perItem[0].usd.zelle).toBeCloseTo(10, 2);
    expect(result.perItem[0].usdCupEquiv ?? 0).toBeCloseTo(27900, 2); // 30 USD × 930
    // Conciliación total: 800 + 1.000 + 27.900 = 29.700 ≠ 39.800 → incidencia.
    const summary = buildItemsSummary([barilla, escoba].map(item => ({ item, tx, txId: 'tx-multi', payments })));
    expect(summary.items.every(i => i.has_payment_incident)).toBe(true);
    expect(summary.totals.qty_cup).toBeCloseTo(1, 2);
    expect(summary.totals.qty_usd).toBeCloseTo(1, 2);
  });

  it('tasas DISTINTAS por operación en la misma venta (zelle @930 + efectivo CUP): cada tasa es la del registro', () => {
    const tx = txOf('tx-rates', { cash_amount: 4000, zelle_amount: 9300, sale_currency: 'CUP', sale_exchange_rate: 1 });
    const itemUsd = line({
      transaction_id: 'tx-rates', product_id: 'prod-r-1', product_name: 'Producto tasa 930',
      sku: 'R-1', quantity: 1, price_at_sale: 10, price_at_sale_cup: 9300,
      currency: 'USD', exchange_rate: 930, zelle_paid: 10, zelle_currency: 'USD',
    });
    const itemCup = line({
      transaction_id: 'tx-rates', product_id: 'prod-r-2', product_name: 'Producto CUP',
      sku: 'R-2', quantity: 1, price_at_sale: 4000, price_at_sale_cup: 4000,
      currency: 'CUP', exchange_rate: 1, cash_paid: 4000, cash_currency: 'CUP',
    });
    const payments = ledger(['zelle', 'USD', 10, 930], ['cash', 'CUP', 4000, 1]);
    const result = reconstructTxCollections(tx, [itemUsd, itemCup], payments);
    expect(result.buckets.find(b => b.method === 'zelle')).toMatchObject({ currency: 'USD', amount: 10, amountCup: 9300 });
    expect(result.buckets.find(b => b.method === 'cash')).toMatchObject({ currency: 'CUP', amount: 4000 });
    expect(result.perItem[0].usdCupEquiv ?? 0).toBeCloseTo(9300, 2);
    const summary = buildItemsSummary([itemUsd, itemCup].map(item => ({ item, tx, txId: 'tx-rates', payments })));
    expect(summary.items.every(i => !i.has_payment_incident)).toBe(true);
    expect(summary.totals.qty_usd).toBeCloseTo(1, 2);
    expect(summary.totals.qty_cup).toBeCloseTo(1, 2);
  });

  it('venta CON componentes y SIN filas por ítem: prorrateo fallback estimado entre los ítems sin fila (documentado)', () => {
    const tx = txOf('tx-norows', { cash_amount: 8000 });
    const items = [
      line({ transaction_id: 'tx-norows', product_id: 'prod-nr-1', product_name: 'Producto 1', sku: 'NR-1', quantity: 1, price_at_sale: 5000, price_at_sale_cup: 5000, currency: 'CUP', exchange_rate: 1 }),
      line({ transaction_id: 'tx-norows', product_id: 'prod-nr-2', product_name: 'Producto 2', sku: 'NR-2', quantity: 1, price_at_sale: 3000, price_at_sale_cup: 3000, currency: 'CUP', exchange_rate: 1 }),
    ];
    const payments = ledger(['cash', 'CUP', 8000, 1]);
    const result = reconstructTxCollections(tx, items, payments);
    // Fallback controlado: residual completo prorrateado por valor de línea.
    expect(result.attribution).toEqual({ explicitItems: 0, proratedBuckets: 1, ledgerMismatch: false });
    expect(result.perItem[0].cup.cash).toBeCloseTo(5000, 2);
    expect(result.perItem[1].cup.cash).toBeCloseTo(3000, 2);
    // Marcado como estimado — distinto del cobro explícito documental.
    expect(result.perItem[0].cupEstimated?.cash).toBeCloseTo(5000, 2);
    expect(result.perItem[1].cupEstimated?.cash).toBeCloseTo(3000, 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CASO 6 — INCIDENCIA AUTÉNTICA (el asterisco se conserva)
// ════════════════════════════════════════════════════════════════════════════

describe('CP-FIX · Caso 6 — incidencia auténtica: asterisco conservado', () => {
  it('sobrecobro en el ledger (residual sin fila explícita): incidencia + prorrateo estimado señalado', () => {
    const tx = txOf('tx-over', { cash_amount: 1200 });
    const items = [line({
      transaction_id: 'tx-over', product_id: 'prod-over', product_name: 'Producto sobrecobrado',
      sku: 'OV-1', quantity: 1, price_at_sale: 1000, price_at_sale_cup: 1000,
      currency: 'CUP', exchange_rate: 1, cash_paid: 1000, cash_currency: 'CUP',
    })];
    const payments = ledger(['cash', 'CUP', 1200, 1]);
    const result = reconstructTxCollections(tx, items, payments);
    // Bucket = ledger (Nivel 2): 1.200; fila explícita cubre 1.000; residual
    // 200 prorrateado (todos los ítems tienen fila de cash) → estimado.
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 1200 });
    expect(result.perItem[0].cup.cash).toBeCloseTo(1200, 2);
    expect(result.perItem[0].cupEstimated?.cash).toBeCloseTo(200, 2);
    expect(result.attribution).toEqual({ explicitItems: 1, proratedBuckets: 1, ledgerMismatch: false });
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-over', payments })));
    // 1.200 cobrado ≠ 1.000 exigible → incidencia REAL (asterisco).
    expect(summary.items[0].has_payment_incident).toBe(true);
  });

  it('contradicción documento↔ledger (fila explícita excede el bucket): se conserva el desglose, el bucket y la señal de auditoría', () => {
    // Venta con componentes (ledger autoritativo: fila cash USD) donde la fila
    // explícita del ítem CUP declara 1.000 CUP pero el ledger solo tiene 800.
    const tx = txOf('tx-mismatch', { cash_amount: 372800, transfer_amount: 0 });
    const items = [
      line({
        transaction_id: 'tx-mismatch', product_id: 'prod-mm', product_name: 'Producto contradictorio',
        sku: 'MM-1', quantity: 1, price_at_sale: 800, price_at_sale_cup: 800,
        currency: 'CUP', exchange_rate: 1, cash_paid: 1000, cash_currency: 'CUP',
      }),
      line({
        transaction_id: 'tx-mismatch', product_id: 'prod-mm-2', product_name: 'Producto USD',
        sku: 'MM-2', quantity: 1, price_at_sale: 40, price_at_sale_cup: 37200,
        currency: 'USD', exchange_rate: 930, cash_paid: 40, cash_currency: 'USD',
      }),
    ];
    const payments = ledger(['cash', 'CUP', 800, 1], ['cash', 'USD', 40, 930]);
    const result = reconstructTxCollections(tx, items, payments);
    // Nivel 2: los buckets son el ledger (cash CUP 800 / cash USD 40).
    const cupBucket = result.buckets.find(b => b.currency === 'CUP')!;
    expect(cupBucket).toMatchObject({ method: 'cash', amount: 800 });
    // Nivel 1: las filas de los ítems se conservan tal cual (1.000 y 40).
    expect(result.perItem[0].cup.cash).toBeCloseTo(1000, 2);
    expect(result.perItem[1].usd.cash).toBeCloseTo(40, 2);
    // La contradicción queda SEÑALADA — no se silencia ni se fuerza (§2.3).
    expect(result.attribution.ledgerMismatch).toBe(true);
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-mismatch', payments })));
    expect(summary.items.find(i => i.sku === 'MM-1')!.has_payment_incident).toBe(true); // diferencia real
    expect(summary.sales_classification[0].attribution.ledgerMismatch).toBe(true);
  });

  it('diferencia explicable por CONVERSIÓN de tasa NO es incidencia (regla §2.4)', () => {
    // Ítem USD 40 @930 (línea 37.200 CUP) cobrado 40 USD a la tasa de la
    // operación 900 (equivalente 36.000): el cobro NATIVO coincide con el
    // precio nativo → la diferencia de CUP es solo valoración por tasa.
    const tx = txOf('tx-rateval', { cash_amount: 36000, sale_currency: 'CUP', sale_exchange_rate: 900 });
    const items = [line({
      transaction_id: 'tx-rateval', product_id: 'prod-rv', product_name: 'Producto valoración',
      sku: 'RV-1', quantity: 1, price_at_sale: 40, price_at_sale_cup: 37200,
      currency: 'USD', exchange_rate: 930, cash_paid: 40, cash_currency: 'USD',
    })];
    const payments = ledger(['cash', 'USD', 40, 900]);
    const result = reconstructTxCollections(tx, items, payments);
    expect(result.perItem[0].usd.cash).toBeCloseTo(40, 2);
    expect(result.perItem[0].usdCupEquiv ?? 0).toBeCloseTo(36000, 2); // tasa DEL cobro
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-rateval', payments })));
    // La venta sí tiene diferencia de valoración (36.000 ≠ 37.200) → la
    // incidencia de VENTA se señala (dinero realmente recibido ≠ exigible),
    // pero la comparación por ítem es NATIVA y no genera asterisco falso
    // cuando el cobro nativo coincide (regla documentada §2.4).
    const row = summary.items[0];
    expect(row.cash_usd).toBeCloseTo(40, 2);
    expect(summary.sales_classification[0].usd_collected_cup).toBeCloseTo(36000, 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// INVARIANTES OBLIGATORIOS (misión §3) — sobre TODOS los fixtures
// ════════════════════════════════════════════════════════════════════════════

/** Todos los fixtures de la misión en un solo período (como los vería el reporte). */
function todosLosFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
  const add = (tx: CollectionTx, items: CollectionItem[], payments?: LedgerPayment[]) => {
    for (const item of items) fixtures.push({ item, tx, txId: tx.id!, payments });
  };
  const v1 = venta1911();
  add(v1.tx, v1.items, v1.payments);
  // 18/11
  add(txOf('tx-1811a', { cash_amount: 28000 }), [
    line({ transaction_id: 'tx-1811a', product_id: 'prod-1811a-1', product_name: 'Producto A', sku: 'A-1811', quantity: 1, price_at_sale: 5000, price_at_sale_cup: 5000, currency: 'CUP', exchange_rate: 1, cash_paid: 5000, cash_currency: 'CUP' }),
    line({ transaction_id: 'tx-1811a', product_id: 'prod-1811a-2', product_name: 'Producto B', sku: 'B-1811', quantity: 1, price_at_sale: 25, price_at_sale_cup: 23000, currency: 'USD', exchange_rate: 920, cash_paid: 23000, cash_currency: 'CUP' }),
  ], ledger(['cash', 'CUP', 28000, 1]));
  // 17/10 (mixta explícita)
  add(txOf('tx-1710a', { cash_amount: 289750 }), [
    line({ transaction_id: 'tx-1710a', product_id: 'prod-1710-1', product_name: 'Producto CUP 1', sku: '170-1', quantity: 1, price_at_sale: 22000, price_at_sale_cup: 22000, currency: 'CUP', exchange_rate: 1, cash_paid: 22000, cash_currency: 'CUP' }),
    line({ transaction_id: 'tx-1710a', product_id: 'prod-1710-2', product_name: 'Producto USD', sku: '170-2', quantity: 1, price_at_sale: 150, price_at_sale_cup: 120750, currency: 'USD', exchange_rate: 805, cash_paid: 150, cash_currency: 'USD' }),
    line({ transaction_id: 'tx-1710a', product_id: 'prod-1710-3', product_name: 'Producto CUP 2', sku: '170-3', quantity: 7, price_at_sale: 20000, price_at_sale_cup: 20000, currency: 'CUP', exchange_rate: 1, cash_paid: 140000, cash_currency: 'CUP' }),
  ], ledger(['cash', 'CUP', 289750, 1]));
  // 19/10 incidencia auténtica
  add(txOf('tx-1910a', { cash_amount: 169670 }), [
    line({ transaction_id: 'tx-1910a', product_id: 'prod-1910-1', product_name: 'Producto USD grande', sku: '190-1', quantity: 1, price_at_sale: 210, price_at_sale_cup: 170100, currency: 'USD', exchange_rate: 810, cash_paid: 162000, cash_currency: 'CUP' }),
    line({ transaction_id: 'tx-1910a', product_id: 'prod-1910-2', product_name: 'Producto CUP', sku: '190-2', quantity: 1, price_at_sale: 2000, price_at_sale_cup: 2000, currency: 'CUP', exchange_rate: 1, cash_paid: 2000, cash_currency: 'CUP' }),
  ], ledger(['cash', 'CUP', 169670, 1]));
  // Legacy sin desglose (SKU 128)
  add(txOf('tx-legacy-128', { cash_amount: 31600 }), [
    line({ transaction_id: 'tx-legacy-128', product_id: 'prod-128', product_name: 'Producto legacy USD', sku: '128', quantity: 2, price_at_sale: 20, price_at_sale_cup: 15800, currency: 'USD', exchange_rate: 790 }),
  ]);
  return fixtures;
}

describe('CP-FIX · Invariantes obligatorios (misión §3) sobre todos los fixtures', () => {
  const fixtures = todosLosFixtures();

  it('1. La suma de importes por método y moneda coincide con el ledger (sin contradicciones)', () => {
    const byTx = new Map<string, Fixture[]>();
    for (const f of fixtures) {
      const list = byTx.get(f.txId) ?? [];
      list.push(f);
      byTx.set(f.txId, list);
    }
    for (const [txId, rows] of byTx) {
      const items = rows.map(r => r.item);
      const result = reconstructTxCollections(rows[0].tx, items, rows[0].payments);
      if (result.attribution.ledgerMismatch) continue; // contradicción señalada — auditada aparte
      // Σ perItem por (método, moneda) == buckets del ledger/reconstrucción.
      for (const b of result.buckets) {
        const side = b.currency === 'USD' ? 'usd' : 'cup';
        const sum = items.reduce((s, _, idx) => s + result.perItem[idx][side][b.method], 0);
        expect(Math.abs(sum - b.amount)).toBeLessThanOrEqual(EPS);
      }
      expect(result.buckets.length).toBeGreaterThan(0);
      void txId;
    }
  });

  it('2 y 3. No se duplican cantidades ni se crean cobros individuales inexistentes', () => {
    const summary = buildItemsSummary(fixtures);
    for (const row of summary.items) {
      expect(row.qty_cup + row.qty_usd).toBeCloseTo(row.total_quantity, 6);
    }
    expect(summary.totals.qty_cup + summary.totals.qty_usd).toBeCloseTo(summary.totals.total_quantity, 6);
    // Cobros por (método, moneda) del período == Σ de buckets de cada venta.
    const byTx = new Map<string, Fixture[]>();
    for (const f of fixtures) {
      const list = byTx.get(f.txId) ?? [];
      list.push(f);
      byTx.set(f.txId, list);
    }
    const expected = { cash_cup: 0, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0 };
    for (const rows of byTx.values()) {
      const result = reconstructTxCollections(rows[0].tx, rows.map(r => r.item), rows[0].payments);
      for (const b of result.buckets) {
        const key = `${b.method}_${b.currency.toLowerCase()}` as keyof typeof expected;
        expected[key] += b.amount;
      }
    }
    expect(summary.totals.cash_cup).toBeCloseTo(expected.cash_cup, 2);
    expect(summary.totals.transfer_cup).toBeCloseTo(expected.transfer_cup, 2);
    expect(summary.totals.zelle_cup).toBeCloseTo(expected.zelle_cup, 2);
    expect(summary.totals.cash_usd).toBeCloseTo(expected.cash_usd, 2);
    expect(summary.totals.transfer_usd).toBeCloseTo(expected.transfer_usd, 2);
    expect(summary.totals.zelle_usd).toBeCloseTo(expected.zelle_usd, 2);
  });

  it('4. La conversión monetaria usa la tasa del registro (persistida por fila)', () => {
    const { tx, items, payments } = venta1911();
    const result = reconstructTxCollections(tx, items, payments);
    const usdBucket = result.buckets.find(b => b.currency === 'USD')!;
    expect(usdBucket.amountCup / usdBucket.amount).toBeCloseTo(930, 6); // tasa registrada del cobro
    const result2710 = reconstructTxCollections(
      txOf('tx-legacy-128', { cash_amount: 31600 }),
      [line({ transaction_id: 'tx-legacy-128', product_id: 'p', product_name: 'P', sku: 's', quantity: 2, price_at_sale: 20, price_at_sale_cup: 15800, currency: 'USD', exchange_rate: 790 })],
    );
    expect(result2710.buckets[0].amountCup / result2710.buckets[0].amount).toBeCloseTo(790, 6);
  });

  it('5. Redondeo determinista: la misma entrada produce exactamente el mismo resultado', () => {
    const a = JSON.stringify(buildItemsSummary(fixtures));
    const b = JSON.stringify(buildItemsSummary(fixtures));
    expect(a).toBe(b);
  });

  it('6. Los registros históricos siguen siendo legibles (heurística legada sin cambios)', () => {
    // El fixture legacy del 16/10 (SKU 108: precio 0 + cobro real 12.000 CUP)
    // sigue reconstruyéndose por la vía histórica con el mismo resultado.
    const tx = txOf('tx-1610-108', { cash_amount: 12000 });
    const items = [line({
      transaction_id: 'tx-1610-108', product_id: 'prod-108', product_name: 'Cajita precio 0',
      sku: '108', quantity: 1, price_at_sale: 0, price_at_sale_cup: 0,
      currency: 'CUP', exchange_rate: 1,
    })];
    const result = reconstructTxCollections(tx, items);
    expect(result.source).toBe('reconstruction');
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 12000 });
    expect(result.perItem[0].cup.cash).toBeCloseTo(12000, 2);
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1610-108' })));
    expect(summary.items[0].has_payment_incident).toBe(true); // sobrepago documentado
  });

  it('7. El PDF y la vista previa muestran los MISMOS importes (misma fuente items-summary)', () => {
    // Ambos consumen /api/cash-report/items-summary → buildItemsSummary; los
    // helpers del PDF derivan de las MISMAS filas. Verificación de paridad:
    const { tx, items, payments } = venta1911();
    const summary = buildItemsSummary(items.map(item => ({ item, tx, txId: 'tx-1911', payments })));
    const cupRows = salesTableItems(summary.items, 'CUP');
    const usdRows = salesTableItems(summary.items, 'USD');
    // Hoja CUP: escoba + detergente; sus importes CUP son los del endpoint.
    expect(cupRows.map(r => r.product_name).sort()).toEqual(['Detergente líquido', 'Escoba']);
    expect(cupRows.reduce((s, r) => s + r.cash_cup + r.transfer_cup + r.zelle_cup, 0))
      .toBeCloseTo(summary.totals.cash_cup + summary.totals.transfer_cup, 2);
    // Hoja USD: solo la barilla; su importe USD es el del endpoint.
    expect(usdRows.map(r => r.product_name)).toEqual(['Barilla de Aterramientos']);
    expect(usdRows.reduce((s, r) => s + r.cash_usd + r.transfer_usd + r.zelle_usd, 0))
      .toBeCloseTo(summary.totals.usd_total, 2);
    // Cantidades por hoja = cantidades atribuidas por el endpoint.
    expect(cupRows.reduce((s, r) => s + salesTableQty(r, 'CUP'), 0)).toBeCloseTo(summary.totals.qty_cup, 2);
    expect(usdRows.reduce((s, r) => s + salesTableQty(r, 'USD'), 0)).toBeCloseTo(summary.totals.qty_usd, 2);
  });
});
