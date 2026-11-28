/**
 * payments-selection.ts — SELECCIÓN DE PAGOS DEL REPORTE ENTREGA
 * (MISIÓN COSTPRO-SRV-PAYMENT-DATE-AND-DELIVERY-REPORT-FILTERS-001 · FASE 2).
 *
 * Espejo EXACTO de la selección de ventas (report-selection.ts · FUNCIÓN B)
 * para la sección «C. Pagos efectivamente realizados · Proveedores»:
 *
 *   · Cada pago (payment_transactions ref_type receipt|service, dirección
 *     'in', documento fuente VÁLIDO) dispone de checkbox individual.
 *   · Los pagos DESMARCADOS permanecen visibles en pantalla pero NO participan
 *     en el cuadre del reporte ni aparecen en el PDF/Excel/Word.
 *   · Checkbox de selección general (todos/ninguno) con estado INDETERMINADO
 *     cuando la selección es parcial (el componente de vista lo refleja).
 *
 * MECANISMO (misma disciplina que buildSelectionAdjustedReport):
 * CAPA DE PRESENTACIÓN sobre las fuentes existentes. El RPC get_cash_report
 * entrega los grupos `payments` (payment_method × currency × ref_type con
 * payment_count / total / total_cup — migración 20261124120200, solo filas
 * direction='in' de documentos válidos). La vista conoce las filas INDIVIDUALES
 * por grupo (GET /api/cash-report/details — misma ventana de negocio y la MISMA
 * elegibilidad que el RPC). La exclusión es un DELTA exacto sobre SU grupo:
 * restar una fila nunca depende de filas no cargadas, porque solo se pueden
 * desmarcar filas visibles y cada fila pertenece a exactamente un grupo.
 *
 * CONTRATO CONTABLE (intocable):
 *   · Presentación pura: NUNCA altera saldos, el libro de caja ni registros.
 *   · El SALDO INICIAL no cambia al seleccionar o desmarcar pagos.
 *   · Reversiones (direction='reversal') NO son seleccionables: el grupo del
 *     RPC no las incluye (son ENTRADAS — `payment_reversals`) y el delta de
 *     una reversión sobre un grupo de salidas sería contablemente falso.
 *   · Comisiones y Órdenes de Producción/Servicios conservan su comportamiento
 *     (fuera del alcance de esta selección — se documentó en la misión).
 */

/** Fila individual de pago conocida por la vista (source: /api/cash-report/details). */
export interface PaymentSelectionRow {
  id: string;
  ref_type: string;
  payment_method: string;
  currency: string;
  /** Importe en la moneda NATIVA del pago (misma convención del RPC: SUM(amount)). */
  amount: number;
  /** Equivalencia canónica CUP (SUM(amount_cup) del RPC; para CUP == amount). */
  amount_cup: number;
  /** Dirección del movimiento. Solo 'in' (o ausente — legacy) es seleccionable. */
  direction?: string | null;
}

/** Grupo `payments` con la misma forma que entrega el RPC get_cash_report. */
export interface PaymentsGroup {
  payment_method: string;
  currency: string;
  ref_type: string;
  payment_count: number;
  total: number;
  total_cup?: number | null;
}

export interface SelectedPaymentsTotals {
  /** Grupos AJUSTADOS (los grupos del RPC menos los deltas de los excluidos). */
  groups: PaymentsGroup[];
  /** Filas conocidas por la vista (cargadas en acordeones expandidos). */
  knownRows: number;
  /** Filas seleccionadas (conocidas − excluidas). */
  includedRows: number;
  /** Σ payment_count de los grupos ajustados — universo completo del período. */
  paymentCountIncluded: number;
  /** Σ payment_count de los grupos originales del RPC. */
  paymentCountTotal: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Clave estable de grupo (method × currency × ref_type) — igual que el RPC. */
export function paymentGroupKey(payment_method: string, currency: string, ref_type: string): string {
  return `${payment_method}|${String(currency).toUpperCase()}|${ref_type}`;
}

/**
 * Elegibilidad de selección de una fila de pago: id presente, ref_type de
 * proveedor (receipt|service) y dirección 'in' (o ausente en fuentes legacy).
 * Las reversiones y otros ref_types NUNCA son seleccionables (contrato arriba).
 */
export function isSelectablePaymentRow(row: Partial<PaymentSelectionRow> | null | undefined): row is PaymentSelectionRow {
  if (!row || typeof row.id !== 'string' || row.id.length === 0) return false;
  if (row.ref_type !== 'receipt' && row.ref_type !== 'service') return false;
  const dir = row.direction === undefined || row.direction === null ? 'in' : String(row.direction);
  if (dir !== 'in') return false;
  return true;
}

/** Estado por documento fuente (received_services/receipts) para la elegibilidad del detalle. */
export interface SourceDocStatuses {
  serviceStatusById: ReadonlyMap<string, string>;
  receiptStatusById: ReadonlyMap<string, string>;
}

/**
 * MISIÓN SRV-PAYMENT-DATE (FASE 2): filtra las filas de detalle de pago con la
 * MISMA elegibilidad que el grupo `payments` del RPC get_cash_report
 * (migración 20261124120200): direction='in' + documento fuente VÁLIDO
 * (received_services: status NOT IN voided/cancelled · receipts: status NOT IN
 * voided/reversed). Así el acordeón (pantalla y detalle del PDF) es EXACTAMENTE
 * el universo que suma el grupo y el DELTA de la selección es exacto.
 * Los ref_types ajenos (p. ej. production_order vía el mismo endpoint) pasan
 * sin filtrado (fuera del alcance de la selección de proveedores).
 */
export function filterEligiblePaymentDetailRows<T extends Record<string, unknown>>(
  rows: readonly T[] | null | undefined,
  docs: SourceDocStatuses,
): T[] {
  const list = rows || [];
  const byDirection = list.filter(r => {
    const dir = r.direction === undefined || r.direction === null ? 'in' : String(r.direction);
    return dir === 'in';
  });
  return byDirection.filter(r => {
    const refType = String(r.ref_type ?? '');
    if (refType === 'service') {
      const status = docs.serviceStatusById.get(String(r.ref_id ?? ''));
      return status !== undefined && status !== 'voided' && status !== 'cancelled';
    }
    if (refType === 'receipt') {
      const status = docs.receiptStatusById.get(String(r.ref_id ?? ''));
      return status !== undefined && status !== 'voided' && status !== 'reversed';
    }
    return true;
  });
}

/**
 * Grupos AJUSTADOS: cada grupo del RPC menos los deltas de sus filas excluidas.
 * Un grupo sin filas incluidas se elimina (sin título ni total huérfano — misma
 * regla que los conceptos del Resumen). Los grupos sin exclusiones quedan
 * INTACTOS (mismo objeto: cero riesgo de desviación de redondeo).
 */
export function buildPaymentsAdjustedGroups(
  baseGroups: readonly PaymentsGroup[] | null | undefined,
  rows: readonly PaymentSelectionRow[] | null | undefined,
  excluded: ReadonlySet<string> | null | undefined,
): { groups: PaymentsGroup[]; knownRows: number; includedRows: number } {
  const list = rows || [];
  const excl = excluded || new Set<string>();
  const selectable = list.filter(isSelectablePaymentRow);
  const excludedRows = selectable.filter(r => excl.has(r.id));

  if (excludedRows.length === 0) {
    return {
      groups: [...(baseGroups || [])],
      knownRows: selectable.length,
      includedRows: selectable.length,
    };
  }

  // Deltas por grupo: una fila excluida pertenece a EXACTAMENTE un grupo.
  const deltas = new Map<string, { payment_count: number; total: number; total_cup: number }>();
  for (const r of excludedRows) {
    const k = paymentGroupKey(r.payment_method, r.currency, r.ref_type);
    const d = deltas.get(k) ?? { payment_count: 0, total: 0, total_cup: 0 };
    d.payment_count += 1;
    d.total += num(r.amount);
    d.total_cup += num(r.amount_cup);
    deltas.set(k, d);
  }

  const groups: PaymentsGroup[] = [];
  for (const g of baseGroups || []) {
    const d = deltas.get(paymentGroupKey(g.payment_method, g.currency, g.ref_type));
    if (!d) { groups.push(g); continue; }
    const count = num(g.payment_count) - d.payment_count;
    if (count > 0) {
      groups.push({
        ...g,
        payment_count: count,
        total: num(g.total) - d.total,
        total_cup: g.total_cup === undefined || g.total_cup === null
          ? g.total_cup
          : num(g.total_cup) - d.total_cup,
      });
    }
    // count <= 0 → grupo completo desmarcado: se OMITE (sin fila huérfana).
  }

  return {
    groups,
    knownRows: selectable.length,
    includedRows: selectable.length - excludedRows.length,
  };
}

export interface PaymentsAdjustedReport<T> {
  /** Reporte con `payments` sustituido por los grupos ajustados (el ORIGINAL
   *  intacto — misma referencia — cuando no hay pagos desmarcados). */
  report: T;
  /** true ⇔ hay al menos un pago desmarcado. */
  selectionActive: boolean;
  totals: SelectedPaymentsTotals;
  /** Filas conocidas por la vista (fuente de los checkboxes). */
  rows: readonly PaymentSelectionRow[];
}

/**
 * Construye el reporte ajustado a la selección de pagos. Los campos derivados
 * de VENTAS, comisiones, reversiones, ajustes y saldo inicial quedan INTACTOS
 * (el resumen consume este objeto con la MISMA fórmula única computeDailySummary).
 */
export function buildPaymentsAdjustedReport<T extends { payments?: PaymentsGroup[] }>(
  base: T,
  rows: readonly PaymentSelectionRow[] | null | undefined,
  excluded: ReadonlySet<string> | null | undefined,
): PaymentsAdjustedReport<T> {
  const { groups, knownRows, includedRows } = buildPaymentsAdjustedGroups(base?.payments, rows, excluded);
  const selectionActive = (excluded?.size ?? 0) > 0;
  const baseList = (base?.payments || []) as readonly PaymentsGroup[];
  return {
    report: (selectionActive ? { ...base, payments: groups } : base) as T,
    selectionActive,
    totals: {
      groups,
      knownRows,
      includedRows,
      paymentCountIncluded: groups.reduce((s, g) => s + num(g.payment_count), 0),
      paymentCountTotal: baseList.reduce((s, g) => s + num(g.payment_count), 0),
    },
    rows: rows || [],
  };
}
