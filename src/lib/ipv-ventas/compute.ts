/**
 * IPV — Ingresos por Ventas: núcleo de cálculo PURO (sin I/O).
 *
 * MISIÓN 2026-10-16 · AUDITORIA_IPV_INGRESOS_POR_VENTAS.md §5
 *
 * Regla contable (conciliación por construcción):
 *   Ef = Ei + EN + DV − V − VS + AJ + TR
 * donde cada movement_type de stock_movements se mapea a EXACTAMENTE una
 * columna con el signo de su quantity_change → la identidad se cumple por
 * construcción a nivel ledger; la conciliación contra la fuente canónica
 * (inventory.quantity) se verifica aparte y las diferencias se reportan
 * como incidencias — NUNCA se ocultan ni se "ajustan".
 *
 * Fuentes (dominios separados, cero doble conteo):
 *   · CANTIDADES: SOLO stock_movements (ledger; movement_date = fecha operativa).
 *   · IMPORTES:   SOLO transaction_items (+devolution_items) — el dinero nunca
 *                 se deriva del ledger ni las cantidades de las tablas de venta.
 *
 * Hallazgos de auditoría que este módulo neutraliza:
 *   · BUG LEGADO: price_at_sale_cup en filas V1 ya es precio×qty×tasa
 *     (total de línea, NO unitario) → computeLineTotalCup() lo detecta por
 *     autocoherencia y no multiplica dos veces (inflación ×qty).
 *   · DERIVA PRE-LEDGER: cargas iniciales sin movimiento hacen que
 *     Σ(quantity_change) ≠ inventory.quantity → incidencia PRE_LEDGER/
 *     RECONCILIATION con diferencia explícita (§5.6: no esconder).
 *   · item_discount_value es INFORMATIVO en COSTPRO: transactions.total_amount
 *     = Σ(líneas brutas) verificado en BD → el importe usa la línea bruta
 *     cobrada para conciliar con el total contable.
 */

// ── Tipos de entrada (crudos de Supabase, numéricos como string) ──────────

export interface IpvMovementRow {
  product_id: string;
  movement_type: string;
  quantity_change: string | number | null;
  movement_date: string;
}

export interface IpvInventoryRow {
  product_id: string;
  quantity: string | number | null;
}

export interface IpvSalesLineRow {
  product_id: string;
  quantity: string | number | null;
  price_at_sale: string | number | null;
  price_at_sale_cup: string | number | null;
  price_currency: string | null;
  exchange_rate: string | number | null;
  sale_exchange_rate: string | number | null;
}

export interface IpvDevolutionLineRow {
  product_id: string;
  quantity: string | number | null;
  unit_price: string | number | null;
}

export interface IpvProductRow {
  id: string;
  sku: string | null;
  name: string | null;
  unit_of_measure: string | null;
}

// ── Tipos de salida ────────────────────────────────────────────────────────

export type IpvIncidenceType =
  | 'PRE_LEDGER'       // producto con stock actual pero sin movimientos en el ledger
  | 'RECONCILIATION'   // Σ ledger ≠ inventory.quantity (deriva documentada)
  | 'UNMAPPED_TYPE'    // movement_type no clasificado (enum futuro) — nunca se descarta
  | 'PRICE_ANOMALY';   // línea de venta cuya forma legado/unitaria no pudo confirmarse

export interface IpvIncidence {
  productId: string;
  sku: string;
  name: string;
  type: IpvIncidenceType;
  detail: string;
  /** Saldo calculado desde el ledger (cuando aplica). */
  calculated?: number | null;
  /** Saldo según la fuente canónica inventory.quantity (cuando aplica). */
  expected?: number | null;
  /** expected − calculated (cuando aplica). */
  difference?: number | null;
}

export interface IpvRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  /** Existencia inicial (saldo al cierre de la víspera del período). null = N/D. */
  existenciaInicial: number | null;
  cantidadesVendidas: number;
  valesSalidas: number;
  entradas: number;
  devoluciones: number;
  ajustes: number;
  transferencias: number;
  /** Existencia final calculada (Ei + Σ período). null = N/D. */
  existenciaFinal: number | null;
  /** Ventas en importe — CUP, moneda contable (tasa histórica de cada venta). */
  ventasImporteCup: number;
  /** Informativo: importe nativo USD de líneas price_currency='USD'. */
  ventasImporteUsd: number;
  hasPeriodMovements: boolean;
  incidenceTypes: IpvIncidenceType[];
}

export interface IpvTotals {
  existenciaInicial: number | null;
  cantidadesVendidas: number;
  valesSalidas: number;
  entradas: number;
  devoluciones: number;
  ajustes: number;
  transferencias: number;
  existenciaFinal: number | null;
  ventasImporteCup: number;
  ventasImporteUsd: number;
}

export interface IpvResult {
  rows: IpvRow[];
  /** Productos de la tienda excluidos por la regla de inclusión (§6). */
  excludedCount: number;
  totals: IpvTotals;
  incidences: IpvIncidence[];
  meta: {
    productCount: number;
    movementsAnalyzed: number;
    salesLinesAnalyzed: number;
    devolutionLinesAnalyzed: number;
    /** true si alguna incidencia RECONCILIATION/PRE_LEDGER limita la garantía de Ei histórica exacta. */
    historicalBalanceLimited: boolean;
  };
}

// ── Mapeo de movement_type → columna (los 18 valores reales del enum) ─────
// Convención de acumulación:
//   ventas/vales  → columna += (−quantity_change)  [salidas positivas, reversos las netan]
//   entradas/devoluciones/ajustes/transferencias → columna += quantity_change
// Todo tipo NO listado cae en 'ajustes' con incidencia UNMAPPED_TYPE (defensiva).

type IpvColumn = 'ventas' | 'vales' | 'entradas' | 'devoluciones' | 'ajustes' | 'transferencias';

export const IPV_COLUMN_BY_TYPE: Record<string, IpvColumn> = {
  // Salidas por venta (+ sus reversos que restauran stock)
  sale: 'ventas',
  sale_void: 'ventas',
  sale_reverse: 'ventas',
  // Vales de salida (incluye retiros para producción) + reversos
  issue_slip_out: 'vales',
  issue_slip_reverse: 'vales',
  production_out: 'vales',
  production_reverse: 'vales',
  // Entradas comerciales + carga inicial + producción recibida + reverso de recepción
  purchase: 'entradas',
  purchase_reverse: 'entradas',
  initial: 'entradas',
  production_in: 'entradas',
  // Devoluciones de clientes (+) y su reverso (−)
  return: 'devoluciones',
  devolution_reverse: 'devoluciones',
  // Ajustes documentales y legacy sin clasificar mejor
  adjustment: 'ajustes',
  void: 'ajustes',
  // Transferencias entre tiendas (neto por tienda: out −, in +)
  transfer: 'transferencias',
  transfer_in: 'transferencias',
  transfer_out: 'transferencias',
};

const TOLERANCE = 1e-6;
const MONEY_TOLERANCE = 0.02;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Redondeo de CANTIDADES a 6 decimales: elimina el ruido de flotantes de la
 * suma sin destruir la precisión real del inventario (MISIÓN §8: 10.125, 65.25,
 * 1.75 se muestran fieles — NUNCA se redondean a 2 decimales ni a enteros).
 */
export function roundQ(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

/**
 * Detecta la forma de price_at_sale_cup y devuelve el TOTAL DE LÍNEA en CUP.
 *
 * · Forma UNITARIA (v2 y la mayoría): price_at_sale_cup = price_at_sale × tasa
 *   → total = price_at_sale_cup × quantity.
 * · Forma LEGADO V1 (bug histórico documentado en commission-engine.ts:641):
 *   price_at_sale_cup ya es price×qty×tasa → total = price_at_sale_cup (sin ×qty).
 * · Sin cup → total = price_at_sale × tasa × quantity.
 * · Ambigua → se asume unitaria y se cuenta PRICE_ANOMALY (auditable, no silencio).
 */
export function computeLineTotalCup(line: IpvSalesLineRow): { total: number; anomaly: boolean } {
  const qty = num(line.quantity);
  const price = num(line.price_at_sale);
  const cup = line.price_at_sale_cup === null || line.price_at_sale_cup === undefined
    ? null
    : num(line.price_at_sale_cup);
  const itemRate = num(line.exchange_rate);
  const headerRate = num(line.sale_exchange_rate);
  const rate = itemRate > 0 ? itemRate : (headerRate > 0 ? headerRate : 1);
  const unitExpected = price * rate;

  if (cup === null || (Math.abs(cup) <= MONEY_TOLERANCE && Math.abs(unitExpected) > MONEY_TOLERANCE)) {
    return { total: round2(unitExpected * qty), anomaly: false };
  }
  const diffUnit = Math.abs(cup - unitExpected);
  const diffLegacy = Math.abs(cup - unitExpected * qty);
  const legacyTolerance = Math.max(MONEY_TOLERANCE, Math.abs(unitExpected * qty) * 0.005);
  if (diffUnit <= MONEY_TOLERANCE) return { total: round2(cup * qty), anomaly: false };
  if (diffLegacy <= legacyTolerance && diffLegacy < diffUnit) return { total: round2(cup), anomaly: false };
  // qty=1: ambas formas coinciden matemáticamente — usar cup directamente.
  if (Math.abs(qty - 1) <= TOLERANCE && diffLegacy <= legacyTolerance) return { total: round2(cup), anomaly: false };
  return { total: round2(cup * qty), anomaly: true };
}

export interface IpvComputeInput {
  window: { fromISO: string; toISO: string };
  movements: IpvMovementRow[];
  inventory: IpvInventoryRow[];
  salesLines: IpvSalesLineRow[];
  devolutionLines: IpvDevolutionLineRow[];
  products: IpvProductRow[];
}

/**
 * Totales sobre un subconjunto de filas (el visible/filtrado). Garantiza que
 * pantalla, PDF y Excel usen EXACTAMENTE los mismos totales (MISIÓN §7.3, §11,
 * escenario K). N/D se propaga como null (no se sustituye por cero).
 */
export function totalsFromRows(rows: IpvRow[]): IpvTotals {
  const sumQ = (pick: (r: IpvRow) => number): number => roundQ(rows.reduce((s, r) => s + pick(r), 0));
  const sumM = (pick: (r: IpvRow) => number): number => round2(rows.reduce((s, r) => s + pick(r), 0));
  return {
    existenciaInicial: rows.some((r) => r.existenciaInicial === null) ? null : sumQ((r) => r.existenciaInicial ?? 0),
    cantidadesVendidas: sumQ((r) => r.cantidadesVendidas),
    valesSalidas: sumQ((r) => r.valesSalidas),
    entradas: sumQ((r) => r.entradas),
    devoluciones: sumQ((r) => r.devoluciones),
    ajustes: sumQ((r) => r.ajustes),
    transferencias: sumQ((r) => r.transferencias),
    existenciaFinal: rows.some((r) => r.existenciaFinal === null) ? null : sumQ((r) => r.existenciaFinal ?? 0),
    ventasImporteCup: sumM((r) => r.ventasImporteCup),
    ventasImporteUsd: sumM((r) => r.ventasImporteUsd),
  };
}

/**
 * Calcula el IPV completo. PURA — sin I/O — para pruebas A–L con datos sintéticos.
 */
export function computeIpv(input: IpvComputeInput): IpvResult {
  const { window, movements, inventory, salesLines, devolutionLines, products } = input;
  const from = new Date(window.fromISO).getTime();
  const to = new Date(window.toISO).getTime();

  const incidences: IpvIncidence[] = [];
  const priceAnomalyProducts = new Set<string>();

  // ── 1. Agregación del ledger por producto ────────────────────────────────
  // ei: movement_date < from · periodo: from ≤ movement_date ≤ to · post: > to
  interface Acc {
    ei: number;
    period: number;
    post: number;
    columns: Record<IpvColumn, number>;
    hasAny: boolean;
    hasPeriod: boolean;
    unmapped: Set<string>;
  }
  const blankAcc = (): Acc => ({
    ei: 0, period: 0, post: 0,
    columns: { ventas: 0, vales: 0, entradas: 0, devoluciones: 0, ajustes: 0, transferencias: 0 },
    hasAny: false, hasPeriod: false, unmapped: new Set<string>(),
  });
  const acc = new Map<string, Acc>();

  for (const m of movements) {
    const pid = m.product_id;
    const qc = num(m.quantity_change);
    const when = new Date(m.movement_date).getTime();
    let a = acc.get(pid);
    if (!a) { a = blankAcc(); acc.set(pid, a); }
    a.hasAny = true;

    const mappedType = IPV_COLUMN_BY_TYPE[m.movement_type];
    const col: IpvColumn = mappedType ?? 'ajustes';
    const contribution = col === 'ventas' || col === 'vales' ? -qc : qc;

    if (when < from) {
      a.ei += qc;
    } else if (when <= to) {
      a.period += qc;
      a.columns[col] += contribution;
      a.hasPeriod = true;
    } else {
      a.post += qc;
    }

    if (!mappedType) a.unmapped.add(m.movement_type);
  }

  // ── 2. Existencia actual canónica (inventory) ────────────────────────────
  const currentQty = new Map<string, number>();
  for (const inv of inventory) currentQty.set(inv.product_id, num(inv.quantity));

  // ── 3. Importes de venta (dominio dinero, separado del ledger) ───────────
  const salesCup = new Map<string, number>();
  const salesUsd = new Map<string, number>();
  for (const line of salesLines) {
    const pid = line.product_id;
    const { total, anomaly } = computeLineTotalCup(line);
    salesCup.set(pid, (salesCup.get(pid) ?? 0) + total);
    if (anomaly) priceAnomalyProducts.add(pid);
    if ((line.price_currency ?? '').toUpperCase() === 'USD') {
      const qty = num(line.quantity);
      const price = num(line.price_at_sale);
      salesUsd.set(pid, (salesUsd.get(pid) ?? 0) + round2(price * qty));
    }
  }

  // ── 4. Devoluciones (dinero neto a restar; cantidades vienen del ledger) ─
  const devCup = new Map<string, number>();
  for (const d of devolutionLines) {
    const total = round2(num(d.unit_price) * num(d.quantity));
    devCup.set(d.product_id, (devCup.get(d.product_id) ?? 0) + total);
  }

  // ── 5. Filas + regla de inclusión (§6) + incidencias (§5.6) ──────────────
  const productMap = new Map(products.map((p) => [p.id, p]));
  const allProductIds = new Set<string>([
    ...acc.keys(), ...currentQty.keys(), ...productMap.keys(),
  ]);

  const rows: IpvRow[] = [];
  let excludedCount = 0;

  const skuOf = (pid: string): string => {
    const raw = productMap.get(pid)?.sku;
    return raw && raw.trim() !== '' ? raw : pid.slice(0, 8);
  };
  const nameOf = (pid: string): string => productMap.get(pid)?.name ?? 'Producto sin nombre';
  const unitOf = (pid: string): string => productMap.get(pid)?.unit_of_measure ?? '';

  for (const pid of allProductIds) {
    const a = acc.get(pid);
    const ei = a && a.hasAny ? a.ei : null; // null = N/D (sin ledger)
    const ef = a && a.hasAny ? a.ei + a.period : null;
    const invQty = currentQty.get(pid) ?? 0;
    const rowIncidences: IpvIncidenceType[] = [];
    const sku = skuOf(pid);
    const nm = nameOf(pid);

    // Incidencia: stock actual sin ledger → saldo histórico N/D (no inventar)
    if (!a && Math.abs(invQty) > TOLERANCE) {
      rowIncidences.push('PRE_LEDGER');
      incidences.push({
        productId: pid, sku, name: nm, type: 'PRE_LEDGER',
        detail: 'Stock actual sin movimientos en el ledger: la existencia histórica no es reconstruible (carga inicial previa al registro de movimientos). Se muestra N/D, no cero.',
        calculated: null, expected: roundQ(invQty), difference: roundQ(invQty),
      });
    }

    // Incidencia: deriva ledger ↔ fuente canónica (verificación §5.6)
    if (a) {
      const ledgerTotal = a.ei + a.period + a.post;
      const drift = invQty - ledgerTotal;
      if (Math.abs(drift) > 0.0001) {
        rowIncidences.push('RECONCILIATION');
        incidences.push({
          productId: pid, sku, name: nm, type: 'RECONCILIATION',
          detail: 'Diferencia entre el total reconstruido del ledger y la existencia canónica actual: el saldo inicial histórico puede estar incompleto (carga inicial sin movimiento u operación externa). Reportado, no ajustado.',
          calculated: roundQ(ledgerTotal), expected: roundQ(invQty), difference: roundQ(drift),
        });
      }
      for (const t of a.unmapped) {
        rowIncidences.push('UNMAPPED_TYPE');
        incidences.push({
          productId: pid, sku, name: nm, type: 'UNMAPPED_TYPE',
          detail: `Tipo de movimiento no clasificado en el IPV: "${t}". Su quantity_change se contabilizó en Ajustes para no romper la conciliación.`,
        });
      }
    }

    if (priceAnomalyProducts.has(pid)) {
      rowIncidences.push('PRICE_ANOMALY');
      incidences.push({
        productId: pid, sku, name: nm, type: 'PRICE_ANOMALY',
        detail: 'Alguna línea de venta con forma de precio ambigua (unitaria vs legado ×qty). Se usó la forma unitaria; revise el detalle si el importe no concilia.',
      });
    }

    const ventasCup = round2((salesCup.get(pid) ?? 0) - (devCup.get(pid) ?? 0));
    const ventasUsd = round2(salesUsd.get(pid) ?? 0);

    // Regla de inclusión §6: Ei≠0 Ó movimiento en período Ó Ef≠0 Ó incidencia.
    // Ampliado (auditoría IPV): un producto con importe vendido pero sin
    // movimientos de ledger (venta sin movimiento = anomalía) TAMBIÉN debe
    // aparecer — ocultar ingresos sería peor que una columna de stock N/D.
    const eiNonZero = ei !== null && Math.abs(ei) > TOLERANCE;
    const efNonZero = ef !== null && Math.abs(ef) > TOLERANCE;
    const include =
      (ei !== null && (eiNonZero || a!.hasPeriod)) ||
      efNonZero ||
      (a !== undefined && a.hasPeriod) ||
      Math.abs(ventasCup) > 0.005 ||
      Math.abs(ventasUsd) > 0.005 ||
      rowIncidences.length > 0;

    if (!include) { excludedCount += 1; continue; }

    const c = a ? a.columns : { ventas: 0, vales: 0, entradas: 0, devoluciones: 0, ajustes: 0, transferencias: 0 };

    rows.push({
      productId: pid,
      sku,
      name: nm,
      unit: unitOf(pid),
      existenciaInicial: ei === null ? null : roundQ(ei),
      // La columna ya acumula el valor de display (−qc para salidas, +qc para entradas)
      cantidadesVendidas: roundQ(c.ventas),
      valesSalidas: roundQ(c.vales),
      entradas: roundQ(c.entradas),
      devoluciones: roundQ(c.devoluciones),
      ajustes: roundQ(c.ajustes),
      transferencias: roundQ(c.transferencias),
      existenciaFinal: ef === null ? null : roundQ(ef),
      ventasImporteCup: ventasCup,
      ventasImporteUsd: ventasUsd,
      hasPeriodMovements: a ? a.hasPeriod : false,
      incidenceTypes: rowIncidences,
    });
  }

  // Orden estable: por código (numérico si ambos lados son numéricos, si no léxico)
  rows.sort((x, y) => {
    const nx = Number(x.sku); const ny = Number(y.sku);
    if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
    return x.sku.localeCompare(y.sku, 'es');
  });

  // ── 6. Totales (sobre filas incluidas; N/D se propaga como null) ─────────
  const sumQ = (pick: (r: IpvRow) => number): number => roundQ(rows.reduce((s, r) => s + pick(r), 0));
  const sumM = (pick: (r: IpvRow) => number): number => round2(rows.reduce((s, r) => s + pick(r), 0));
  const totals: IpvTotals = {
    existenciaInicial: rows.some((r) => r.existenciaInicial === null) ? null : sumQ((r) => r.existenciaInicial ?? 0),
    cantidadesVendidas: sumQ((r) => r.cantidadesVendidas),
    valesSalidas: sumQ((r) => r.valesSalidas),
    entradas: sumQ((r) => r.entradas),
    devoluciones: sumQ((r) => r.devoluciones),
    ajustes: sumQ((r) => r.ajustes),
    transferencias: sumQ((r) => r.transferencias),
    existenciaFinal: rows.some((r) => r.existenciaFinal === null) ? null : sumQ((r) => r.existenciaFinal ?? 0),
    ventasImporteCup: sumM((r) => r.ventasImporteCup),
    ventasImporteUsd: sumM((r) => r.ventasImporteUsd),
  };

  return {
    rows,
    excludedCount,
    totals,
    incidences,
    meta: {
      productCount: rows.length,
      movementsAnalyzed: movements.length,
      salesLinesAnalyzed: salesLines.length,
      devolutionLinesAnalyzed: devolutionLines.length,
      historicalBalanceLimited: incidences.some((i) => i.type === 'PRE_LEDGER' || i.type === 'RECONCILIATION'),
    },
  };
}
