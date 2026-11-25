/**
 * CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — FASE 2/4.
 *
 * Utilidades compartidas del guard de pagos vivos: un documento (recepción o
 * servicio) con pagos confirmados/aplicados NO puede anularse/revertirse ni
 * devolverse sin resolver antes cada pago con el procedimiento oficial de
 * reversión (POST /api/payments/[id] → RPC reverse_supplier_payment).
 *
 * Aquí viven las dos mitades cliente del guard:
 *  · fetchDocumentPayments + computeLivePayments: pre-chequeo de la UI antes
 *    de abrir el diálogo de anulación (experiencia guiada, no error seco).
 *  · parseUnresolvedPaymentsError: parseo del error del RPC (backstop
 *    server-side: ERR_*_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=N importe_vivo=X
 *    total_documento=T saldo_actual=S — ...) para mostrar guía accionable
 *    aunque la carrera cliente/servidor cambie el estado entre ambos.
 */

export type PayableDocRefType = 'receipt' | 'service';

/** Fila de payment_transactions tal como la devuelve GET /api/payments (select *). */
export interface DocumentPaymentRow {
  id: string;
  amount: number | string;
  amount_cup: number | string;
  currency?: string | null;
  payment_method?: string | null;
  payment_date: string;
  reference?: string | null;
  notes?: string | null;
  direction?: string | null;
  reverses_payment_id?: string | null;
}

export interface LivePaymentsSummary {
  /** Filas originales (direction='in') sin contra-fila de reversión. */
  liveCount: number;
  /** Σ amount_cup de los pagos vivos (CUP). */
  liveTotalCup: number;
  /** Pagado neto (in − reversals) en CUP — concilia con paid_amount del documento. */
  netPaidCup: number;
  /** Filas vivas para listar en el diálogo (orden cronológico). */
  liveRows: DocumentPaymentRow[];
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Descarga las filas de pago del documento (canal autenticado por sesión). */
export async function fetchDocumentPayments(
  refType: PayableDocRefType,
  refId: string,
  storeId: string,
): Promise<DocumentPaymentRow[]> {
  const { apiFetch } = await import('@/lib/api-fetch');
  const data = await apiFetch(
    `/api/payments?ref_type=${encodeURIComponent(refType)}&ref_id=${encodeURIComponent(refId)}&store_id=${encodeURIComponent(storeId)}`,
  );
  return Array.isArray(data) ? (data as DocumentPaymentRow[]) : [];
}

/**
 * Clasifica las filas de pago de un documento en vivas vs revertidas y
 * calcula los totales del guard. Regla idéntica a la del RPC (misión §4.2):
 * viva = direction='in' (o NULL, legado) SIN contra-fila reversal.
 */
export function computeLivePayments(rows: DocumentPaymentRow[]): LivePaymentsSummary {
  const reversedOriginalIds = new Set(
    rows.filter(r => r.direction === 'reversal' && r.reverses_payment_id).map(r => r.reverses_payment_id as string),
  );
  const liveRows = rows
    .filter(r => (r.direction ?? 'in') === 'in' && !reversedOriginalIds.has(r.id))
    .sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
  const netPaidCup = rows.reduce(
    (s, r) => s + ((r.direction ?? 'in') === 'reversal' ? -1 : 1) * num(r.amount_cup),
    0,
  );
  return {
    liveCount: liveRows.length,
    liveTotalCup: liveRows.reduce((s, r) => s + num(r.amount_cup), 0),
    netPaidCup,
    liveRows,
  };
}

export interface UnresolvedPaymentsErrorDetail {
  code: 'ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS' | 'ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS';
  docKind: 'receipt' | 'service';
  liveCount: number;
  liveTotalCup: number;
  totalDocumento: number;
  saldoActual: number;
}

/**
 * Parsea el error del guard del RPC. Formato del mensaje (PL/pgSQL):
 *   ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=2 importe_vivo=1800.00
 *   total_documento=1800.00 saldo_actual=0.00 — ...
 * Devuelve null si el error no es del guard (los demás flujos siguen su curso).
 * Acepta string, Error o objeto plano tipo PostgrestError ({message}).
 */
export function parseUnresolvedPaymentsError(message: unknown): UnresolvedPaymentsErrorDetail | null {
  const raw = typeof message === 'string'
    ? message
    : message instanceof Error
      ? message.message
      : typeof (message as { message?: unknown } | null)?.message === 'string'
        ? ((message as { message: string }).message)
        : '';
  const msg = raw;
  const m = msg.match(/ERR_(RECEIPT|SERVICE)_HAS_UNRESOLVED_PAYMENTS/);
  if (!m) return null;
  const pick = (key: string): number => {
    const km = msg.match(new RegExp(`${key}=([0-9]+(?:\\.[0-9]+)?)`));
    return km ? Number(km[1]) : 0;
  };
  return {
    code: `ERR_${m[1]}_HAS_UNRESOLVED_PAYMENTS` as UnresolvedPaymentsErrorDetail['code'],
    docKind: m[1].toLowerCase() as 'receipt' | 'service',
    liveCount: pick('pagos_vivos'),
    liveTotalCup: pick('importe_vivo'),
    totalDocumento: pick('total_documento'),
    saldoActual: pick('saldo_actual'),
  };
}

/** Etiquetas de método de pago (canónicas CP-FIN-004 + heredado zelle). */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  zelle: 'Transf. Exterior',
  external_transfer: 'Transf. Exterior',
};
