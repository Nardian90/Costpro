/**
 * MISIÓN CAJA v2.24.0 (§7) — Libro mayor de caja: los movimientos que
 * explican el saldo.
 *
 * Reglas de la misión:
 *   · El saldo debe poder reconstruirse a partir de movimientos PERSISTIDOS
 *     (nada de saldos calculados solo en el frontend).
 *   · El saldo histórico a fecha de corte se reconstruye respetando las
 *     fechas efectivas/operativas — no se reutiliza el saldo actual.
 *   · Las transferencias NO son efectivo físico (no entran al libro).
 *   · CUP y USD conservan saldos físicos separados; el canónico CUP es el
 *     equivalente contable (identificado como tal).
 *   · Los anulados aportan fila original + contra ⇒ neto cero (el ledger manda).
 *   · Los movimientos informativos (apertura/cierre) no alteran el saldo.
 */

export type CashLedgerCurrency = 'CUP' | 'USD';

export type CashLedgerMovementType =
  | 'venta_efectivo'
  | 'vuelto_venta'
  | 'anticipo_produccion'
  | 'pago_proveedor'
  | 'comision'
  | 'ingreso_caja'
  | 'egreso_caja'
  | 'entrega_efectivo'
  | 'reembolso_devolucion'
  | 'ajuste_caja'
  | 'apertura_turno'
  | 'cierre_turno';

export interface CashLedgerRowInput {
  /** Identificador único entre fuentes (prefijo por fuente). */
  id: string;
  /** Fecha contable de ordenación (ISO). */
  effective_at: string;
  /** Fecha operativa (YYYY-MM-DD). */
  operational_date: string;
  movement_type: CashLedgerMovementType;
  movement_label: string;
  /** Moneda nativa del movimiento físico. */
  currency: CashLedgerCurrency;
  /** Importe nativo SIEMPRE positivo; el sentido lo da movement_type. */
  amount_native: number;
  /** Equivalente canónico CUP con signo contable (+ entrada / − salida). */
  amount_cup_signed: number;
  reference: string | null;
  description: string;
  user_name: string | null;
  status: string;
  origin_view: string;
  origin_id: string;
}

export interface CashLedgerRow extends CashLedgerRowInput {
  direction: 'in' | 'out' | 'info';
  entry_cup: number;
  exit_cup: number;
  entry_usd: number;
  exit_usd: number;
  /** Saldo físico CUP resultante tras el movimiento (corrida contable). */
  balance_cup: number;
  /** Saldo físico USD resultante tras el movimiento. */
  balance_usd: number;
}

export interface CashLedgerOpening {
  cup: number;
  usd: number;
}

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

const IN_TYPES: ReadonlySet<string> = new Set([
  'venta_efectivo', 'anticipo_produccion', 'ingreso_caja',
]);
const INFO_TYPES: ReadonlySet<string> = new Set(['apertura_turno', 'cierre_turno']);

const MOVEMENT_LABELS: Record<CashLedgerMovementType, string> = {
  venta_efectivo: 'Venta en efectivo',
  vuelto_venta: 'Vuelto de venta',
  anticipo_produccion: 'Anticipo producción/trabajo',
  pago_proveedor: 'Pago a proveedor (efectivo)',
  comision: 'Comisión pagada (efectivo)',
  ingreso_caja: 'Ingreso de caja',
  egreso_caja: 'Egreso de caja',
  entrega_efectivo: 'Entrega de efectivo',
  reembolso_devolucion: 'Reembolso de devolución',
  ajuste_caja: 'Ajuste de caja',
  apertura_turno: 'Apertura de turno',
  cierre_turno: 'Cierre de turno',
};

export function movementLabel(type: string): string {
  return MOVEMENT_LABELS[type as CashLedgerMovementType] ?? type;
}

/** Orden contable canónico: fecha efectiva, desempate por id (orden estable). */
function compareRows(a: CashLedgerRowInput, b: CashLedgerRowInput): number {
  const t = a.effective_at.localeCompare(b.effective_at);
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

/**
 * Construye el libro mayor: resuelve entrada/salida por moneda y calcula el
 * saldo corrido (físico CUP y físico USD) a partir del saldo de apertura.
 * La corrida SIEMPRE usa el conjunto completo y ordenado — los filtros de
 * visualización se aplican DESPUÉS (applyLedgerDisplayFilters) para que el
 * saldo resultante de cada fila siga siendo el real.
 */
export function buildCashLedger(
  rows: CashLedgerRowInput[],
  opening: CashLedgerOpening,
): { rows: CashLedgerRow[]; totals: { entry_cup: number; exit_cup: number; entry_usd: number; exit_usd: number } } {
  const ordered = [...rows].sort(compareRows);
  let balCup = r2(opening.cup);
  let balUsd = r2(opening.usd);
  const totals = { entry_cup: 0, exit_cup: 0, entry_usd: 0, exit_usd: 0 };

  const out: CashLedgerRow[] = ordered.map((r) => {
    const isInfo = INFO_TYPES.has(r.movement_type);
    const isIn = IN_TYPES.has(r.movement_type);
    const direction: CashLedgerRow['direction'] = isInfo ? 'info' : isIn ? 'in' : 'out';
    const native = Math.abs(Number(r.amount_native) || 0);

    let entryCup = 0;
    let exitCup = 0;
    let entryUsd = 0;
    let exitUsd = 0;

    if (!isInfo) {
      if (r.currency === 'CUP') {
        if (isIn) { entryCup = native; balCup = r2(balCup + native); }
        else { exitCup = native; balCup = r2(balCup - native); }
      } else {
        if (isIn) { entryUsd = native; balUsd = r2(balUsd + native); }
        else { exitUsd = native; balUsd = r2(balUsd - native); }
      }
      totals.entry_cup = r2(totals.entry_cup + entryCup);
      totals.exit_cup = r2(totals.exit_cup + exitCup);
      totals.entry_usd = r2(totals.entry_usd + entryUsd);
      totals.exit_usd = r2(totals.exit_usd + exitUsd);
    }

    return {
      ...r,
      amount_native: native,
      amount_cup_signed: r2(r.amount_cup_signed),
      direction,
      entry_cup: entryCup,
      exit_cup: exitCup,
      entry_usd: entryUsd,
      exit_usd: exitUsd,
      balance_cup: balCup,
      balance_usd: balUsd,
    };
  });

  return { rows: out, totals };
}

export interface LedgerDisplayFilters {
  currency?: 'all' | CashLedgerCurrency;
  movementType?: 'all' | CashLedgerMovementType;
  userName?: string | null;
  referenceQuery?: string | null;
  /** Estado por fuente ('completed'|'confirmado'|'anulado'…). */
  status?: string | null;
}

/**
 * Filtros de VISUALIZACIÓN (no alteran los saldos corridos ya calculados).
 * La misión exige que filtrar no destruya la explicación del saldo: cada fila
 * conserva el saldo real que tenía en la corrida completa.
 */
export function applyLedgerDisplayFilters(
  rows: CashLedgerRow[],
  f: LedgerDisplayFilters,
): CashLedgerRow[] {
  const q = f.referenceQuery?.trim().toLowerCase() ?? '';
  return rows.filter((r) => {
    if (f.currency && f.currency !== 'all' && r.currency !== f.currency) return false;
    if (f.movementType && f.movementType !== 'all' && r.movement_type !== f.movementType) return false;
    if (f.userName && r.user_name !== f.userName) return false;
    if (f.status && r.status !== f.status) return false;
    if (q) {
      const hay = `${r.reference ?? ''} ${r.description} ${r.movement_label}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Reconstrucción del saldo histórico a fecha de corte (misión §7): la suma de
 * los movimientos VÁLIDOS con fecha efectiva ≤ as_of, partiendo del saldo
 * anterior a la ventana. Devuelve también la última fila ≤ as_of por si la UI
 * quiere mostrar el detalle.
 */
export function balanceAtCutoff(
  rows: CashLedgerRow[],
  asOf: string,
  opening?: CashLedgerOpening,
): { cup: number; usd: number; lastRow: CashLedgerRow | null } {
  const cut = new Date(asOf).getTime();
  let last: CashLedgerRow | null = null;
  for (const r of rows) {
    if (new Date(r.effective_at).getTime() <= cut) last = r;
    else break;
  }
  return {
    cup: last?.balance_cup ?? r2(opening?.cup ?? 0),
    usd: last?.balance_usd ?? r2(opening?.usd ?? 0),
    lastRow: last,
  };
}

/**
 * REVISIÓN FINAL v2.24.1 — Saldo vigente del libro por moneda.
 *
 * La fuente AUTORITATIVA es el neto del RPC get_cash_currency_summary (única
 * fuente de verdad del libro físico). La corrida local del ledger puede venir
 * TRUNCADA por los límites de consulta (p.limit por fuente): usar el último
 * saldo corrido solo como FALLBACK cuando el RPC no esté disponible, y
 * reportar `reconciled` para que la UI distinga ambas situaciones.
 */
export function resolveBalanceNow(args: {
  walkLast: Pick<CashLedgerRow, 'balance_cup' | 'balance_usd'> | null;
  opening: CashLedgerOpening;
  summaryNowNet: { CUP: number; USD: number } | null;
}): { cup: number; usd: number; reconciled: boolean } {
  const net = args.summaryNowNet;
  if (net && (net.CUP != null || net.USD != null)) {
    return {
      cup: r2(Number(net.CUP ?? 0)),
      usd: r2(Number(net.USD ?? 0)),
      reconciled: true,
    };
  }
  return {
    cup: r2(Number(args.walkLast?.balance_cup ?? args.opening?.cup ?? 0)),
    usd: r2(Number(args.walkLast?.balance_usd ?? args.opening?.usd ?? 0)),
    reconciled: false,
  };
}

/** REVISIÓN FINAL v2.24.1: el corte ANTERIOR al inicio de la ventana no puede
 *  reconstruirse con la corrida local (esta empieza en `from`) — el route debe
 *  pedir el neto autoritativo al RPC hasta as_of. true ⇒ usar RPC. */
export function cutoffNeedsSummary(asOf: string | undefined, from: string): boolean {
  if (!asOf) return false;
  const t = new Date(asOf).getTime();
  const f = new Date(from).getTime();
  if (Number.isNaN(t) || Number.isNaN(f)) return false;
  return t < f;
}
