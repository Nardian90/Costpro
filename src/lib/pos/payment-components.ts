/**
 * payment-components.ts — MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24).
 *
 * Construye el desglose REAL por moneda de los pagos de una venta a partir
 * de las filas de pago del carrito (payments[] por ítem):
 *
 *   [{ method: 'cash'|'transfer'|'zelle', currency: 'CUP'|'USD', amount }]
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
 * representar. Las ventas CUP puras y las ventas Zelle puras conservan el
 * flujo previo (blast radius mínimo).
 *
 * Normalización:
 *   - Las filas se agrupan por (método, moneda) y se suman (2 filas cash USD
 *     → un componente).
 *   - Importes ≤ 0.005 se descartan (filas en edición).
 *   - Redondeo a 2 decimales (regla de redondeo única del módulo).
 *   - Zelle se declara en su moneda de fila (riel USD por diseño); si una
 *     fila legada declara otra moneda se reporta tal cual y el servidor la
 *     rechaza (fail-closed ERR_PAYMENT_COMPONENTS_INVALID).
 */

export type ComponentMethod = 'cash' | 'transfer' | 'zelle';
export type ComponentCurrency = 'CUP' | 'USD';

export interface PaymentComponent {
  method: ComponentMethod;
  currency: ComponentCurrency;
  amount: number;
}

/** Fila de pago mínima que este módulo consume (PaymentRow del carrito). */
export interface PaymentRowLike {
  method: ComponentMethod;
  amount: number;
  currency: string;
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

  const push = (method: ComponentMethod, currencyRaw: string, amount: number): void => {
    const currency = normCur(currencyRaw) || 'CUP';
    if (amount <= EPS) return; // fila en cero / negativa: no es un cobro
    const key = `${method}|${currency}`;
    const existing = acc.get(key);
    if (existing) {
      existing.amount = round2(existing.amount + amount);
    } else {
      acc.set(key, { method, currency: currency as ComponentCurrency, amount: round2(amount) });
    }
  };

  for (const item of items) {
    if (item.payments && item.payments.length > 0) {
      for (const p of item.payments) {
        push(p.method, p.currency, Number(p.amount) || 0);
      }
      continue;
    }
    // Legado: campos por método (una moneda por método).
    if ((item.cash_paid || 0) > EPS) push('cash', item.cash_currency || 'CUP', item.cash_paid || 0);
    if ((item.transfer_paid || 0) > EPS) push('transfer', item.transfer_currency || 'CUP', item.transfer_paid || 0);
    if ((item.zelle_paid || 0) > EPS) push('zelle', item.zelle_currency || 'USD', item.zelle_paid || 0);
  }

  // Descartar componentes que quedaron por debajo del umbral tras el redondeo.
  const out = [...acc.values()].filter(c => c.amount > EPS);
  // Orden determinista (idempotencia estable del payload).
  out.sort((a, b) => a.method.localeCompare(b.method) || a.currency.localeCompare(b.currency));
  return out;
}

/**
 * ¿La venta necesita componentes? Regla de envío: al menos un componente
 * USD de método cash/transfer (el cobro mixto que el pool canónico CUP no
 * representa). Las ventas CUP puras y Zelle puras conservan el flujo previo.
 */
export function requiresPaymentComponents(components: PaymentComponent[]): boolean {
  return components.some(c => c.currency === 'USD' && (c.method === 'cash' || c.method === 'transfer'));
}
