/**
 * payment-components.ts — MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24).
 *
 * Construye el desglose REAL por moneda de los pagos de una venta a partir
 * de las filas de pago del carrito (payments[] por ítem):
 *
 *   [{ method: 'cash'|'transfer'|'external_transfer', currency: 'CUP'|'USD', amount }]
 *
 * Los importes son ORIGINALES (sin convertir): 5 USD + 15 000 CUP viajan
 * como DOS componentes, no como un pool canónico CUP. El servidor
 * (create_sale_v2 §13.7) los valida, resuelve la tasa USD de la operación
 * con su jerarquía autoritativa y persiste UNA FILA de payment_transactions
 * POR COMPONENTE con su moneda real y la tasa persistida.
 *
 * Regla de envío (usePOSCheckout): los componentes viajan SIEMPRE que la
 * venta tiene al menos un componente en USD de método cash/transfer —
 * exactamente los cobros mixtos que el pool canónico CUP no puede
 * representar. Las ventas CUP puras y las ventas de Transf. Exterior puras
 * conservan el flujo previo (blast radius mínimo).
 *
 * Normalización:
 *   - Las filas se agrupan por (método, moneda) y se suman (2 filas cash USD
 *     → un componente).
 *   - Importes ≤ 0.005 se descartan (filas en edición).
 *   - Redondeo a 2 decimales (regla de redondeo única del módulo).
 *   - La Transf. Exterior se declara en su moneda de fila (riel de divisa
 *     por diseño); si una fila legada declara otra moneda se reporta tal
 *     cual y el servidor la rechaza (fail-closed ERR_PAYMENT_COMPONENTS_INVALID).
 *
 * CP-FIN-004 (2026-11-20): el método canónico del exterior es
 * 'external_transfer' (contrato del POS de 3 opciones; el backend normaliza
 * el heredado 'zelle' y jamás lo persiste).
 */

export type ComponentMethod = 'cash' | 'transfer' | 'external_transfer';
export type ComponentCurrency = 'CUP' | 'USD';

export interface PaymentComponent {
  method: ComponentMethod;
  currency: ComponentCurrency;
  amount: number;
  /**
   * CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 (§5.1): número/referencia
   * de la transferencia bancaria de ESTE pago. Opcional; solo las filas
   * transfer/external_transfer la portan. El servidor la persiste en
   * payment_transactions.reference — una referencia POR PAGO (nunca global:
   * dos transferencias con referencias distintas viajan como DOS componentes).
   */
  reference?: string | null;
}

/** Fila de pago mínima que este módulo consume (PaymentRow del carrito). */
export interface PaymentRowLike {
  // CP-FIN-004: se admite el heredado 'zelle' porque los carritos persistidos
  // previos al contrato pueden traerlo — se normaliza al canónico.
  method: ComponentMethod | 'zelle';
  amount: number;
  currency: string;
  /** CP-LOG-UNIFICATION-001 §5.1: referencia de transferencia (opcional). */
  reference?: string | null;
}

/** Ítem del carrito mínimo: filas de pago explícitas o campos legado. */
export interface PaymentSourceItem {
  payments?: PaymentRowLike[] | null;
  cash_paid?: number;
  cash_currency?: string;
  transfer_paid?: number;
  transfer_currency?: string;
  zelle_paid?: number;
  zelle_currency?: string;
}

const EPS = 0.005;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const normCur = (c: unknown): string => String(c || '').trim().toUpperCase();

/**
 * Construye los componentes de pago por moneda de una venta.
 * Fuente de verdad: payments[] por ítem; fallback a los campos legado
 * (cash_paid/cash_currency…) para ítems sin filas explícitas.
 */
export function buildPaymentComponents(items: PaymentSourceItem[]): PaymentComponent[] {
  const acc = new Map<string, PaymentComponent>();

  const push = (
    method: ComponentMethod,
    currencyRaw: string,
    amount: number,
    reference?: string | null,
  ): void => {
    const currency = normCur(currencyRaw) || 'CUP';
    if (amount <= EPS) return; // fila en cero / negativa: no es un cobro
    // CP-LOG-UNIFICATION-001 (§5.1): una fila de transferencia CON referencia
    // NUNCA se agrega con otra — cada pago conserva SU referencia (misión:
    // «no una referencia global que termine sustituyendo las anteriores»).
    // El servidor crea una fila de payment_transactions POR componente, así
    // que cada transferencia queda trazada a su número de operación.
    const ref = reference && reference.trim() ? reference.trim().slice(0, 400) : null;
    const key = ref ? `${method}|${currency}|ref:${ref}` : `${method}|${currency}`;
    const existing = acc.get(key);
    if (existing) {
      existing.amount = round2(existing.amount + amount);
    } else {
      acc.set(key, {
        method,
        currency: currency as ComponentCurrency,
        amount: round2(amount),
        ...(ref ? { reference: ref } : {}),
      });
    }
  };

  for (const item of items) {
    if (item.payments && item.payments.length > 0) {
      for (const p of item.payments) {
        // CP-FIN-004: normaliza filas heredadas ('zelle' de carritos
        // persistidos) al canónico del exterior.
        const method = p.method === 'zelle' ? 'external_transfer' : p.method;
        // CP-LOG-UNIFICATION-001 (§5.1): la referencia viaja SOLO en filas de
        // transferencia (transfer/external_transfer) — en efectivo se ignora.
        const ref = method === 'transfer' || method === 'external_transfer'
          ? p.reference
          : null;
        push(method, p.currency, Number(p.amount) || 0, ref);
      }
      continue;
    }
    // Legado: campos por método (una moneda por método). El exterior legado
    // (zelle_paid) alimenta el componente canónico external_transfer.
    if ((item.cash_paid || 0) > EPS) push('cash', item.cash_currency || 'CUP', item.cash_paid || 0);
    if ((item.transfer_paid || 0) > EPS) push('transfer', item.transfer_currency || 'CUP', item.transfer_paid || 0);
    if ((item.zelle_paid || 0) > EPS) push('external_transfer', item.zelle_currency || 'USD', item.zelle_paid || 0);
  }

  // Descartar componentes que quedaron por debajo del umbral tras el redondeo.
  const out = [...acc.values()].filter(c => c.amount > EPS);
  // Orden determinista (idempotencia estable del payload).
  out.sort((a, b) => a.method.localeCompare(b.method) || a.currency.localeCompare(b.currency) || (a.reference || '').localeCompare(b.reference || ''));
  return out;
}

/**
 * ¿La venta necesita componentes? Regla de envío:
 *  a) al menos un componente USD de método cash/transfer (el cobro mixto que
 *     el pool canónico CUP no representa), O
 *  b) CP-LOG-UNIFICATION-001 (§5.1): al menos un componente con referencia de
 *     transferencia — el camino de componentes es el ÚNICO que persiste la
 *     referencia por pago (payment_transactions.reference); sin él, la venta
 *     caería en el pool legacy y la referencia se perdería.
 * Las ventas CUP puras sin transferencias y las de Transf. Exterior puras sin
 * referencia conservan el flujo previo.
 */
export function requiresPaymentComponents(components: PaymentComponent[]): boolean {
  return components.some(
    c => (c.currency === 'USD' && (c.method === 'cash' || c.method === 'transfer'))
      || (c.reference != null && c.reference !== ''),
  );
}
