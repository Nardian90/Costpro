"use client";

/**
 * CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 (FASE 2): modal «Configurar pago»
 * de una línea del Cajero Express. NO introduce ninguna regla nueva:
 * monta el MISMO editor de filas de pago del carrito clásico
 * (PaymentRowsEditor / PaymentRowsValidation — extraído de POSCartItem) y
 * las MISMAS store actions. El cajero ve el importe de la línea, distribuye
 * entre métodos/monedas, y el estado de cuadre (completo/pendiente/excede)
 * con la validación canónica.
 */
import { CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCartStore, type CartItem } from "@/store/cart";
import { PaymentRowsEditor, PaymentRowsValidation } from "./PaymentRowsEditor";
import { POSPortalModal } from "./POSPortalModal";

export function POSExpressPaymentModal({
  item,
  onClose,
}: {
  item: CartItem | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const subtotalCup = useCartStore.getState().getItemSubtotalCup(item);
  const paidCup = useCartStore.getState().getItemPaidCup(item);
  const diff = Math.round((paidCup - subtotalCup) * 100) / 100;

  return (
    <POSPortalModal
      open
      onClose={onClose}
      title={`Configurar pago — ${item.product?.name || "Producto"}`}
    >
      <div className="space-y-3" data-testid="pos-express-payment-modal">
        {/* Importe de la línea (fuente: getStore getters — cero aritmética nueva) */}
        <div className="rounded-xl border border-border/60 bg-muted/10 p-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Importe del producto
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {item.product?.sku ? `SKU: ${item.product.sku}` : ""}
              {item.variant ? ` · ${item.variant.name}` : ""}
              {` · ${item.quantity} ${item.product?.unit_of_measure || "unidad"}`}
            </p>
          </div>
          <p className="text-lg font-black text-primary tabular-nums shrink-0">
            {formatCurrency(subtotalCup)} CUP
          </p>
        </div>

        {/* Editor de filas de pago — el MISMO del carrito clásico */}
        <PaymentRowsEditor item={item} />

        {/* Estado de cuadre — MISMA validación del carrito clásico */}
        <PaymentRowsValidation item={item} />

        {Math.abs(diff) > 0.01 && diff < 0 && (
          <p className="text-[10px] text-muted-foreground">
            Pendiente de asignar en esta línea. La venta se registra con
            incidencia de pago si se confirma así (política vigente).
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-center gap-2"
          aria-label="Listo, cerrar configuración de pago"
        >
          <CreditCard className="w-4 h-4" />
          Listo
        </button>
      </div>
    </POSPortalModal>
  );
}
