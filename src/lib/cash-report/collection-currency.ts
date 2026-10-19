/**
 * collection-currency.ts — FUENTE ÚNICA de la reconstrucción de la MONEDA REAL
 * DE COBRO de las ventas para el Reporte de Entrega.
 *
 * INCIDENTE 2026-10-16 (ENERVIDA-VITALLCONS):
 *   El reporte clasificaba los cobros por `sale_currency` de la transacción.
 *   El modelo canónico de create_sale_v2 (usePOSCheckout.ts L129-182) guarda los
 *   pools de la transacción (cash_amount/transfer_amount/zelle_amount) en CUP
 *   canónico — convertidos a la tasa del cobro — y `sale_currency='USD'` SOLO
 *   cuando hay Zelle. Por eso un cobro hecho en efectivo USD (p. ej. 40 USD ×
 *   tasa 790 = 31 600) quedaba clasificado como CUP: la columna USD del reporte
 *   quedaba vacía y el importe USD desaparecía dentro del efectivo CUP.
 *
 *   Además, cuando la línea tiene total 0 (precio histórico 0 con sobrepago
 *   documentado, p. ej. SKU 108: total 0 pero cash_amount=12 000 + incidencia),
 *   el reparto proporcional por valor de línea daba 0 a todo: la venta real de
 *   12 000 CUP se mostraba en cero.
 *
 * Reglas de reconstrucción (deterministas, sin inventar importes):
 *
 *   1. VERDAD A NIVEL ÍTEM (ventas V2): si el ítem registró la fila de pago
 *      (`cash_paid`/`cash_currency`, `transfer_paid`/`transfer_currency`,
 *      `zelle_paid`/`zelle_currency`), esa es la moneda real del cobro y se usa
 *      tal cual (sin conversión).
 *   2. LEGADO (filas de pago NULL): los pools de la transacción están en CUP
 *      canónico. Para cada método con pool > 0:
 *        - zelle → el cobro es USD (Zelle es un riel USD por diseño): USD =
 *          pool / tasa, usando la tasa válida del contexto (sale_exchange_rate
 *          de la venta o la tasa de la línea). Sin tasa válida → se mantiene en
 *          CUP (no se inventa conversión).
 *        - cash/transfer → si TODAS las líneas del cobro son de moneda original
 *          USD y el pool coincide EXACTAMENTE con el valor canónico CUP de esas
 *          líneas (|pool − ΣlíneaCUP| ≤ 0,01), el cobro se hizo en USD (la
 *          conversión exacta es la marca del RPC): USD = Σ valor original de
 *          las líneas. Cualquier residual ≠ 0 evidencia un cobro en CUP
 *          (los sobrepagos/diferencias se documentan en CUP —
 *          payment_incidents.received_cup) y el importe CUP real del pool es el
 *          que se reporta (incluye el sobrepago recibido).
 *   3. Transacciones con líneas de monedas originales mezcladas y filas de pago
 *      NULL: indistinguibles a nivel de pool → se reportan en CUP canónico
 *      (conservador, sin duplicar) y se marcan `mixedUnresolved` para auditoría.
 *   4. REPARTO por ítem: proporcional al valor CUP de la línea; si la suma de
 *      líneas es 0 pero hay cobro (sobrepago con precio 0), el cobro se asigna
 *      por partes iguales (con 1 ítem: el cobro completo — caso SKU 108).
 *   5. NUNCA se suma CUP + USD: buckets separados por moneda en todo el módulo.
 *
 * Consumidores:
 *   - /api/cash-report           → sales_split + grupos `sales` por (método, moneda)
 *   - /api/cash-report/items-summary → tabla por producto del reporte
 *   - /api/cash-report/payment-totals → fuente 2 de computeDailySummary
 *   - /api/cash-report/details   → pertenencia de cada venta al grupo (método, moneda)
 */

import { lineTotalCup } from './summary';

export const COLLECTION_EPS = 0.01;

export interface CollectionTx {
  id?: string;
  cash_amount?: number | string | null;
  transfer_amount?: number | string | null;
  zelle_amount?: number | string | null;
  sale_currency?: string | null;
  sale_exchange_rate?: number | string | null;
}

export interface CollectionItem {
  id?: string;
  transaction_id?: string;
  product_id?: string;
  product_name?: string | null;
  sku?: string | null;
  quantity?: number | string | null;
  price_at_sale?: number | string | null;
  price_at_sale_cup?: number | string | null;
  /** Moneda ORIGINAL de la línea (USD/CUP) — no `price_currency` (legacy). */
  currency?: string | null;
  exchange_rate?: number | string | null;
  cash_paid?: number | string | null;
  cash_currency?: string | null;
  transfer_paid?: number | string | null;
  transfer_currency?: string | null;
  zelle_paid?: number | string | null;
  zelle_currency?: string | null;
}

export type PayMethod = 'cash' | 'transfer' | 'zelle';
export const PAY_METHODS: PayMethod[] = ['cash', 'transfer', 'zelle'];

export interface MethodAmounts { cash: number; transfer: number; zelle: number }
export interface ItemCollections { cup: MethodAmounts; usd: MethodAmounts }

export interface CollectionBucket {
  method: PayMethod;
  currency: string;
  /** Importe en la MONEDA del cobro (original, sin convertir). */
  amount: number;
  /** Equivalente CUP del importe (tasa del contexto) para conciliación. */
  amountCup: number;
  origin: 'explicit-row' | 'legacy-exact-usd' | 'legacy-cup' | 'zelle-usd' | 'zelle-no-rate-cup';
}

export interface TxCollectionResult {
  /** Buckets (método, moneda) de la transacción — fuente de sales_split y grupos. */
  buckets: CollectionBucket[];
  /** Colecciones por ítem (índice de entrada) para la tabla por producto. */
  perItem: ItemCollections[];
  /** Líneas de monedas originales mezcladas reconstruidas como CUP (limitación). */
  mixedUnresolved: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normCur = (c: unknown): string => String(c || 'CUP').trim().toUpperCase() || 'CUP';

/** Valor CUP canónico de la línea (misma fórmula centralizada del reporte). */
export function lineCupOf(item: CollectionItem): number {
  return lineTotalCup(item.price_at_sale_cup, item.price_at_sale, item.exchange_rate, num(item.quantity));
}

/**
 * Valor ORIGINAL USD de la línea (solo si la línea se vendió en USD).
 * Guarda de consistencia: `price_at_sale × exchange_rate` debe reproducir
 * `price_at_sale_cup`; si el triple es inconsistente se deriva del canónico
 * (líneaCUP / tasa) en vez de inventar un importe.
 */
export function lineUsdOf(item: CollectionItem): number {
  if (normCur(item.currency) !== 'USD') return 0;
  const rate = num(item.exchange_rate);
  const qty = num(item.quantity);
  if (rate <= 0) return 0;
  // Comparación a nivel UNITARIO: price_at_sale y price_at_sale_cup son precios
  // unitarios (lineTotalCup multiplica por cantidad) — mismo plano, sin el sesgo de qty.
  const unitCandidate = num(item.price_at_sale);
  const unitCanonical = num(item.price_at_sale_cup);
  if (unitCanonical > 0 && Math.abs(unitCandidate * rate - unitCanonical) > Math.max(COLLECTION_EPS, unitCanonical * 0.01)) {
    return (unitCanonical / rate) * qty; // derivado del canónico, no inventado
  }
  return unitCandidate * qty;
}

const emptyAmounts = (): MethodAmounts => ({ cash: 0, transfer: 0, zelle: 0 });
const emptyCollections = (): ItemCollections => ({ cup: emptyAmounts(), usd: emptyAmounts() });

function addBucket(
  buckets: CollectionBucket[],
  method: PayMethod,
  currency: string,
  amount: number,
  amountCup: number,
  origin: CollectionBucket['origin'],
): void {
  if (!(Math.abs(amount) > COLLECTION_EPS) && !(Math.abs(amountCup) > COLLECTION_EPS)) return;
  const existing = buckets.find(b => b.method === method && b.currency === currency);
  if (existing) {
    existing.amount += amount;
    existing.amountCup += amountCup;
  } else {
    buckets.push({ method, currency, amount, amountCup, origin });
  }
}

/**
 * Reconstruye las colecciones reales (método × moneda) de UNA transacción.
 * `items` deben ser los transaction_items de ESA transacción (puede ser vacío:
 * los buckets quedan a nivel transacción y perItem queda vacío).
 */
export function reconstructTxCollections(tx: CollectionTx, items: CollectionItem[]): TxCollectionResult {
  const buckets: CollectionBucket[] = [];
  const perItem = items.map(() => emptyCollections());
  let mixedUnresolved = false;

  const lineCup = items.map(lineCupOf);
  const lineUsd = items.map(lineUsdOf);
  const lineRate = items.map(it => (num(it.exchange_rate) > 0 ? num(it.exchange_rate) : 1));
  const origCurs = items.map(it => normCur(it.currency));

  for (const method of PAY_METHODS) {
    const pool = num(tx[`${method}_amount` as keyof CollectionTx]);
    const paidField = `${method}_paid` as keyof CollectionItem;
    const curField = `${method}_currency` as keyof CollectionItem;

    // ── 1. Filas de pago explícitas a nivel ítem (ventas V2): verdad del cobro ──
    const explicitIdx = new Set<number>();
    let explicitEquivCup = 0;
    items.forEach((it, idx) => {
      const amt = num(it[paidField]);
      if (amt > 0) {
        explicitIdx.add(idx);
        const cur = normCur(it[curField]);
        if (cur === 'USD') {
          perItem[idx].usd[method] += amt;
          addBucket(buckets, method, 'USD', amt, amt * lineRate[idx], 'explicit-row');
          explicitEquivCup += amt * lineRate[idx];
        } else {
          perItem[idx].cup[method] += amt;
          addBucket(buckets, method, cur, amt, amt, 'explicit-row');
          explicitEquivCup += amt;
        }
      }
    });

    // ── 2. Legado: residual del pool sin filas explícitas (pools en CUP canónico) ──
    const residual = pool - explicitEquivCup;
    if (residual <= COLLECTION_EPS) continue; // pool cubierto por filas explícitas (o pool 0)
    const legacyIdx = items.map((_, idx) => idx).filter(idx => !explicitIdx.has(idx));

    if (legacyIdx.length === 0) {
      // Pool con filas explícitas + residual (sobrepago documentado del pool):
      // se atribuye como CUP a nivel transacción, repartido por valor de línea.
      const sumLineCup = lineCup.reduce((s, v) => s + v, 0);
      addBucket(buckets, method, 'CUP', residual, residual, 'legacy-cup');
      if (sumLineCup > 0) {
        items.forEach((_, idx) => {
          perItem[idx].cup[method] += residual * (lineCup[idx] / sumLineCup);
        });
      } else if (items.length > 0) {
        items.forEach((_, idx) => { perItem[idx].cup[method] += residual / items.length; });
      }
      continue;
    }

    const sumLineCup = legacyIdx.reduce((s, idx) => s + lineCup[idx], 0);
    const sumLineUsd = legacyIdx.reduce((s, idx) => s + lineUsd[idx], 0);
    const allUsd = legacyIdx.every(idx => origCurs[idx] === 'USD');
    const anyUsd = legacyIdx.some(idx => origCurs[idx] === 'USD');

    if (method === 'zelle') {
      // Zelle es un riel USD: la moneda del cobro es USD si hay tasa válida.
      const txRate = num(tx.sale_exchange_rate);
      const itemRate = Math.max(...legacyIdx.map(idx => num(items[idx].exchange_rate) || 0), 0);
      const rate = txRate > 1 ? txRate : itemRate;
      if (rate > 1) {
        const usdAmt = residual / rate;
        addBucket(buckets, method, 'USD', usdAmt, residual, 'zelle-usd');
        distribute(perItem, legacyIdx, method, 'usd', usdAmt, lineCup, sumLineCup);
      } else {
        // Sin tasa válida en el contexto: NO se inventa conversión → CUP canónico.
        addBucket(buckets, method, 'CUP', residual, residual, 'zelle-no-rate-cup');
        distribute(perItem, legacyIdx, method, 'cup', residual, lineCup, sumLineCup);
      }
    } else if (allUsd && sumLineCup > 0 && Math.abs(residual - sumLineCup) <= COLLECTION_EPS) {
      // Conversión exacta del RPC: el cobro se hizo en USD (monto original de las líneas).
      const usdAmt = sumLineUsd > 0 ? sumLineUsd : residual / (lineRate[legacyIdx[0]] || 1);
      addBucket(buckets, method, 'USD', usdAmt, residual, 'legacy-exact-usd');
      distribute(perItem, legacyIdx, method, 'usd', usdAmt, lineCup, sumLineCup);
    } else {
      // Cobro en CUP (incluye sobrepagos documentados en CUP y el caso línea 0
      // con cobro real — SKU 108). Monedas originales mezcladas: limitación.
      if (anyUsd && !allUsd) mixedUnresolved = true;
      addBucket(buckets, method, 'CUP', residual, residual, 'legacy-cup');
      distribute(perItem, legacyIdx, method, 'cup', residual, lineCup, sumLineCup);
    }
  }

  return { buckets, perItem, mixedUnresolved };
}

/** Reparto por ítem: proporcional al valor de línea; si Σlínea=0, partes iguales. */
function distribute(
  perItem: ItemCollections[],
  idxs: number[],
  method: PayMethod,
  side: 'cup' | 'usd',
  amount: number,
  lineCup: number[],
  sumLineCup: number,
): void {
  if (idxs.length === 0 || amount === 0) return;
  if (sumLineCup > 0) {
    for (const idx of idxs) perItem[idx][side][method] += amount * (lineCup[idx] / sumLineCup);
  } else {
    for (const idx of idxs) perItem[idx][side][method] += amount / idxs.length;
  }
}

// ── sales_split por moneda (consumido por computeDailySummary) ──────────────

export interface SalesSplitAccum { [currency: string]: { cash: number; transfer: number; zelle: number; mixedUnsplit: number; total: number } }

/**
 * Acumula los buckets de colección por MONEDA (nunca mezcla CUP y USD).
 * `mixedUnsplit` queda 0: la reconstrucción resuelve cada cobro a su moneda;
 * los casos indistinguibles (monedas originales mezcladas sin filas de pago)
 * permanecen en CUP canónico — igual que el comportamiento previo del pool —
 * sin sacarlos del efectivo esperado (evita regresiones en otros días).
 */
export function accumulateSalesSplit(acc: SalesSplitAccum, result: TxCollectionResult): void {
  for (const b of result.buckets) {
    if (!acc[b.currency]) acc[b.currency] = { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 };
    acc[b.currency][b.method] += b.amount;
    acc[b.currency].total += b.amount;
  }
}

/** Grupos `sales` (método × moneda) coherentes con la reconstrucción. */
export function buildSalesGroups(
  results: Array<{ tx: CollectionTx; result: TxCollectionResult }>,
): Array<{ payment_method: string; currency: string; transaction_count: number; total: number; total_cup: number }> {
  const map = new Map<string, { payment_method: string; currency: string; transaction_count: number; total: number; total_cup: number }>();
  for (const { result } of results) {
    for (const b of result.buckets) {
      const k = `${b.method}|${b.currency}`;
      const g = map.get(k) ?? { payment_method: b.method, currency: b.currency, transaction_count: 0, total: 0, total_cup: 0 };
      g.transaction_count += 1;
      g.total += b.amount;
      g.total_cup += b.amountCup;
      map.set(k, g);
    }
  }
  return [...map.values()].sort((a, b) => a.payment_method.localeCompare(b.payment_method) || a.currency.localeCompare(b.currency));
}

// ── Tabla por producto (items-summary) ──────────────────────────────────────

export interface ProductCollectionRow {
  product_id: string;
  product_name: string;
  sku: string;
  /** Cantidad FÍSICA total (Σ quantity de todas las líneas, ambas monedas). */
  total_quantity: number;
  /**
   * Cantidad atribuible a cobros en CUP (AUDITORÍA 2026-10-19, defecto B):
   * reparto por línea — una línea cobrada en UNA sola moneda atribuye su
   * cantidad completa a esa moneda (verdad documental); una línea cobrada en
   * AMBAS monedas se reparte proporcionalmente al valor cobrado; una línea
   * sin cobro atribuido cae a su moneda original. Invariante:
   * qty_cup + qty_usd = total_quantity.
   */
  qty_cup: number;
  /** Cantidad atribuible a cobros en USD (mismas reglas que qty_cup). */
  qty_usd: number;
  /** Total histórico CUP de las líneas (precio de venta histórico — NUNCA recalculado). */
  total_cup: number;
  /** Cobros en CUP por método (la moneda del cobro, no la del precio). */
  cash_cup: number;
  transfer_cup: number;
  zelle_cup: number;
  /** Cobros en USD por método (monto original, sin convertir). */
  cash_usd: number;
  transfer_usd: number;
  zelle_usd: number;
  usd_total: number;
  transactions_count: number;
  /** El cobro difiere del total histórico (incidencia de pago documentada). */
  has_payment_incident: boolean;
}

export interface ItemsSummaryResult {
  items: ProductCollectionRow[];
  totals: {
    total_quantity: number;
    qty_cup: number;
    qty_usd: number;
    total_cup: number;
    cash_cup: number;
    transfer_cup: number;
    zelle_cup: number;
    cash_usd: number;
    transfer_usd: number;
    zelle_usd: number;
    usd_total: number;
  };
}

interface AggState extends Omit<ProductCollectionRow, 'transactions_count' | 'usd_total'> {
  txs: Set<string>;
}

/**
 * Atribución de la CANTIDAD de una línea a la moneda de cobro (AUDITORÍA
 * 2026-10-19, defecto B del reporte Entrega en tienda):
 *   · línea cobrada en UNA moneda → cantidad completa a esa moneda (exacto);
 *   · línea cobrada en AMBAS → reparto proporcional al valor cobrado
 *     (CUP : USD×tasa — atribución derivada, documentada);
 *   · línea sin cobro atribuido (venta total 0 absorbida por otras líneas,
 *     incidencias) → moneda ORIGINAL de la línea.
 * Determinista y sin inventar: la cantidad física (total_quantity) NUNCA se
 * duplica — qty_cup + qty_usd = total_quantity en todo momento.
 */
function attributeQuantity(
  qty: number,
  cupCollected: number,
  usdCollected: number,
  rate: number,
  lineCurrency: string,
): { qtyCup: number; qtyUsd: number } {
  if (usdCollected > COLLECTION_EPS && cupCollected <= COLLECTION_EPS) {
    return { qtyCup: 0, qtyUsd: qty };
  }
  if (cupCollected > COLLECTION_EPS && usdCollected <= COLLECTION_EPS) {
    return { qtyCup: qty, qtyUsd: 0 };
  }
  if (cupCollected > COLLECTION_EPS && usdCollected > COLLECTION_EPS) {
    const wUsd = usdCollected * rate;
    const w = cupCollected + wUsd;
    return { qtyCup: qty * (cupCollected / w), qtyUsd: qty * (wUsd / w) };
  }
  return normCur(lineCurrency) === 'USD' ? { qtyCup: 0, qtyUsd: qty } : { qtyCup: qty, qtyUsd: 0 };
}

/**
 * Agrega filas (transaction_items ⨝ transactions ⨝ products) a UNA fila por
 * producto con los cobros por moneda y las CANTIDADES atribuidas por moneda
 * (qty_cup/qty_usd — AUDITORÍA 2026-10-19). La cantidad física
 * (total_quantity) y los importes NO cambian.
 */
export function buildItemsSummary(rows: Array<{ item: CollectionItem; tx: CollectionTx; txId: string }>): ItemsSummaryResult {
  // Agrupar por transacción y reconstruir una vez por transacción (sin duplicar).
  const byTx = new Map<string, { tx: CollectionTx; items: CollectionItem[] }>();
  for (const r of rows) {
    const g = byTx.get(r.txId);
    if (g) g.items.push(r.item);
    else byTx.set(r.txId, { tx: r.tx, items: [r.item] });
  }

  const agg = new Map<string, AggState>();
  for (const { tx, items } of byTx.values()) {
    const { perItem } = reconstructTxCollections(tx, items);
    items.forEach((item, idx) => {
      const pid = String(item.product_id || '');
      if (!pid) return;
      const col = perItem[idx];
      let a = agg.get(pid);
      if (!a) {
        a = {
          product_id: pid,
          product_name: item.product_name || 'Producto',
          sku: item.sku || '—',
          total_quantity: 0,
          qty_cup: 0,
          qty_usd: 0,
          total_cup: 0,
          cash_cup: 0, transfer_cup: 0, zelle_cup: 0,
          cash_usd: 0, transfer_usd: 0, zelle_usd: 0,
          has_payment_incident: false,
          txs: new Set<string>(),
        };
        agg.set(pid, a);
      }
      const rate = num(item.exchange_rate) > 0 ? num(item.exchange_rate) : 1;
      const cupCollected = col.cup.cash + col.cup.transfer + col.cup.zelle;
      const usdCollected = col.usd.cash + col.usd.transfer + col.usd.zelle;
      const { qtyCup, qtyUsd } = attributeQuantity(num(item.quantity), cupCollected, usdCollected, rate, item.currency || 'CUP');
      const cupEquiv = cupCollected + usdCollected * rate;
      const lineCup = lineCupOf(item);
      const incident = Math.abs(cupEquiv - lineCup) > COLLECTION_EPS;
      a.total_quantity += num(item.quantity);
      a.qty_cup += qtyCup;
      a.qty_usd += qtyUsd;
      a.total_cup += lineCup;
      a.cash_cup += col.cup.cash;
      a.transfer_cup += col.cup.transfer;
      a.zelle_cup += col.cup.zelle;
      a.cash_usd += col.usd.cash;
      a.transfer_usd += col.usd.transfer;
      a.zelle_usd += col.usd.zelle;
      if (incident) a.has_payment_incident = true;
      const txId = String(item.transaction_id || tx.id || '');
      if (txId) a.txs.add(txId);
    });
  }

  const items: ProductCollectionRow[] = [...agg.values()].map(a => ({
    product_id: a.product_id,
    product_name: a.product_name,
    sku: a.sku,
    total_quantity: a.total_quantity,
    qty_cup: a.qty_cup,
    qty_usd: a.qty_usd,
    total_cup: a.total_cup,
    cash_cup: a.cash_cup,
    transfer_cup: a.transfer_cup,
    zelle_cup: a.zelle_cup,
    cash_usd: a.cash_usd,
    transfer_usd: a.transfer_usd,
    zelle_usd: a.zelle_usd,
    usd_total: a.cash_usd + a.transfer_usd + a.zelle_usd,
    transactions_count: a.txs.size,
    has_payment_incident: a.has_payment_incident,
  })).sort((x, y) => y.total_cup - x.total_cup);

  const totals = items.reduce((s, i) => ({
    total_quantity: s.total_quantity + i.total_quantity,
    qty_cup: s.qty_cup + i.qty_cup,
    qty_usd: s.qty_usd + i.qty_usd,
    total_cup: s.total_cup + i.total_cup,
    cash_cup: s.cash_cup + i.cash_cup,
    transfer_cup: s.transfer_cup + i.transfer_cup,
    zelle_cup: s.zelle_cup + i.zelle_cup,
    cash_usd: s.cash_usd + i.cash_usd,
    transfer_usd: s.transfer_usd + i.transfer_usd,
    zelle_usd: s.zelle_usd + i.zelle_usd,
    usd_total: s.usd_total + i.usd_total,
  }), {
    total_quantity: 0, qty_cup: 0, qty_usd: 0, total_cup: 0, cash_cup: 0, transfer_cup: 0, zelle_cup: 0,
    cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0,
  });

  return { items, totals };
}
