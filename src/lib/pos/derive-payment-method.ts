/**
 * CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (FASE 2): derivación del método de
 * pago de la venta a partir de las DISTRIBUCIONES REALES de las líneas del
 * carrito — EXTRAÍDO del panel de cobro clásico (POSCartCheckoutPanel,
 * bloque «AUTO-DETECT PAYMENT METHOD») para reutilizarlo sin duplicar:
 *
 *  · POSCartCheckoutPanel (carrito clásico): misma lógica, mismo resultado.
 *  · Cajero Express (POSExpressMode): sustituye al selector global del header
 *    — la venta cobra según lo distribuido por producto, no según un método
 *    único impuesto a toda la operación (misión §2.1).
 *
 * Reglas (idénticas al bloque original, cero aritmética nueva):
 *  1. Sin overrides manuales → 'cash' (default, soporta desglose de billetes).
 *  2. Con overrides: métodos usados con monto > 0 en las filas de pago
 *     (fallback legacy a los campos por método).
 *     · 1 método → ese método.
 *     · 2+ métodos → 'mixed'.
 */
import type { PaymentMethod } from "@/types";
import type { CartItem } from "@/store/cart";

export function deriveCartPaymentMethod(items: CartItem[]): PaymentMethod {
  const hasManualOverride = items.some(i => i.payment_manual_override === true);
  if (!hasManualOverride) return 'cash';

  const methodsUsed = new Set<string>();
  items.forEach(i => {
    if (i.payments && i.payments.length > 0) {
      i.payments.forEach(p => { if (p.amount > 0) methodsUsed.add(p.method); });
    } else {
      if ((i.cash_paid || 0) > 0) methodsUsed.add('cash');
      if ((i.transfer_paid || 0) > 0) methodsUsed.add('transfer');
      if ((i.zelle_paid || 0) > 0) methodsUsed.add('zelle');
    }
  });

  if (methodsUsed.size === 0) return 'cash';
  if (methodsUsed.size === 1) return Array.from(methodsUsed)[0] as PaymentMethod;
  return 'mixed';
}
