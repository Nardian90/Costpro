/**
 * Pruebas del módulo collection-currency — INCIDENTE 2026-10-16 ENERVIDA.
 *
 * Fixture: las 10 ventas reales del 16/10/2026 (store 5e6fe821-…, created_at
 * 2026-10-16T16:00Z) con sus transaction_items reales (ver
 * docs/audits/INCIDENTE_REPORTE_ENTREGA_ENERVIDA_MONEDAS_SKU108_2026-10-16.md
 * y docs/audits/REGISTRO_OPERACIONES_2026-10-16_ENERVIDA.md).
 *
 * Cubre los casos de la misión (§7): importes de referencia, SKU 108 ≠ 0,
 * SKU 128 con componentes CUP+USD, USD no desaparece, sin duplicación de
 * pagos mixtos, otros días sin cambios y conservación sin doble conteo.
 */
import { describe, it, expect } from 'vitest';
import {
  reconstructTxCollections,
  accumulateSalesSplit,
  buildSalesGroups,
  buildItemsSummary,
  lineCupOf,
  lineUsdOf,
  type CollectionItem,
  type CollectionTx,
} from '@/lib/cash-report/collection-currency';

// ── Fixture real del 16/10/2026 (subset relevante + totales completos) ──────

const ITEM_128_x2: CollectionItem = {
  transaction_id: 'd7c8ef72-857d-4072-90eb-56959c089e49',
  product_id: '2e7b4157-99a4-4b81-b135-33ff2c983d13',
  product_name: 'Brecker 63 AMP Corriente alterna',
  sku: '128',
  quantity: 2,
  price_at_sale: 20,
  price_at_sale_cup: 15800,
  currency: 'USD',
  exchange_rate: 790,
  cash_paid: null, cash_currency: null,
  transfer_paid: null, transfer_currency: null,
  zelle_paid: null, zelle_currency: null,
};
const ITEM_128_x1: CollectionItem = {
  ...ITEM_128_x2,
  transaction_id: '8ab7becf-8598-4779-b3e4-dbee2b67ee98',
  quantity: 1,
};
const ITEM_108: CollectionItem = {
  transaction_id: '1df5d727-e6ee-402a-aa51-6c44a0768c5a',
  product_id: 'c2f4df7e-045a-4990-a34a-d211387e3924',
  product_name: 'Cajita Breckera sencilla gris',
  sku: '108',
  quantity: 1,
  price_at_sale: 0,
  price_at_sale_cup: 0,
  currency: 'CUP',
  exchange_rate: 1,
  cash_paid: null, cash_currency: null,
  transfer_paid: null, transfer_currency: null,
  zelle_paid: null, zelle_currency: null,
};

/** CUP-only cash sale (helper): precio CUP histórico, cobro cash CUP. */
const cupCash = (txId: string, pid: string, sku: string, name: string, qty: number, unit: number, cash: number): { item: CollectionItem; tx: CollectionTx } => ({
  item: {
    transaction_id: txId, product_id: pid, product_name: name, sku,
    quantity: qty, price_at_sale: unit, price_at_sale_cup: unit,
    currency: 'CUP', exchange_rate: 1,
    cash_paid: null, cash_currency: null, transfer_paid: null, transfer_currency: null, zelle_paid: null, zelle_currency: null,
  },
  tx: { id: txId, cash_amount: cash, transfer_amount: 0, zelle_amount: 0, sale_currency: 'CUP', sale_exchange_rate: 1 },
});

const txOf = (id: string, cash: number, transfer = 0, zelle = 0, saleCurrency = 'CUP', rate = 1): CollectionTx =>
  ({ id, cash_amount: cash, transfer_amount: transfer, zelle_amount: zelle, sale_currency: saleCurrency, sale_exchange_rate: rate });

/** Construye el fixture completo del día (10 ventas; los importes son los reales). */
function fixture1610(): Array<{ item: CollectionItem; tx: CollectionTx; txId: string }> {
  const rows: Array<{ item: CollectionItem; tx: CollectionTx; txId: string }> = [];
  // fila 13: SKU 141 x4 — 80.000 CUP cash
  rows.push({ ...cupCash('a1622a80', 'pid-141', '141', 'Cemento TBV 50 Kg', 4, 20000, 80000), txId: 'a1622a80' });
  // fila 19: SKU 157 x1 — 2.500 CUP cash
  rows.push({ ...cupCash('a8621e02', 'pid-157', '157', 'Royal Cole', 1, 2500, 2500), txId: 'a8621e02' });
  // fila 12: SKU 15 x1 — 10.000 CUP cash
  rows.push({ ...cupCash('be8ab140', 'pid-15', '15', 'Cemento Cola', 1, 10000, 10000), txId: 'be8ab140' });
  // fila 18: SKU 141 x1 — 20.000 CUP cash
  rows.push({ ...cupCash('9a678987', 'pid-141', '141', 'Cemento TBV 50 Kg', 1, 20000, 20000), txId: '9a678987' });
  // fila 10: SKU 128 x2 — cobro 40 USD cash (pool 31.600 CUP, conversión exacta 790)
  rows.push({ item: ITEM_128_x2, tx: txOf('d7c8ef72', 31600), txId: 'd7c8ef72' });
  // fila 17: SKU 108 x1 — total histórico 0, cobro real 12.000 CUP (sobrepago documentado)
  rows.push({ item: ITEM_108, tx: txOf('1df5d727', 12000), txId: '1df5d727' });
  // fila 9: SKU 48 x25 — 6.250 CUP cash
  rows.push({ ...cupCash('d5d188e0', 'pid-48', '48', 'Nudo de media', 25, 250, 6250), txId: 'd5d188e0' });
  // fila 16: SKU 84 x1 — 6.500 CUP cash
  rows.push({ ...cupCash('89771be2', 'pid-84', '84', 'Conector XT60', 1, 6500, 6500), txId: '89771be2' });
  // fila 8: SKU 158 x1 — 800 CUP transfer
  rows.push({ ...cupCash('725b0f96', 'pid-158', '158', 'Detergente liquido', 1, 800, 0), txId: '725b0f96' });
  rows[rows.length - 1].tx = txOf('725b0f96', 0, 800);
  // fila 7: SKU 158 x1 — 800 CUP transfer
  rows.push({ item: { ...cupCash('2e1b7f1d', 'pid-158', '158', 'Detergente liquido', 1, 800, 0).item }, tx: txOf('2e1b7f1d', 0, 800), txId: '2e1b7f1d' });
  // fila 14: SKU 128 x1 — cobro 16.000 CUP cash (total 15.800 + sobrepago 200)
  rows.push({ item: ITEM_128_x1, tx: txOf('8ab7becf', 16000), txId: '8ab7becf' });
  // fila 3: SKU 158 x1 — 800 CUP transfer
  rows.push({ item: { ...cupCash('fa1943c6', 'pid-158', '158', 'Detergente liquido', 1, 800, 0).item }, tx: txOf('fa1943c6', 0, 800), txId: 'fa1943c6' });
  // fila 15: SKU 113 x1 — 100 CUP cash
  rows.push({ ...cupCash('f44d7775', 'pid-113', '113', 'Goma Termo Retractil', 1, 100, 100), txId: 'f44d7775' });
  return rows;
}

const EPS = 0.01;

describe('collection-currency — reconstrucción del 16/10/2026 (misión)', () => {
  it('1-5,9. La tabla por producto reproduce los importes de referencia', () => {
    const { items, totals } = buildItemsSummary(fixture1610());
    const bySku = new Map(items.map(i => [i.sku, i]));

    expect(totals.total_quantity).toBe(41);
    expect(totals.cash_cup).toBeCloseTo(153350, 2);
    expect(totals.transfer_cup).toBeCloseTo(2400, 2);
    expect(totals.usd_total).toBeCloseTo(40, 2);

    expect(bySku.get('108')!.cash_cup).toBeCloseTo(12000, 2);
    expect(bySku.get('108')!.total_quantity).toBe(1);
    const s128 = bySku.get('128')!;
    expect(s128.total_quantity).toBe(3);
    expect(s128.cash_cup).toBeCloseTo(16000, 2);
    expect(s128.usd_total).toBeCloseTo(40, 2);
    expect(s128.has_payment_incident).toBe(true);
    expect(bySku.get('158')!.transfer_cup).toBeCloseTo(2400, 2);
    expect(bySku.get('158')!.total_quantity).toBe(3);
    expect(bySku.get('141')!.cash_cup).toBeCloseTo(100000, 2);
  });

  it('6. SKU 108 nunca queda en cero cuando la operación válida cobró 12.000 CUP', () => {
    const result = reconstructTxCollections(txOf('1df5d727', 12000), [ITEM_108]);
    expect(result.perItem[0].cup.cash).toBeCloseTo(12000, 2);
    const { items } = buildItemsSummary([{ item: ITEM_108, tx: txOf('1df5d727', 12000), txId: '1df5d727' }]);
    expect(items[0].cash_cup).toBeCloseTo(12000, 2);
    expect(items[0].total_cup).toBe(0); // el total histórico (precio 0) NO se altera
    expect(items[0].has_payment_incident).toBe(true);
  });

  it('7. SKU 128 conserva sus componentes reales: 16.000 CUP efectivo + 40 USD', () => {
    const r10 = reconstructTxCollections(txOf('d7c8ef72', 31600), [ITEM_128_x2]);
    expect(r10.buckets).toHaveLength(1);
    expect(r10.buckets[0]).toMatchObject({ method: 'cash', currency: 'USD', amount: 40, amountCup: 31600 });
    expect(r10.perItem[0].usd.cash).toBeCloseTo(40, 2);
    expect(r10.perItem[0].cup.cash).toBeCloseTo(0, 2);

    const r14 = reconstructTxCollections(txOf('8ab7becf', 16000), [ITEM_128_x1]);
    expect(r14.buckets).toHaveLength(1);
    expect(r14.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 16000 });
    expect(r14.perItem[0].cup.cash).toBeCloseTo(16000, 2);
    expect(r14.perItem[0].usd.cash).toBeCloseTo(0, 2);
  });

  it('4. El split por moneda NUNCA mezcla CUP y USD', () => {
    const acc: Record<string, { cash: number; transfer: number; zelle: number; mixedUnsplit: number; total: number }> = {};
    for (const { item, tx } of fixture1610()) {
      accumulateSalesSplit(acc, reconstructTxCollections(tx, [item]));
    }
    expect(acc['CUP'].cash).toBeCloseTo(153350, 2);
    expect(acc['CUP'].transfer).toBeCloseTo(2400, 2);
    expect(acc['USD'].cash).toBeCloseTo(40, 2);
    expect(acc['USD'].transfer).toBeCloseTo(0, 2);
  });

  it('Los grupos `sales` son coherentes con la reconstrucción (método × moneda)', () => {
    const results = fixture1610().map(({ item, tx }) => ({ tx, result: reconstructTxCollections(tx, [item]) }));
    const groups = buildSalesGroups(results);
    const cashCup = groups.find(g => g.payment_method === 'cash' && g.currency === 'CUP')!;
    const cashUsd = groups.find(g => g.payment_method === 'cash' && g.currency === 'USD')!;
    const trCup = groups.find(g => g.payment_method === 'transfer' && g.currency === 'CUP')!;
    expect(cashCup.total).toBeCloseTo(153350, 2);
    expect(cashCup.transaction_count).toBe(9);
    expect(cashUsd.total).toBeCloseTo(40, 2);
    expect(cashUsd.transaction_count).toBe(1);
    expect(cashUsd.total_cup).toBeCloseTo(31600, 2);
    expect(trCup.total).toBeCloseTo(2400, 2);
    expect(trCup.transaction_count).toBe(3);
  });

  it('Sin doble conteo: la suma por ítem coincide con los buckets de la transacción', () => {
    const rows = fixture1610();
    const byTx = new Map<string, { tx: CollectionTx; items: CollectionItem[] }>();
    for (const { item, tx, txId } of rows) {
      const g = byTx.get(txId) ?? { tx, items: [] };
      g.items.push(item);
      byTx.set(txId, g);
    }
    for (const { tx, items } of byTx.values()) {
      const { buckets, perItem } = reconstructTxCollections(tx, items);
      for (const b of buckets) {
        const sum = perItem.reduce((s, pi) =>
          s + (b.currency === 'USD' ? pi.usd[b.method] : pi.cup[b.method]), 0);
        expect(sum).toBeCloseTo(b.amount, 2);
      }
      // además: Σ buckets CUP + Σ equivalentes == pools de la transacción
      const pool = Number(tx.cash_amount || 0) + Number(tx.transfer_amount || 0) + Number(tx.zelle_amount || 0);
      const equiv = buckets.reduce((s, b) => s + b.amountCup, 0);
      expect(equiv).toBeCloseTo(pool, 2);
    }
  });

  it('14. Un día sin ventas USD ni líneas cero (15/10) conserva exactamente los pools CUP', () => {
    const rows = [
      { ...cupCash('t1', 'p141', '141', 'Cemento TBV 50 Kg', 1, 20000, 20000), txId: 't1' },
      { ...cupCash('t2', 'p47', '47', 'Cuña madera', 1, 8000, 8000), txId: 't2' },
      { ...cupCash('t3', 'p142', '142', 'Grifería', 2, 2000, 4000), txId: 't3' },
    ];
    const acc: Record<string, { cash: number; transfer: number; zelle: number; mixedUnsplit: number; total: number }> = {};
    const { items, totals } = buildItemsSummary(rows);
    for (const { tx } of rows) accumulateSalesSplit(acc, reconstructTxCollections(tx, rows.filter(r => r.txId === tx.id).map(r => r.item)));
    expect(acc['CUP'].cash).toBeCloseTo(32000, 2);
    expect(acc['USD']).toBeUndefined();
    expect(totals.cash_cup).toBeCloseTo(32000, 2);
    expect(totals.usd_total).toBe(0);
    expect(items.every(i => !i.has_payment_incident)).toBe(true);
  });

  it('10/11. Solo agrega las filas entregadas (aislamiento por tienda/periodo en la consulta) y un rango distinto produce otros resultados', () => {
    const rows = fixture1610().filter(r => r.txId === 'd7c8ef72'); // otra «consulta»
    const { totals } = buildItemsSummary(rows);
    expect(totals.total_quantity).toBe(2);
    expect(totals.usd_total).toBeCloseTo(40, 2);
    expect(totals.cash_cup).toBe(0);
  });
});

describe('collection-currency — casos generales (pagos mixtos y V2)', () => {
  it('12. Venta V2 con filas de pago explícitas (cash USD + transfer CUP) conserva ambos componentes', () => {
    const item: CollectionItem = {
      transaction_id: 'v2', product_id: 'p1', sku: 'X', product_name: 'X',
      quantity: 1, price_at_sale: 30, price_at_sale_cup: 23700, currency: 'USD', exchange_rate: 790,
      cash_paid: 20, cash_currency: 'USD',
      transfer_paid: 7900, transfer_currency: 'CUP',
      zelle_paid: 0, zelle_currency: 'USD',
    };
    // pools canónicos: cash 20×790=15.800 + transfer 7.900 = 23.700
    const result = reconstructTxCollections(txOf('v2', 15800, 7900), [item]);
    expect(result.perItem[0].usd.cash).toBeCloseTo(20, 2);
    expect(result.perItem[0].cup.transfer).toBeCloseTo(7900, 2);
    const { items } = buildItemsSummary([{ item, tx: txOf('v2', 15800, 7900), txId: 'v2' }]);
    expect(items[0].cash_usd).toBeCloseTo(20, 2);
    expect(items[0].cash_cup).toBe(0);
    expect(items[0].transfer_cup).toBeCloseTo(7900, 2);
    expect(items[0].usd_total).toBeCloseTo(20, 2);
  });

  it('12b. Pago mixto multi-método no se duplica al agrupar ítems y pagos', () => {
    const i1: CollectionItem = {
      transaction_id: 'm1', product_id: 'pa', sku: 'A', product_name: 'A',
      quantity: 1, price_at_sale: 10000, price_at_sale_cup: 10000, currency: 'CUP', exchange_rate: 1,
      cash_paid: 4000, cash_currency: 'CUP', transfer_paid: 6000, transfer_currency: 'CUP',
      zelle_paid: 0, zelle_currency: 'USD',
    };
    const result = reconstructTxCollections(txOf('m1', 4000, 6000), [i1]);
    expect(result.perItem[0].cup.cash).toBeCloseTo(4000, 2);
    expect(result.perItem[0].cup.transfer).toBeCloseTo(6000, 2);
    // sin buckets legacy adicionales: todo vino de filas explícitas
    expect(result.buckets.filter(b => b.origin !== 'explicit-row')).toHaveLength(0);
  });

  it('Zelle legacy (pool CUP canónico) se clasifica USD con la tasa del contexto', () => {
    const item: CollectionItem = {
      transaction_id: 'z1', product_id: 'pz', sku: 'Z', product_name: 'Z',
      quantity: 1, price_at_sale: 210, price_at_sale_cup: 165900, currency: 'USD', exchange_rate: 790,
      cash_paid: null, cash_currency: null, transfer_paid: null, transfer_currency: null, zelle_paid: null, zelle_currency: null,
    };
    const result = reconstructTxCollections(txOf('z1', 0, 0, 165900, 'USD', 790), [item]);
    expect(result.buckets[0]).toMatchObject({ method: 'zelle', currency: 'USD', amount: 210, amountCup: 165900 });
  });

  it('Zelle sin tasa válida NO se convierte: permanece en CUP (sin inventar importes)', () => {
    const item: CollectionItem = {
      transaction_id: 'z2', product_id: 'pz', sku: 'Z', product_name: 'Z',
      quantity: 1, price_at_sale: 5000, price_at_sale_cup: 5000, currency: 'CUP', exchange_rate: 1,
      cash_paid: null, cash_currency: null, transfer_paid: null, transfer_currency: null, zelle_paid: null, zelle_currency: null,
    };
    const result = reconstructTxCollections(txOf('z2', 0, 0, 5000, 'CUP', 1), [item]);
    expect(result.buckets[0]).toMatchObject({ method: 'zelle', currency: 'CUP', amount: 5000 });
  });

  it('Cobro USD con sobreprecio documentado en CUP se clasifica CUP (residual ≠ conversión exacta)', () => {
    // mismo producto 20 USD ×790 = 15.800 pero el cliente entregó 32.390 CUP (41 USD) →
    // el pool NO coincide con la conversión exacta → CUP 32.390 (sobrepago documentado)
    const item: CollectionItem = { ...ITEM_128_x1, quantity: 1 };
    const result = reconstructTxCollections(txOf('x1', 32390), [item]);
    expect(result.buckets[0]).toMatchObject({ method: 'cash', currency: 'CUP', amount: 32390 });
  });

  it('Transacción sin ítems: los pools se conservan en CUP canónico (defensiva)', () => {
    const result = reconstructTxCollections(txOf('empty', 1000, 500), []);
    expect(result.perItem).toHaveLength(0);
    expect(result.buckets.find(b => b.method === 'cash')).toMatchObject({ currency: 'CUP', amount: 1000 });
    expect(result.buckets.find(b => b.method === 'transfer')).toMatchObject({ currency: 'CUP', amount: 500 });
  });

  it('Reparto proporcional en venta multi-ítem y partes iguales cuando Σlínea=0', () => {
    const a: CollectionItem = { ...ITEM_108, product_id: 'pa', sku: 'A', transaction_id: 'mm', quantity: 1, price_at_sale_cup: 0, price_at_sale: 0, currency: 'CUP' };
    const b: CollectionItem = { ...ITEM_108, product_id: 'pb', sku: 'B', transaction_id: 'mm', quantity: 1, price_at_sale_cup: 0, price_at_sale: 0, currency: 'CUP' };
    const rZero = reconstructTxCollections(txOf('mm', 12000), [a, b]);
    expect(rZero.perItem[0].cup.cash).toBeCloseTo(6000, 2);
    expect(rZero.perItem[1].cup.cash).toBeCloseTo(6000, 2);

    const c1: CollectionItem = { ...cupCash('mp', 'p1', '1', 'A', 1, 1000, 0).item, transaction_id: 'mp' };
    const c2: CollectionItem = { ...cupCash('mp', 'p2', '2', 'B', 3, 1000, 0).item, transaction_id: 'mp' };
    const rProp = reconstructTxCollections(txOf('mp', 4000), [c1, c2]);
    expect(rProp.perItem[0].cup.cash).toBeCloseTo(1000, 2);   // 1/4
    expect(rProp.perItem[1].cup.cash).toBeCloseTo(3000, 2);   // 3/4
  });

  it('lineUsdOf: guarda de consistencia unitaria (precio×tasa vs price_at_sale_cup)', () => {
    expect(lineUsdOf(ITEM_128_x2)).toBeCloseTo(40, 2); // 20 USD ×2 — consistente con 15.800×2? no: unitario 20×790=15.800 ✓
    expect(lineUsdOf(ITEM_108)).toBe(0); // línea CUP
    const inconsistent: CollectionItem = { ...ITEM_128_x1, price_at_sale: 25, price_at_sale_cup: 15800, exchange_rate: 790 };
    // precio inconsistente (25×790=19.750 ≠ 15.800) → se deriva del canónico: 15.800/790=20
    expect(lineUsdOf(inconsistent)).toBeCloseTo(20, 2);
  });

  it('lineCupOf mantiene la fórmula histórica (unitario CUP × cantidad)', () => {
    expect(lineCupOf(ITEM_128_x2)).toBeCloseTo(31600, 2);
    expect(lineCupOf(ITEM_108)).toBe(0);
    expect(lineCupOf(cupCash('x', 'p', '1', 'A', 3, 500, 1500).item)).toBe(1500);
  });
});
