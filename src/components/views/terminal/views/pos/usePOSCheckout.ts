"use client";

import { useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { useCartStore } from "@/store/cart";
import { useAuthStore } from "@/store";
import { useCreateSale } from "@/hooks/api/useTransactions";
import { PaymentMethod } from "@/types";
import type { LastSale } from "./POSCart.types";

export function usePOSCheckout() {
  const { user } = useAuthStore();
  const [showPriceWarning, setShowPriceWarning] = useState(false);
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const [pendingCheckoutData, setPendingCheckoutData] = useState<{
    paymentMethod: PaymentMethod;
    discount: { type: "fixed" | "percentage"; value: number } | null;
  } | null>(null);

  const {
    items,
    clearCart,
    getSubtotal,
    getDiscountAmount,
    getTotal,
    discount,
  } = useCartStore(
    useShallow((state) => ({
      items: state.items,
      clearCart: state.clearCart,
      getSubtotal: state.getSubtotal,
      getDiscountAmount: state.getDiscountAmount,
      getTotal: state.getTotal,
      discount: state.discount,
    })),
  );

  const { mutateAsync: createSale, isPending: isProcessingSale } =
    useCreateSale();

  const processCheckout = useCallback(
    async (
      paymentMethod: PaymentMethod,
      checkoutDiscount?: {
        type: "fixed" | "percentage";
        value: number;
      } | null,
    ) => {
      if (!user?.activeStoreId || !user?.id) return;
      try {
        const saleId = await createSale({
          p_store_id: user.activeStoreId,
          p_seller_id: user.id,
          p_payment_method: paymentMethod,
          p_total_amount: getTotal(),
          p_subtotal: getSubtotal(),
          p_discount_type: (checkoutDiscount || discount)?.type || "fixed",
          p_discount_value: getDiscountAmount(),
          p_items: items.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id ?? null,
            quantity: i.quantity,
            price: i.price,
            cost: i.cost,
            cash_paid: i.cash_paid,
            transfer_paid: i.transfer_paid,
          })),
        });
        setLastSale({
          id: saleId,
          items: items.map((i) => ({
            product: { name: i.product?.name || "Producto" },
            quantity: i.quantity,
            price: i.price,
            subtotal: i.subtotal,
          })),
          subtotal: getSubtotal(),
          total: getTotal(),
          discount: discount || null,
          paymentMethod: paymentMethod as string,
          date: new Date().toISOString(),
        });
        clearCart();
        toast.success("Venta completada con éxito");
      } catch (err: unknown) {
        toast.error(
          "Error al procesar la venta: " + (err instanceof Error ? err.message : "Error desconocido"),
        );
      }
    },
    [
      user,
      createSale,
      items,
      getSubtotal,
      getDiscountAmount,
      getTotal,
      discount,
      clearCart,
    ],
  );

  const startCheckout = useCallback(
    async (
      paymentMethod: PaymentMethod,
      checkoutDiscount?: {
        type: "fixed" | "percentage";
        value: number;
      } | null,
    ) => {
      if (isProcessingSale) return;
      const hasUnpriced = items.some((item) => (item.price || 0) <= 0);
      if (hasUnpriced) {
        setPendingCheckoutData({
          paymentMethod,
          discount: checkoutDiscount || null,
        });
        setShowPriceWarning(true);
        return;
      }
      await processCheckout(paymentMethod, checkoutDiscount);
    },
    [isProcessingSale, items, processCheckout],
  );

  const confirmUnpricedCheckout = useCallback(async () => {
    setShowPriceWarning(false);
    if (pendingCheckoutData) {
      await processCheckout(
        pendingCheckoutData.paymentMethod,
        pendingCheckoutData.discount,
      );
      setPendingCheckoutData(null);
    }
  }, [pendingCheckoutData, processCheckout]);

  return {
    // Checkout
    startCheckout,
    confirmUnpricedCheckout,
    processCheckout,
    isProcessingSale,

    // Modals
    showPriceWarning,
    setShowPriceWarning,

    // Sale result
    lastSale,
    setLastSale,
  };
}
