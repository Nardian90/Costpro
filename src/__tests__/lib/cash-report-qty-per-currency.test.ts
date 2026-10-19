/**
 * AUDITORÍA 2026-10-19 — «Entrega en tienda» (EnerVida · 16/10/2026):
 * cantidad ATRIBUIDA por moneda de cobro (qty_cup/qty_usd) — defecto B.
 *
 * La hoja CUP del PDF debe mostrar la cantidad cobrada en CUP y la hoja USD la
 * cobrada en USD, sin atribuir la cantidad global a una sola moneda ni
 * duplicarla entre hojas (invariante: qty_cup + qty_usd = total_quantity).
 *
 * Escenarios obligatorios (§7 de la auditoría):
 *   1. Producto vendido exclusivamente en CUP.
 *   2. Producto vendido exclusivamente en USD.
 *   3. Producto vendido en CUP y USD el mismo día (SKU 128 real: 1u CUP + 2u USD).
 *   4. Mismo producto con efectivo y transferencia en CUP.
 *   5. Mismo producto con efectivo y Zelle en USD.
 *   6. Producto con varias líneas de venta que deben agruparse.
 *   7. Ventas de distintos documentos que no deben duplicarse.
 *   8. Devoluciones/anulaciones: fuera del alcance de items-summary (regla vigente).
 *   9. Aislamiento por tienda/fecha: la consulta entrega solo las filas del período.
 *  10. Días sin operaciones en una de las monedas.
 *  11. Consistencia entre el detalle y los totales.
 *  12. Regresión: los importes de referencia del 16/10 no cambian.
 */
import { describe, it, expect } from 'vitest';
import {
  buildItemsSummary,
  reconstructTxCollections,
  type CollectionItem,
  type CollectionTx,
  type ProductCollectionRow,
} from '@/lib/cash-report/collection-currency';
import {
  salesTableColumns,
  salesTableItems,
  salesTableQty,
} from '@/components/views/terminal/views/cash/cash-report-pdf';

const EPS = 0.01;

// ── Constructores de fixture ────────────────────────────────────────────────

const line = (over: Partial<CollectionItem>): CollectionItem => ({
  transaction_id: 't1', product_id: 'p1', product_name: 'P', sku: '1',
  quantity: 1, price_at_sale: 100, price_at_sale_cup: 100,
  currency: 'CUP', exchange_rate: 1,
  cash_paid: null, cash_currency: null,
  transfer_paid: null, transfer_currency: null,
  zelle_paid: null, zelle_currency: null,
  ...over,
});

const txOf = (id: string, cash = 0, transfer = 0, zelle = 0, saleCurrency = 'CUP', rate = 1): CollectionTx =>
  ({ id, cash_amount: cash, transfer_amount: transfer, zelle_amount: zelle, sale_currency: saleCurrency, sale_exchange_rate: rate });

/** El caso REAL del 16/10/2026 (SKU 128 «Brecker 63 AMP»): 2 líneas, 2 tx. */
function sku128RealRows(): Array<{ item: CollectionItem; tx: CollectionTx; txId: string }> {
  return [
    {
      // fila 10: 2 unidades × 20 USD — pool 31.600 CUP = 40 USD × 790 exacto → cobro USD
      item: line({
        transaction_id: 'd7c8ef72', product_id: 'pid-128', sku: '128', product_name: 'Brecker 63 AMP Corriente alterna',
        quantity: 2, price_at_sale: 20, price_at_sale_cup: 15800, currency: 'USD', exchange_rate: 790,
      }),
      tx: txOf('d7c8ef72', 31600), txId: 'd7c8ef72',
    },
    {
      // fila 14: 1 unidad × 20 USD = 15.800 CUP — cobro efectivo 16.000 CUP (+200 incidencia) → cobro CUP
      item: line({
        transaction_id: '8ab7becf', product_id: 'pid-128', sku: '128', product_name: 'Brecker 63 AMP Corriente alterna',
        quantity: 1, price_at_sale: 20, price_at_sale_cup: 15800, currency: 'USD', exchange_rate: 790,
      }),
      tx: txOf('8ab7becf', 16000), txId: '8ab7becf',
    },
  ];
}

describe('AUDITORÍA 2026-10-19 · cantidad por moneda (qty_cup/qty_usd) — capa de datos', () => {
  it('1. Producto vendido exclusivamente en CUP: qty_cup = total, qty_usd = 0', () => {
    const { items } = buildItemsSummary([
      { item: line({ quantity: 4, price_at_sale: 20000, price_at_sale_cup: 20000 }), tx: txOf('t1', 80000), txId: 't1' },
    ]);
    expect(items[0].qty_cup).toBeCloseTo(4, 2);
    expect(items[0].qty_usd).toBe(0);
    expect(items[0].total_quantity).toBe(4);
  });

  it('2. Producto vendido exclusivamente en USD (conversión exacta): qty_usd = total, qty_cup = 0', () => {
    const { items } = buildItemsSummary([
      { item: line({ quantity: 3, price_at_sale: 20, price_at_sale_cup: 15800, currency: 'USD', exchange_rate: 790 }), tx: txOf('t1', 47400), txId: 't1' },
    ]);
    expect(items[0].qty_usd).toBeCloseTo(3, 2);
    expect(items[0].qty_cup).toBe(0);
    expect(items[0].total_quantity).toBe(3);
  });

  it('3. CASO REAL — SKU 128 del 16/10/2026: 1 unidad cobrada en CUP + 2 unidades cobradas en USD', () => {
    const { items, totals } = buildItemsSummary(sku128RealRows());
    const s128 = items.find(i => i.sku === '128')!;
    // Distribución explícita exigida por el negocio: 1u CUP (16.000 CUP) + 2u USD (40 USD)
    expect(s128.qty_cup).toBeCloseTo(1, 2);
    expect(s128.qty_usd).toBeCloseTo(2, 2);
    expect(s128.total_quantity).toBe(3); // física — NO se duplica
    // Los importes de referencia del incidente 2026-10-16 se conservan intactos
    expect(s128.cash_cup).toBeCloseTo(16000, 2);
    expect(s128.usd_total).toBeCloseTo(40, 2);
    expect(s128.has_payment_incident).toBe(true);
    expect(totals.qty_cup).toBeCloseTo(1, 2);
    expect(totals.qty_usd).toBeCloseTo(2, 2);
    expect(totals.total_quantity).toBe(3);
  });

  it('4. Mismo producto con efectivo y transferencia en CUP (V2 con filas explícitas): cantidad íntegra en CUP, sin duplicar', () => {
    const item = line({
      quantity: 2, cash_paid: 4000, cash_currency: 'CUP',
      transfer_paid: 6000, transfer_currency: 'CUP',
    });
    const { items } = buildItemsSummary([{ item, tx: txOf('t1', 4000, 6000), txId: 't1' }]);
    expect(items[0].qty_cup).toBeCloseTo(2, 2); // 2 unidades UNA sola vez
    expect(items[0].qty_usd).toBe(0);
    expect(items[0].total_quantity).toBe(2);
  });

  it('5. Mismo producto con efectivo y Zelle en USD (V2 explícitas): cantidad íntegra en USD', () => {
    const item = line({
      quantity: 5, price_at_sale: 20, price_at_sale_cup: 15800, currency: 'USD', exchange_rate: 790,
      cash_paid: 60, cash_currency: 'USD', zelle_paid: 40, zelle_currency: 'USD',
    });
    const { items } = buildItemsSummary([{ item, tx: txOf('t1', 47400, 0, 31600, 'USD', 790), txId: 't1' }]);
    expect(items[0].qty_usd).toBeCloseTo(5, 2);
    expect(items[0].qty_cup).toBe(0);
    expect(items[0].total_quantity).toBe(5);
  });

  it('6. Varias líneas del mismo producto se agrupan (141: 4+1 → 5)', () => {
    const { items } = buildItemsSummary([
      { item: line({ transaction_id: 'a', product_id: 'pid-141', sku: '141', quantity: 4, price_at_sale: 20000, price_at_sale_cup: 20000 }), tx: txOf('a', 80000), txId: 'a' },
      { item: line({ transaction_id: 'b', product_id: 'pid-141', sku: '141', quantity: 1, price_at_sale: 20000, price_at_sale_cup: 20000 }), tx: txOf('b', 20000), txId: 'b' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].total_quantity).toBe(5);
    expect(items[0].qty_cup).toBeCloseTo(5, 2);
    expect(items[0].transactions_count).toBe(2);
  });

  it('7. Ventas de distintos documentos NO duplican cantidades ni conteo de transacciones', () => {
    const rows = sku128RealRows(); // 2 documentos, 2 líneas distintas (1u + 2u)
    const { items } = buildItemsSummary(rows);
    const s128 = items.find(i => i.sku === '128')!;
    expect(s128.transactions_count).toBe(2); // Set de txIds — sin inflar por JOIN
    expect(s128.total_quantity).toBe(3);     // 1 + 2 exacto — sin multiplicar
    // Reconstrucción interna: la suma por ítem reproduce los buckets (sin doble conteo)
    const r10 = reconstructTxCollections(rows[0].tx, [rows[0].item]);
    expect(r10.perItem[0].usd.cash).toBeCloseTo(40, 2);
    const r14 = reconstructTxCollections(rows[1].tx, [rows[1].item]);
    expect(r14.perItem[0].cup.cash).toBeCloseTo(16000, 2);
  });

  it('8. Devoluciones/anulaciones: items-summary solo agrega transaction_items completados (regla vigente) — las devoluciones son documentos aparte y NUNCA restan cantidades aquí', () => {
    // La consulta del endpoint excluye status='voided' y las devoluciones no
    // generan transaction_items: la tabla del reporte refleja SOLO ventas.
    // Una línea devuelta sigue siendo una línea vendida del día (la devolución
    // se refleja en el contra-asiento financiero, no en esta tabla).
    const { items } = buildItemsSummary(sku128RealRows());
    expect(items[0].total_quantity).toBe(3);
    expect(items[0].qty_cup).toBeCloseTo(1, 2);
    expect(items[0].qty_usd).toBeCloseTo(2, 2);
  });

  it('9. Aislamiento por tienda/fecha: el agregado SOLO ve las filas que la consulta entregó', () => {
    const rows = sku128RealRows(); // «consulta» de EnerVida 16/10
    const otra = { // fila de OTRA tienda/fecha que la consulta NUNCA entrega
      item: line({ transaction_id: 'z9', product_id: 'pid-141', sku: '141', quantity: 10, price_at_sale: 20000, price_at_sale_cup: 20000 }),
      tx: txOf('z9', 200000), txId: 'z9',
    };
    const { totals } = buildItemsSummary(rows);
    const { totals: withOther } = buildItemsSummary([...rows, otra]);
    expect(totals.total_quantity).toBe(3);
    expect(withOther.total_quantity).toBe(13); // solo si la consulta la incluye
  });

  it('10. Días sin operaciones en una de las monedas: la otra moneda queda en 0 (sin inventar)', () => {
    const soloCup = buildItemsSummary([
      { item: line({ quantity: 3, price_at_sale: 500, price_at_sale_cup: 500 }), tx: txOf('t1', 1500), txId: 't1' },
    ]);
    expect(soloCup.totals.qty_cup).toBeCloseTo(3, 2);
    expect(soloCup.totals.qty_usd).toBe(0);
    const soloUsd = buildItemsSummary([
      { item: line({ quantity: 2, price_at_sale: 20, price_at_sale_cup: 15800, currency: 'USD', exchange_rate: 790 }), tx: txOf('t2', 31600), txId: 't2' },
    ]);
    expect(soloUsd.totals.qty_cup).toBe(0);
    expect(soloUsd.totals.qty_usd).toBeCloseTo(2, 2);
  });

  it('11. Consistencia detalle↔totales e invariante qty_cup + qty_usd = total_quantity', () => {
    const { items, totals } = buildItemsSummary([
      ...sku128RealRows(),
      { item: line({ transaction_id: 'a', product_id: 'pid-141', sku: '141', quantity: 4, price_at_sale: 20000, price_at_sale_cup: 20000 }), tx: txOf('a', 80000), txId: 'a' },
      { item: line({ transaction_id: 'c', product_id: 'pid-15', sku: '15', quantity: 1, price_at_sale: 10000, price_at_sale_cup: 10000 }), tx: txOf('c', 10000), txId: 'c' },
    ]);
    for (const i of items) {
      expect(i.qty_cup + i.qty_usd).toBeCloseTo(i.total_quantity, 6);
    }
    expect(items.reduce((s, i) => s + i.qty_cup, 0)).toBeCloseTo(totals.qty_cup, 6);
    expect(items.reduce((s, i) => s + i.qty_usd, 0)).toBeCloseTo(totals.qty_usd, 6);
    expect(totals.qty_cup + totals.qty_usd).toBeCloseTo(totals.total_quantity, 6);
  });

  it('12. Regresión del 16/10/2026 (fixture completo de la misión): importes de referencia intactos + cantidades por moneda', () => {
    // Fixture real completo (13 ventas — ver cash-report-collection-currency.test.ts)
    const rows: Array<{ item: CollectionItem; tx: CollectionTx; txId: string }> = [
      ...sku128RealRows(),
      { item: line({ transaction_id: 'a', product_id: 'pid-141', sku: '141', product_name: 'Cemento TBV 50 Kg', quantity: 4, price_at_sale: 20000, price_at_sale_cup: 20000 }), tx: txOf('a', 80000), txId: 'a' },
      { item: line({ transaction_id: 'b', product_id: 'pid-141', sku: '141', product_name: 'Cemento TBV 50 Kg', quantity: 1, price_at_sale: 20000, price_at_sale_cup: 20000 }), tx: txOf('b', 20000), txId: 'b' },
      { item: line({ transaction_id: 'c', product_id: 'pid-15', sku: '15', product_name: 'Cemento Cola', quantity: 1, price_at_sale: 10000, price_at_sale_cup: 10000 }), tx: txOf('c', 10000), txId: 'c' },
      { item: line({ transaction_id: 'd', product_id: 'pid-84', sku: '84', product_name: 'Conector XT60', quantity: 1, price_at_sale: 6500, price_at_sale_cup: 6500 }), tx: txOf('d', 6500), txId: 'd' },
      { item: line({ transaction_id: 'e', product_id: 'pid-48', sku: '48', product_name: 'Nudo de media', quantity: 25, price_at_sale: 250, price_at_sale_cup: 250 }), tx: txOf('e', 6250), txId: 'e' },
      { item: line({ transaction_id: 'f', product_id: 'pid-157', sku: '157', product_name: 'Royal Cole', quantity: 1, price_at_sale: 2500, price_at_sale_cup: 2500 }), tx: txOf('f', 2500), txId: 'f' },
      { item: line({ transaction_id: 'g', product_id: 'pid-158', sku: '158', product_name: 'Detergente liquido', quantity: 1, price_at_sale: 800, price_at_sale_cup: 800 }), tx: txOf('g', 0, 800), txId: 'g' },
      { item: line({ transaction_id: 'h', product_id: 'pid-158', sku: '158', product_name: 'Detergente liquido', quantity: 1, price_at_sale: 800, price_at_sale_cup: 800 }), tx: txOf('h', 0, 800), txId: 'h' },
      { item: line({ transaction_id: 'i', product_id: 'pid-158', sku: '158', product_name: 'Detergente liquido', quantity: 1, price_at_sale: 800, price_at_sale_cup: 800 }), tx: txOf('i', 0, 800), txId: 'i' },
      { item: line({ transaction_id: 'j', product_id: 'pid-113', sku: '113', product_name: 'Goma Termo Retractil', quantity: 1, price_at_sale: 100, price_at_sale_cup: 100 }), tx: txOf('j', 100), txId: 'j' },
      { item: line({ transaction_id: 'k', product_id: 'pid-108', sku: '108', product_name: 'Cajita Breckera sencilla gris', quantity: 1, price_at_sale: 0, price_at_sale_cup: 0 }), tx: txOf('k', 12000), txId: 'k' },
    ];
    const { items, totals } = buildItemsSummary(rows);
    // Importes de referencia (los mismos que certificó el incidente 2026-10-16)
    expect(totals.cash_cup).toBeCloseTo(153350, 2);
    expect(totals.transfer_cup).toBeCloseTo(2400, 2);
    expect(totals.usd_total).toBeCloseTo(40, 2);
    expect(totals.total_quantity).toBe(41);
    // NUEVO: cantidades por moneda — 41 físicas = 39 CUP + 2 USD (las 2 USD son el 128)
    expect(totals.qty_cup).toBeCloseTo(39, 2);
    expect(totals.qty_usd).toBeCloseTo(2, 2);
    const s128 = items.find(i => i.sku === '128')!;
    expect(s128.qty_cup).toBeCloseTo(1, 2);
    expect(s128.qty_usd).toBeCloseTo(2, 2);
    expect(s128.total_quantity).toBe(3);
  });
});

// ── Helpers PUROS del PDF (columnas / pertenencia / cantidad por hoja) ─────

describe('AUDITORÍA 2026-10-19 · helpers de la tabla del PDF (defectos A y B)', () => {
  it('A. La hoja CUP NO tiene columna «USD» (el detalle USD vive en su hoja) y conserva CUP+Comisión', () => {
    expect(salesTableColumns('CUP', true)).toEqual(['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)', 'Comisión']);
    expect(salesTableColumns('CUP', false)).toEqual(['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)']);
    expect(salesTableColumns('CUP', true)).not.toContain('USD');
  });

  it('A. La hoja USD conserva el detalle en USD con sus medios: Efectivo (USD) y Zelle', () => {
    expect(salesTableColumns('USD', false)).toEqual(['Código', 'Descripción', 'Cant.', 'Efectivo (USD)', 'Zelle']);
    expect(salesTableColumns('USD', true)).toEqual(['Código', 'Descripción', 'Cant.', 'Efectivo (USD)', 'Zelle']);
  });

  it('A. Pertenencia: el producto SOLO-USD vive únicamente en la hoja USD; el mixto en ambas; el CUP-only solo en CUP', () => {
    const items: ProductCollectionRow[] = [
      { product_id: 'p1', product_name: 'Solo CUP', sku: '1', total_quantity: 2, qty_cup: 2, qty_usd: 0, total_cup: 200, cash_cup: 200, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
      { product_id: 'p128', product_name: 'Mixto', sku: '128', total_quantity: 3, qty_cup: 1, qty_usd: 2, total_cup: 47400, cash_cup: 16000, transfer_cup: 0, zelle_cup: 0, cash_usd: 40, transfer_usd: 0, zelle_usd: 0, usd_total: 40, transactions_count: 2, has_payment_incident: true },
      { product_id: 'p9', product_name: 'Solo USD', sku: '9', total_quantity: 2, qty_cup: 0, qty_usd: 2, total_cup: 31600, cash_cup: 0, transfer_cup: 0, zelle_cup: 0, cash_usd: 40, transfer_usd: 0, zelle_usd: 0, usd_total: 40, transactions_count: 1, has_payment_incident: false },
    ];
    const cupSkus = salesTableItems(items, 'CUP').map(i => i.sku);
    const usdSkus = salesTableItems(items, 'USD').map(i => i.sku);
    expect(cupSkus).toEqual(['1', '128']); // el «9» (solo USD) NO está en la hoja CUP
    expect(usdSkus).toEqual(['128', '9']);
  });

  it('A. Los productos sin cobro USD (venta total 0 con incidencia) permanecen en la hoja CUP', () => {
    const items: ProductCollectionRow[] = [
      { product_id: 'p108', product_name: 'Cajita', sku: '108', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 0, cash_cup: 12000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: true },
    ];
    expect(salesTableItems(items, 'CUP').map(i => i.sku)).toEqual(['108']);
    expect(salesTableItems(items, 'USD')).toHaveLength(0);
  });

  it('B. Cantidad de la fila según la hoja: qty_cup en CUP, qty_usd en USD; fallback defensivo al total físico', () => {
    const mixed = { sku: '128', qty_cup: 1, qty_usd: 2, total_quantity: 3 };
    expect(salesTableQty(mixed, 'CUP')).toBe(1);
    expect(salesTableQty(mixed, 'USD')).toBe(2);
    // endpoint legacy sin qty_*: no rompe (usa la cantidad física)
    const legacy = { sku: '1', total_quantity: 7 };
    expect(salesTableQty(legacy, 'CUP')).toBe(7);
    expect(salesTableQty(legacy, 'USD')).toBe(7);
    // qty explícita 0 se respeta (producto sin unidades en esa moneda)
    expect(salesTableQty({ qty_cup: 0, qty_usd: 2, total_quantity: 2 }, 'CUP')).toBe(0);
  });
});
