/**
 * report-selection.ts — PERSONALIZACIÓN DEL REPORTE ENTREGA (misión 2026-10-25).
 *
 * Dos funciones nuevas del módulo Inicio → OPERACIÓN → Ventas → Reporte
 * Entrega, resueltas como CAPA DE PRESENTACIÓN sobre las fuentes existentes
 * (sin migraciones, sin tocar datos contables):
 *
 *   FUNCIÓN A — «Conceptos que se incluirán en el reporte»: checkboxes de los
 *   conceptos del Resumen del Día (todos activados por defecto = comportamiento
 *   actual). Un concepto desactivado se OMITE realmente del PDF, la impresión y
 *   el Excel (no se deja título/subtotal huérfano). La selección es SOLO de
 *   presentación: nunca altera saldos, el libro de caja ni registros.
 *
 *   FUNCIÓN B — Selección de las ventas que se computan: filtro por MONEDA REAL
 *   DE COBRO (CUP / USD / Mixta, derivada de los pagos originales de cada venta
 *   — jamás de la equivalencia contable) + checkbox por fila en «Ventas por
 *   Método». Las ventas excluidas no contribuyen a los totales de ventas ni a
 *   los desgloses por método, en pantalla, PDF e Excel. Los egresos de caja NO
 *   se recalculan al excluir ventas (concepto independiente).
 *
 * CONTRATO CONTABLE (heredado del PR #1479 — contrato único de clasificación):
 *   1. Cada hoja (CUP/USD) cuenta SOLO los cobros de SU moneda real.
 *   2. La equivalencia canónica CUP de cobros en OTRA moneda es consolidación
 *      contable — NUNCA una segunda venta, NUNCA sumada a ventasTotales.
 *   3. Venta mixta: componentes en su moneda efectiva; nunca el importe
 *      completo en ambas hojas.
 *   4. Medio de pago ≠ moneda.
 *
 * CONSISTENCIA CON LA FUENTE ÚNICA: la recomputación del split a partir de las
 * ventas seleccionadas usa los BUCKETS de la MISMA reconstrucción que produce
 * sales_split en /api/cash-report (collection-currency.ts). La tabla por
 * producto del PDF/Excel con selección activa se recalcula con la MISMA
 * función buildItemsSummary que usa el servidor — sin algoritmos paralelos.
 */

import { buildItemsSummary, normCur, type CollectionItem, type CollectionTx, type LedgerPayment } from './collection-currency';
import type { SalesSplit } from './summary';

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN B · Filas de venta (payload de /api/cash-report → sales_rows)
// ═══════════════════════════════════════════════════════════════════════════

/** Componente de cobro de UNA venta (método × moneda real). */
export interface SalePaymentBucket {
  method: 'cash' | 'transfer' | 'zelle';
  /** Moneda REAL del cobro (CUP/USD/…, ya normalizada). */
  currency: string;
  /** Importe nativo en la moneda del cobro (sin convertir). */
  amount: number;
  /** Equivalente CUP canónico del importe (tasa persistida de la operación). */
  amount_cup: number;
}

/**
 * MISIÓN CORRECTIVA 2026-10-25: liquidación explícita de la venta (vuelto
 * persistido, columnas de transactions). Presente solo en ventas v2.24+;
 `null` en ventas legadas. Es la vista FÍSICA de los billetes: para el
 * efectivo esperado el cobro cuenta como (recibido − vuelto) por moneda
 * — exactamente la regla del libro (get_cash_currency_summary §1).
 */
export interface SaleSettlement {
  cash_received_cup?: number | null;
  change_given_cup?: number | null;
  cash_received_usd?: number | null;
  change_given_usd?: number | null;
}

/** ¿La venta tiene liquidación explícita? (misma regla que el libro §1). */
export function saleIsSettled(s: SaleSettlement | null | undefined): boolean {
  return s != null && (
    s.cash_received_cup != null || s.cash_received_usd != null
    || s.change_given_cup != null || s.change_given_usd != null
  );
}

/** Neto de BILLETES de una venta liquidada, por moneda (regla del ledger). */
export function saleBillsByCurrency(s: SaleSettlement | null | undefined): { CUP: number; USD: number } | null {
  if (!saleIsSettled(s)) return null;
  const num = (v: unknown): number => Number(v ?? 0) || 0;
  return {
    CUP: num(s!.cash_received_cup) - num(s!.change_given_cup),
    USD: num(s!.cash_received_usd) - num(s!.change_given_usd),
  };
}

/**
 * Venta individual del período con su composición REAL de pagos. La produce
 * /api/cash-report junto a sales_split — misma reconstrucción, misma fuente.
 * `items`/`tx`/`payments` son el input EXACTO de buildItemsSummary para
 * recomputar la tabla por producto del lado cliente cuando hay selección.
 */
export interface SaleRow {
  id: string;
  created_at: string;
  customer_name?: string | null;
  reference?: string | null;
  status?: string;
  /** 'ledger' = filas de pago autoritativas · 'reconstruction' = heurística
   *  histórica · 'no-items' = venta sin ítems reconstruida por pools. */
  source: 'ledger' | 'reconstruction' | 'no-items';
  buckets: SalePaymentBucket[];
  /** MISIÓN CORRECTIVA 2026-10-25: liquidación explícita (vuelto persistido)
   *  de la venta — vista FÍSICA de los billetes para el efectivo esperado.
   *  null en ventas legadas (los buckets actúan como fallback). */
  settlement?: SaleSettlement | null;
  tx?: CollectionTx;
  items?: CollectionItem[];
  payments?: LedgerPayment[];
}

/**
 * Clasificación de una venta por la composición REAL de sus pagos:
 *   · CUP   → todos los componentes cobrados en CUP.
 *   · USD   → todos los componentes cobrados en USD.
 *   · MIXTA → componentes en más de una moneda (p. ej. parte CUP + parte USD).
 *   · OTRA  → única moneda ni CUP ni USD (p. ej. MLC) — no se excluye
 *             silenciosamente: el filtro la ofrece como opción propia.
 * La equivalencia contable CUP de un cobro USD NO interviene (regla §3.1).
 */
export type SaleCurrencyClass = 'CUP' | 'USD' | 'MIXTA' | 'OTRA';

export function classifySaleByPayments(row: Pick<SaleRow, 'buckets'>): SaleCurrencyClass {
  const currencies = new Set<string>();
  for (const b of row.buckets || []) {
    if (Math.abs(Number(b.amount)) > 0 || Math.abs(Number(b.amount_cup)) > 0) currencies.add(normCur(b.currency));
  }
  if (currencies.size === 0) return 'CUP'; // sin cobros identificables → no rompe el filtro
  if (currencies.size > 1) return 'MIXTA';
  const only = [...currencies][0]!;
  if (only === 'CUP') return 'CUP';
  if (only === 'USD') return 'USD';
  return 'OTRA';
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN A · Conceptos del Resumen del Día
// ═══════════════════════════════════════════════════════════════════════════

/** Definición de cada concepto gobernable (orden del panel = orden lógico). */
export interface SummaryConceptDef {
  key: SummaryConceptKey;
  label: string;
  hint?: string;
}

export const SUMMARY_CONCEPTS: readonly SummaryConceptDef[] = [
  {
    key: 'saldoInicial',
    label: 'Saldo inicial / fondo de caja',
    hint: 'Saldo del libro de caja inmediatamente anterior al período — no cambia con la selección de ventas',
  },
  {
    key: 'resumenDia',
    label: 'Resumen del día (efectivo + transferencia)',
    hint: 'Ventas totales del período cobradas en la moneda de la hoja',
  },
  {
    key: 'ventasEfectivo',
    label: 'Ventas en efectivo',
    hint: 'Cobros en efectivo en la moneda de la hoja',
  },
  {
    key: 'ventasTransferencia',
    label: 'Ventas por transferencia',
  },
  {
    key: 'ventasZelle',
    label: 'Ventas por Zelle',
  },
  {
    key: 'equivalenciaCup',
    label: 'Equivalencia CUP de cobros en efectivo en otras monedas',
    hint: 'Consolidación contable — no es una segunda venta',
  },
  {
    key: 'egresosCaja',
    label: 'Egresos de caja (fondo y otros)',
    hint: 'Concepto independiente: no se recalcula al excluir ventas',
  },
] as const;

export type SummaryConceptKey = 'saldoInicial' | 'resumenDia' | 'ventasEfectivo' | 'ventasTransferencia' | 'ventasZelle' | 'equivalenciaCup' | 'egresosCaja';

export type SummaryConceptsSelection = Record<SummaryConceptKey, boolean>;

/** Todos activados: reproduce EXACTAMENTE el contenido actual del reporte. */
export const DEFAULT_SUMMARY_CONCEPTS: SummaryConceptsSelection = {
  saldoInicial: true,
  resumenDia: true,
  ventasEfectivo: true,
  ventasTransferencia: true,
  ventasZelle: true,
  equivalenciaCup: true,
  egresosCaja: true,
};

export const SUMMARY_CONCEPT_KEYS = Object.keys(DEFAULT_SUMMARY_CONCEPTS) as SummaryConceptKey[];

export function selectAllSummaryConcepts(): SummaryConceptsSelection {
  return { ...DEFAULT_SUMMARY_CONCEPTS };
}

export function deselectAllSummaryConcepts(): SummaryConceptsSelection {
  const out = {} as SummaryConceptsSelection;
  for (const k of SUMMARY_CONCEPT_KEYS) out[k] = false;
  return out;
}

/** ¿Hay al menos un concepto activo? (requisito para exportar el reporte) */
export function hasAnySummaryConcept(sel: SummaryConceptsSelection | null | undefined): boolean {
  if (!sel) return true;
  return SUMMARY_CONCEPT_KEYS.some(k => sel[k] === true);
}

/** ¿El usuario personalizó algo? (para metadatos del documento) */
export function isDefaultSummaryConcepts(sel: SummaryConceptsSelection | null | undefined): boolean {
  if (!sel) return true;
  return SUMMARY_CONCEPT_KEYS.every(k => sel[k] !== false);
}

// ── Persistencia (AISLADA POR TIENDA — misión §6) ───────────────────────────
// A diferencia de las claves globales preexistentes (plantilla/orientación/
// opciones de documento), la selección de CONCEPTOS se guarda POR TIENDA:
// cada tienda entrega un dinero distinto y su comprobante usa conceptos
// distintos; una preferencia compartida sobrescribiría la de otra tienda.
// Esquema v1: { [conceptKey]: boolean } validado clave a clave.

export const SUMMARY_CONCEPTS_LS_PREFIX = 'costpro:cash-report:summary-concepts:v1';

export function summaryConceptsLsKey(storeId: string | null | undefined): string {
  const scope = (storeId || '').trim() || 'sin-tienda';
  return `${SUMMARY_CONCEPTS_LS_PREFIX}:store:${scope}`;
}

export function loadSummaryConcepts(storeId: string | null | undefined): SummaryConceptsSelection {
  if (typeof window === 'undefined') return { ...DEFAULT_SUMMARY_CONCEPTS };
  try {
    const raw = window.localStorage.getItem(summaryConceptsLsKey(storeId));
    if (!raw) return { ...DEFAULT_SUMMARY_CONCEPTS };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_SUMMARY_CONCEPTS };
    const obj = parsed as Record<string, unknown>;
    const out = { ...DEFAULT_SUMMARY_CONCEPTS };
    for (const key of SUMMARY_CONCEPT_KEYS) {
      if (typeof obj[key] === 'boolean') out[key] = obj[key] as boolean;
    }
    return out;
  } catch {
    return { ...DEFAULT_SUMMARY_CONCEPTS };
  }
}

export function saveSummaryConcepts(storeId: string | null | undefined, sel: SummaryConceptsSelection): void {
  if (typeof window === 'undefined') return;
  try {
    const out: Record<string, boolean> = {};
    for (const key of SUMMARY_CONCEPT_KEYS) out[key] = sel[key] === true;
    window.localStorage.setItem(summaryConceptsLsKey(storeId), JSON.stringify(out));
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN B · Recomputación del split a partir de las ventas seleccionadas
// ═══════════════════════════════════════════════════════════════════════════

export interface SelectedSalesTotals {
  /** Split por moneda SOLO de las ventas seleccionadas (misma forma que
   *  report.sales_split: buckets nativos por moneda — nunca se mezclan). */
  split: SalesSplit;
  /** MISIÓN CORRECTIVA 2026-10-25: cobros en BILLETES por moneda de las
   *  seleccionadas (liquidación explícita cuando existe; buckets si no).
   *  Misma forma que report.sales_bills_split — alimenta el esperado. */
  billsSplit: Record<string, number>;
  /** Σ amount_cup de los buckets cash no-CUP de las seleccionadas (hoja CUP). */
  equivCashOtherCup: number;
  /** Σ amount_cup de los buckets transfer/zelle no-CUP de las seleccionadas. */
  equivVoucherOtherCup: number;
  /** Grupos (método × moneda) de las seleccionadas — misma forma que
   *  report.sales: reemplazan a los grupos cuando hay selección activa. */
  groups: Array<{ payment_method: string; currency: string; transaction_count: number; total: number; total_cup: number }>;
  includedCount: number;
  totalCount: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Recomputa el split por moneda (y las equivalencias canónicas) a partir de
 * las buckets de las ventas seleccionadas. MISMA semántica que la ruta:
 * accumulateSalesSplit + equiv de los grupos — aquí operando por fila para
 * poder excluir ventas individuales sin un segundo algoritmo de clasificación.
 *
 * `excluded` son los ids DESELECCIONADOS (default = todo seleccionado), para
 * que el estado natural reproduzca el comportamiento actual.
 */
export function computeSelectedSalesTotals(
  rows: readonly SaleRow[] | null | undefined,
  excluded: ReadonlySet<string> | null | undefined,
): SelectedSalesTotals {
  const list = rows || [];
  const excl = excluded || new Set<string>();
  const split: Record<string, { cash: number; transfer: number; zelle: number; mixedUnsplit: number; total: number }> = {};
  const billsSplit: Record<string, number> = {};
  const groups = new Map<string, { payment_method: string; currency: string; transaction_count: number; total: number; total_cup: number }>();
  let equivCash = 0;
  let equivVoucher = 0;
  let included = 0;

  // Las monedas de las hojas del modelo SIEMPRE presentes (aunque queden a 0):
  // evita que computeDailySummary caiga a la vía payment-totals (no ajustada)
  // cuando la selección vacía una moneda completa.
  for (const cur of ['CUP', 'USD']) {
    split[cur] = { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 };
    billsSplit[cur] = 0;
  }

  for (const row of list) {
    if (excl.has(row.id)) continue;
    included += 1;
    // MISIÓN CORRECTIVA: cobros en BILLETES (vista física del ledger) — la
    // liquidación explícita manda; sin ella, el bucket cash de la moneda
    // (coincide con la vista de valor legada). Misma regla que la ruta usa
    // para sales_bills_split: UNA fuente, sin algoritmo paralelo.
    const bills = saleBillsByCurrency(row.settlement);
    if (bills) {
      for (const [cur, net] of Object.entries(bills)) {
        billsSplit[cur] = (billsSplit[cur] || 0) + net;
      }
    } else {
      for (const b of row.buckets || []) {
        if (b.method !== 'cash') continue;
        const cur = normCur(b.currency);
        const amount = num(b.amount);
        if (!(Math.abs(amount) > 0.005)) continue;
        billsSplit[cur] = (billsSplit[cur] || 0) + amount;
      }
    }
    for (const b of row.buckets || []) {
      const cur = normCur(b.currency);
      const amount = num(b.amount);
      const amountCup = num(b.amount_cup);
      if (!(Math.abs(amount) > 0.005) && !(Math.abs(amountCup) > 0.005)) continue;
      if (!split[cur]) split[cur] = { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 };
      const method = (b.method === 'transfer' || b.method === 'zelle') ? b.method : 'cash';
      split[cur][method] += amount;
      split[cur].total += amount;
      const gKey = `${method}|${cur}`;
      const g = groups.get(gKey) ?? { payment_method: method, currency: cur, transaction_count: 0, total: 0, total_cup: 0 };
      g.transaction_count += 1;
      g.total += amount;
      g.total_cup += amountCup;
      groups.set(gKey, g);
      // Equivalencias canónicas (regla 2): SOLO cobros en OTRA moneda; la de
      // efectivo alimenta el esperado de la hoja CUP; la de vouchers es
      // informativa. Jamás entran a las filas de venta (split[cur].*).
      if (cur !== 'CUP') {
        if (method === 'cash') equivCash += amountCup;
        else equivVoucher += amountCup;
      }
    }
  }

  return {
    split: split as SalesSplit,
    billsSplit,
    equivCashOtherCup: equivCash,
    equivVoucherOtherCup: equivVoucher,
    groups: [...groups.values()].sort((a, b) => a.payment_method.localeCompare(b.payment_method) || a.currency.localeCompare(b.currency)),
    includedCount: included,
    totalCount: list.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Reporte AJUSTADO a la selección (única mutación de presentación que ven
// pantalla, PDF y Excel: los cálculos existentes operan sobre este objeto)
// ═══════════════════════════════════════════════════════════════════════════

export interface SelectionAdjustedReport<T> {
  /** Reporte con sales/sales_split/equivs de las ventas seleccionadas (el
   *  ORIGINAL intacto cuando no hay selección activa). */
  report: T;
  /** true ⇔ hay filas de venta Y al menos una excluida. */
  selectionActive: boolean;
  totals: SelectedSalesTotals;
  /** Filas de venta disponibles (vacío ⇔ selección no disponible en este
   *  entorno — fallback al comportamiento previo). */
  rows: readonly SaleRow[];
}

/**
 * Construye el reporte ajustado: sustituye SOLO los campos derivados de las
 * ventas (sales, sales_split, equivalencias, cobros en billetes) por los
 * recalculados con el conjunto seleccionado. Pagos, comisiones, egresos de
 * caja, reembolsos y ajustes quedan INTACTOS (regla §4: egresos independientes
 * de la selección); el SALDO INICIAL también queda intacto (misión correctiva
 * §7: no cambia al seleccionar o excluir ventas).
 */
export function buildSelectionAdjustedReport<T extends {
  sales?: Array<{ payment_method: string; currency: string; transaction_count?: number; total: number; total_cup?: number }>;
  sales_split?: SalesSplit;
  sales_equiv_cash_other_cup?: number;
  sales_equiv_voucher_other_cup?: number;
  sales_bills_split?: Partial<Record<string, number>>;
}>(base: T, rows: readonly SaleRow[] | null | undefined, excluded: ReadonlySet<string> | null | undefined): SelectionAdjustedReport<T> {
  const list = rows || [];
  if (list.length === 0 || !excluded || excluded.size === 0) {
    return {
      report: base,
      selectionActive: false,
      totals: computeSelectedSalesTotals(list, new Set<string>()),
      rows: list,
    };
  }
  const totals = computeSelectedSalesTotals(list, excluded);
  return {
    report: {
      ...base,
      sales: totals.groups,
      sales_split: totals.split,
      sales_equiv_cash_other_cup: totals.equivCashOtherCup,
      sales_equiv_voucher_other_cup: totals.equivVoucherOtherCup,
      sales_bills_split: totals.billsSplit,
    } as T,
    selectionActive: true,
    totals,
    rows: list,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tabla por producto del conjunto seleccionado (PDF/Excel — SECCIÓN 2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recalcula la tabla por producto de las ventas seleccionadas con la MISMA
 * función del servidor (buildItemsSummary) — misma clasificación, mismos
 * repartos, sin algoritmo paralelo. Devuelve la MISMA forma que
 * GET /api/cash-report/items-summary (los builders la consumen igual).
 */
export function buildItemsSummaryForSales(rows: readonly SaleRow[]): Record<string, unknown> {
  const input: Array<{ item: CollectionItem; tx: CollectionTx; txId: string; payments?: LedgerPayment[] }> = [];
  for (const row of rows) {
    for (const item of row.items || []) {
      input.push({
        item,
        tx: row.tx ?? { id: row.id },
        txId: row.id,
        payments: row.payments,
      });
    }
  }
  const { items, totals } = buildItemsSummary(input);
  const result = items.map(p => ({
    ...p,
    unit_price: p.total_quantity > 0 ? p.total_cup / p.total_quantity : 0,
    currency: 'CUP',
    cash_paid: p.cash_cup,
    transfer_paid: p.transfer_cup,
    zelle_paid: p.zelle_cup,
  }));
  return {
    items: result,
    total_cup: totals.total_cup,
    total_cash: totals.cash_cup,
    total_transfer: totals.transfer_cup,
    total_zelle: totals.zelle_cup,
    total_quantity: totals.total_quantity,
    total_qty_cup: totals.qty_cup,
    total_qty_usd: totals.qty_usd,
    cash_cup: totals.cash_cup,
    transfer_cup: totals.transfer_cup,
    zelle_cup: totals.zelle_cup,
    cash_usd: totals.cash_usd,
    transfer_usd: totals.transfer_usd,
    zelle_usd: totals.zelle_usd,
    usd_total: totals.usd_total,
    count: result.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilidades de presentación para la tabla «Ventas por Método»
// ═══════════════════════════════════════════════════════════════════════════

/** Grupo visible de la tabla: (método, moneda) con selección aplicada. */
export interface SalesMethodGroup {
  key: string;
  method: string;
  currency: string;
  /** Importes SOLO de las ventas seleccionadas (por componente, sin mezclar). */
  selectedBuckets: Array<{ method: string; currency: string; amount: number }>;
  selectedTotal: number;
  includedCount: number;
  totalCount: number;
  rows: SaleRow[];
}

export function buildSalesMethodGroups(
  rows: readonly SaleRow[],
  excluded: ReadonlySet<string>,
): SalesMethodGroup[] {
  const map = new Map<string, SalesMethodGroup & { selectedByBucket: Map<string, number> }>();
  for (const row of rows) {
    for (const b of row.buckets || []) {
      const method = (b.method === 'transfer' || b.method === 'zelle') ? b.method : 'cash';
      const currency = normCur(b.currency);
      const key = `${method}|${currency}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key, method, currency,
          selectedBuckets: [],
          selectedTotal: 0,
          includedCount: 0,
          totalCount: 0,
          rows: [],
          selectedByBucket: new Map<string, number>(),
        };
        map.set(key, g);
      }
      if (!g.rows.includes(row)) g.rows.push(row);
    }
  }
  const out: SalesMethodGroup[] = [];
  for (const g of map.values()) {
    for (const row of g.rows) {
      g.totalCount += 1;
      if (excluded.has(row.id)) continue;
      g.includedCount += 1;
      for (const b of row.buckets || []) {
        const method = (b.method === 'transfer' || b.method === 'zelle') ? b.method : 'cash';
        const currency = normCur(b.currency);
        if (method !== g.method || currency !== g.currency) continue;
        const amount = num(b.amount);
        g.selectedTotal += amount;
        const bk = `${method}|${currency}`;
        g.selectedByBucket.set(bk, (g.selectedByBucket.get(bk) || 0) + amount);
      }
    }
    g.selectedBuckets = [...g.selectedByBucket.entries()].map(([k, amount]) => {
      const [method, currency] = k.split('|');
      return { method, currency, amount };
    });
    const { selectedByBucket, ...rest } = g;
    void selectedByBucket;
    out.push(rest);
  }
  return out.sort((a, b) => a.method.localeCompare(b.method) || a.currency.localeCompare(b.currency));
}

/** Etiqueta legible de un método (espeja methodLabel del módulo PDF). */
export function selectionMethodLabel(m: string): string {
  return m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle';
}
