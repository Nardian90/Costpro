"use client";

/**
 * CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (FASE 2): editor de filas de pago
 * por línea, EXTRAÍDO del carrito clásico (POSCartItem, bloque FIX-PAYMENT-ROWS
 * 2026-07-10 + validación FIX-VALIDATION) para REUTILIZARLO sin duplicar:
 *
 *  · POSCartItem (carrito clásico): lo monta exactamente como antes
 *    (filas dentro del colapsable «Descuento / Pago Mixto / Moneda» y la
 *    validación de cuadre siempre visible fuera del colapsable).
 *  · Cajero Express (POSExpressPaymentModal): el MISMO editor en el modal
 *    «Configurar pago» de cada línea — cero aritmética nueva, mismas store
 *    actions (updateItemPaymentRow / addItemPayment / removeItemPayment /
 *    duplicateItemPayment), misma regla de referencia de transferencia por
 *    pago (§5.1 CP-LOG-UNIFICATION) y misma conversión exterior→USD.
 *
 * Regla dura: aquí NO se inventa ninguna validación ni cálculo nuevo —
 * todo el comportamiento es el del carrito, única fuente de verdad.
 */

import {
  DollarSign,
  Plus,
  Send,
  CreditCard,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useCartStore, type CartItem } from "@/store/cart";
import { isExteriorMethod } from "@/lib/payments/methods";

/** Filas de pago dinámicas de una línea (mismo JSX del carrito clásico). */
export function PaymentRowsEditor({ item }: { item: CartItem }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-muted-foreground">
          Pago Mixto
        </span>
        <span className="text-[9px] font-bold text-muted-foreground">
          {item.payments?.length || 0} fila(s)
        </span>
      </div>

      {item.payments?.map((p, idx) => {
        const MethodIcon = p.method === 'cash' ? DollarSign : p.method === 'transfer' ? Send : CreditCard;
        const methodColor = p.method === 'cash' ? 'text-success' : 'text-primary';
        // Equivalente en CUP si la moneda no es CUP
        const rateToCup = useCartStore.getState().globalRates[p.currency || 'CUP'] || item.exchange_rate || 1;
        const equivCup = p.currency === 'CUP' ? p.amount : p.amount * rateToCup;
        return (
          <div key={p.id} className="border border-border/30 rounded-lg p-2 space-y-1">
            <div className="flex flex-wrap gap-1 items-center">
              {/* Selector de método — CP-FIN-004 (anexo POS-backend): el
                  value canónico de «Transf. Exterior» es 'external_transfer'
                  (contrato del backend; el heredado 'zelle' solo se lee).
                  Al elegir Transf. Exterior en una fila que estaba en CUP/MLC,
                  la fila pasa a USD convirtiendo el monto a la tasa vigente →
                  el equivalente en CUP se mantiene y no aparece descuadre. */}
              <select
                value={isExteriorMethod(p.method) ? 'external_transfer' : p.method}
                onChange={(e) => {
                  const method = e.target.value as 'cash' | 'transfer' | 'external_transfer';
                  if (method === 'external_transfer' && p.currency !== 'USD' && p.currency !== 'EUR') {
                    const storeRate = useCartStore.getState().globalRates['USD'];
                    const validRate = typeof storeRate === 'number' && storeRate > 1 ? storeRate : 0;
                    const converted = validRate > 0
                      ? Math.max(0, Number(((p.amount || 0) / validRate).toFixed(2)))
                      : (p.amount || 0);
                    useCartStore.getState().updateItemPaymentRow(
                      item.product_id, item.variant_id, p.id,
                      { method, currency: 'USD', discount_currency: 'USD', amount: converted },
                    );
                    if (validRate > 0) {
                      toast.info(`Transf. Exterior: moneda USD — monto convertido a la tasa vigente (1 USD = ${validRate} CUP).`);
                    } else {
                      toast.info('Transf. Exterior: moneda USD — ajusta el monto o actualiza la tasa en Tasas.');
                    }
                    return;
                  }
                  useCartStore.getState().updateItemPaymentRow(
                    item.product_id, item.variant_id, p.id,
                    { method }
                  );
                }}
                className="bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                aria-label={`Método de pago fila ${idx + 1}`}
              >
                <option value="cash">💵 Efect.</option>
                <option value="transfer">📱 Transf.</option>
                <option value="external_transfer">💳 Transf. Exterior</option>
              </select>

              {/* Monto */}
              <div className="relative min-w-[90px] flex-1">
                <MethodIcon className={cn("absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3", methodColor)} aria-hidden="true" />
                <input
                  type="number"
                  value={Number((p.amount || 0).toFixed(2))}
                  onChange={(e) => useCartStore.getState().updateItemPaymentRow(
                    item.product_id, item.variant_id, p.id,
                    { amount: Math.max(0, Number(e.target.value)) }
                  )}
                  className="w-full bg-background border border-border/50 rounded-lg pl-5 pr-1 py-2 min-h-[36px] text-xs font-bold"
                  aria-label={`Monto fila ${idx + 1} para ${item.product.name}`}
                />
              </div>

              {/* Moneda — FIX-TRANSF-EXTERIOR (2026-10-16): si la fila es
                  Transf. Exterior (zelle) solo se permiten USD o EUR (moneda
                  extranjera); CUP/MLC no aplican a una transferencia del
                  exterior. El store además fuerza esta regla como fuente única
                  de verdad (updateItemPaymentRow). */}
              <select
                value={p.currency || 'CUP'}
                onChange={(e) => useCartStore.getState().updateItemPaymentRow(
                  item.product_id, item.variant_id, p.id,
                  { currency: e.target.value }
                )}
                className="bg-background border border-border/50 rounded-lg px-1 py-2 min-h-[36px] text-[10px] font-bold shrink-0"
                aria-label={`Moneda de pago fila ${idx + 1}`}
              >
                {/* CP-FIN-004: reconocedor dual del exterior (heredado de carritos persistidos). */}
                {(isExteriorMethod(p.method) ? ['USD', 'EUR'] : ['CUP', 'USD', 'EUR', 'MLC']).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Tipo de ajuste (—, %, $) */}
              <select
                value={p.discount_type || 'none'}
                onChange={(e) => {
                  const type = e.target.value === 'none' ? null : e.target.value as 'percentage' | 'fixed';
                  useCartStore.getState().updateItemPaymentRow(
                    item.product_id, item.variant_id, p.id,
                    { discount_type: type, discount_value: type ? (p.discount_value || 0) : 0 }
                  );
                }}
                className="bg-background border border-border/50 rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                aria-label={`Tipo de ajuste fila ${idx + 1}`}
              >
                <option value="none">—</option>
                <option value="percentage">%</option>
                <option value="fixed">$</option>
              </select>

              {/* Valor del ajuste */}
              {p.discount_type && (
                <input
                  type="number"
                  value={Number((p.discount_value || 0).toFixed(2))}
                  onChange={(e) => useCartStore.getState().updateItemPaymentRow(
                    item.product_id, item.variant_id, p.id,
                    { discount_value: parseFloat(e.target.value) || 0 }
                  )}
                  className={cn("w-14 bg-background border rounded px-1 py-2 min-h-[36px] text-[9px] font-bold shrink-0",
                    (p.discount_value || 0) < 0 ? "border-emerald-500/50 text-emerald-500"
                    : (p.discount_value || 0) > 0 ? "border-amber-500/50 text-amber-500"
                    : "border-border/50"
                  )}
                  placeholder="+/-"
                  title="Negativo = descuento, Positivo = recargo"
                />
              )}

              {/* Botón duplicar */}
              <button
                type="button"
                onClick={() => useCartStore.getState().duplicateItemPayment(item.product_id, item.variant_id, p.id)}
                className="bg-muted/30 hover:bg-muted border border-border/50 rounded px-1.5 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                title="Duplicar esta fila"
                aria-label={`Duplicar fila ${idx + 1}`}
              >
                ⧉
              </button>

              {/* Botón eliminar (solo si hay más de 1 fila) */}
              {item.payments.length > 1 && (
                <button
                  type="button"
                  onClick={() => useCartStore.getState().removeItemPayment(item.product_id, item.variant_id, p.id)}
                  className="bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive rounded px-1.5 py-2 min-h-[36px] text-[9px] font-bold shrink-0"
                  title="Eliminar esta fila"
                  aria-label={`Eliminar fila ${idx + 1}`}
                >
                  ✕
                </button>
              )}
            </div>
            {/* CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 (§5.1): número
                de transferencia de ESTE pago — visible SOLO en filas
                transfer/external_transfer (en Efectivo no se muestra).
                Obligatorio al confirmar la venta (validado en el panel de
                cobro); se persiste por pago en payment_transactions.reference. */}
            {(p.method === 'transfer' || p.method === 'external_transfer') && (
              <input
                type="text"
                value={p.reference || ''}
                onChange={(e) => useCartStore.getState().updateItemPaymentRow(
                  item.product_id, item.variant_id, p.id,
                  { reference: e.target.value || null }
                )}
                className={cn(
                  "w-full bg-background border rounded-lg px-2 py-2 min-h-[36px] text-[10px] font-mono font-bold",
                  (p.amount || 0) > 0 && !(p.reference || '').trim()
                    ? "border-amber-500/60"
                    : "border-border/50",
                )}
                placeholder="N.º de transferencia (obligatorio)"
                aria-label={`Número de transferencia fila ${idx + 1} para ${item.product.name}`}
                maxLength={400}
              />
            )}
            {/* Equivalente en CUP si la moneda no es CUP */}
            {p.amount > 0 && p.currency !== 'CUP' && (
              <p className="text-[8px] text-muted-foreground ml-1">
                ≈ {formatCurrency(equivCup)} CUP
              </p>
            )}
          </div>
        );
      })}

      {/* Botón + Agregar Pago */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => useCartStore.getState().addItemPayment(item.product_id, item.variant_id, 'cash')}
          className="flex-1 min-h-[36px] rounded-lg border-2 border-dashed border-primary/30 text-primary text-[10px] font-black uppercase hover:bg-primary/5 transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar Pago
        </button>
      </div>
    </div>
  );
}

/**
 * Validación de cuadre de la línea (Pago completo / Sobrepago / Falta) —
 * MISMA lógica del carrito clásico (FIX-VALIDATION 2026-07-10 +
 * FIX-PAYMENT-ROWS + FIX-MISIÓN-VS): Esperado = subtotal con el primer
 * ajuste activo de las filas; Pagado = Σ filas convertidas a CUP
 * (getItemPaidCup). Diferencia ±0.01 = completo.
 */
export function PaymentRowsValidation({ item }: { item: CartItem }) {
  const cartStore = useCartStore.getState();
  const subtotalCup = cartStore.getItemSubtotalCup(item);
  const paidCup = cartStore.getItemPaidCup(item);

  // Buscar la primera fila con monto > 0 Y ajuste configurado
  let expectedCup = subtotalCup;
  let adjLabel = '';
  if (item.payments && item.payments.length > 0) {
    for (const p of item.payments) {
      if (p.amount > 0 && p.discount_type && p.discount_value) {
        if (p.discount_type === 'percentage') {
          expectedCup = subtotalCup * (1 + p.discount_value / 100);
        } else {
          const rate = cartStore.globalRates[p.discount_currency || 'CUP'] || item.exchange_rate || 1;
          expectedCup = Math.max(0, subtotalCup + p.discount_value * rate);
        }
        adjLabel = ` (${p.discount_value > 0 ? '+' : ''}${p.discount_value}${p.discount_type === 'percentage' ? '%' : ''})`;
        break;
      }
    }
  } else {
    // Fallback legacy
    const hasCashAdj = item.cash_discount_type && item.cash_discount_value;
    const hasTransferAdj = item.transfer_discount_type && item.transfer_discount_value;
    const hasZelleAdj = item.zelle_discount_type && item.zelle_discount_value;
    if (item.cash_paid > 0 && hasCashAdj) {
      expectedCup = cartStore.getItemSubtotalWithMethodDiscountCup(item, 'cash');
      adjLabel = ` (${item.cash_discount_value > 0 ? '+' : ''}${item.cash_discount_value}${item.cash_discount_type === 'percentage' ? '%' : ''})`;
    } else if (item.transfer_paid > 0 && hasTransferAdj) {
      expectedCup = cartStore.getItemSubtotalWithMethodDiscountCup(item, 'transfer');
      adjLabel = ` (${item.transfer_discount_value > 0 ? '+' : ''}${item.transfer_discount_value}${item.transfer_discount_type === 'percentage' ? '%' : ''})`;
    } else if (item.zelle_paid > 0 && hasZelleAdj) {
      expectedCup = cartStore.getItemSubtotalWithMethodDiscountCup(item, 'zelle');
      adjLabel = ` (${item.zelle_discount_value > 0 ? '+' : ''}${item.zelle_discount_value}${item.zelle_discount_type === 'percentage' ? '%' : ''})`;
    }
  }

  const diff = paidCup - expectedCup;
  return (
    <div className="mt-1 space-y-0.5">
      {/* Monto esperado siempre visible */}
      <div className="text-[9px] font-bold text-muted-foreground">
        Esperado: {formatCurrency(expectedCup)} CUP{adjLabel}
      </div>
      {/* Estado de validación */}
      {Math.abs(diff) <= 0.01 ? (
        <div className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
          ✓ Pago completo
        </div>
      ) : diff > 0 ? (
        <div className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Sobrepago: {formatCurrency(diff)} CUP
        </div>
      ) : (
        <div className="text-[10px] font-bold text-destructive flex items-center gap-1" role="alert">
          <TrendingDown className="w-3 h-3" /> Falta: {formatCurrency(Math.abs(diff))} CUP
        </div>
      )}
    </div>
  );
}
