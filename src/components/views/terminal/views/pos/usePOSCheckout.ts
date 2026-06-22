"use client";

import { useState, useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { useCartStore } from "@/store/cart";
import { useAuthStore } from "@/store";
import { useCreateSale } from "@/hooks/api/useTransactions";
import { useInvertDocument } from "@/hooks/api/useDocumentActions";
import { supabase } from "@/lib/supabaseClient";
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

  // POS-2 MM-9: Referencia al ID del toast activo para poder dismissarlo
  // si el usuario hace otra venta antes de que expire la ventana de undo.
  const undoToastIdRef = useRef<string | number | null>(null);

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

  // POS-2 MM-9: Hook de anulación para soportar "Deshacer venta".
  const { mutateAsync: invertSale } = useInvertDocument();

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
        // POS-3b audit P0.1: persistir customerId/customerName en la venta.
        // Solo se envía si el ID tiene formato UUID válido (los clientes manuales
        // tienen ID tipo "manual-{timestamp}" que no pasaría el regex del schema).
        const cartState = useCartStore.getState();
        const customerId = cartState.customerId;
        const customerName = cartState.customerName;
        const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const safeCustomerId =
          customerId && validUuid.test(customerId) ? customerId : null;

        const saleId = await createSale({
          p_store_id: user.activeStoreId,
          p_seller_id: user.id,
          // NOTA: NO pasamos p_customer_id ni p_customer_name a la RPC.
          // La función create_sale en la BD no acepta estos parámetros
          // (su firma solo incluye p_applied_taxes, p_tax_amount, etc.).
          // Si los pasamos, PostgREST falla con PGRST202 (function not found).
          // El cliente se persiste vía UPDATE posterior a la fila creada.
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

        // POS-3b audit P0.1: persistir customer_id y customer_name en transactions.
        // create_sale RPC no acepta estos parámetros (no podemos modificarla sin romperla).
        // Solución: UPDATE directo a la fila recién creada.
        // Manejo silencioso: si las columnas no existen aún en BD, el update falla
        // pero la venta ya está registrada (no rompe el flujo).
        if (safeCustomerId || customerName) {
          try {
            const { error: custUpdateErr } = await supabase
              .from("transactions")
              .update({
                customer_id: safeCustomerId,
                customer_name: customerName || null,
              })
              .eq("id", saleId);
            if (custUpdateErr) {
              console.warn(
                "[POS] No se pudo persistir cliente (¿columnas customer_id/customer_name faltan en BD?):",
                custUpdateErr.message,
              );
            }
          } catch (e) {
            console.warn("[POS] Error secundario al persistir cliente:", e);
          }
        }

        // POS-2 MM-9: Capturar items + saleId ANTES de clearCart
        // para poder deshacer la venta si el usuario lo pide en 30s.
        const soldItemsSnapshot = items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          quantity: i.quantity,
          price: i.price,
          cost: i.cost,
          cash_paid: i.cash_paid,
          transfer_paid: i.transfer_paid,
          unit_cost: i.cost,
          cost_at_sale: i.cost,
        }));
        const storeIdForUndo = user.activeStoreId;

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
          // POS-3b audit P0.1: incluir cliente en el success view.
          customerName: customerName || undefined,
        });
        clearCart();
        toast.success(
          customerName
            ? `Venta a ${customerName} completada`
            : "Venta completada con éxito",
        );

        // POS-2 MM-9: Toast con acción "Deshacer" (30s).
        // Si el usuario hace clic, llamamos a useInvertDocument con los items
        // snapshotados (evita un round-trip extra al servidor).
        if (undoToastIdRef.current !== null) {
          toast.dismiss(undoToastIdRef.current);
        }
        undoToastIdRef.current = toast("Venta registrada", {
          description: "¿Te equivocaste? Tienes 30s para deshacerla.",
          duration: 30000,
          action: {
            label: "Deshacer",
            onClick: async () => {
              try {
                toast.loading("Deshaciendo venta...", { id: "undo-loading" });
                await invertSale({
                  type: "sale",
                  id: saleId,
                  items: soldItemsSnapshot,
                  storeId: storeIdForUndo,
                });
                toast.dismiss("undo-loading");
                setLastSale(null);
                toast.success("Venta deshecha y stock restaurado");
              } catch (err: unknown) {
                toast.dismiss("undo-loading");
                toast.error(
                  "No se pudo deshacer: " + (err instanceof Error ? err.message : "error desconocido"),
                  { duration: 6000 },
                );
              }
            },
          },
        });
      } catch (err: unknown) {
        toast.error(
          "Error al procesar la venta: " + (err instanceof Error ? err.message : "Error desconocido"),
        );
      }
    },
    [
      user,
      createSale,
      invertSale,
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

      // POS-2 MM-8: Validación de pago bloquea checkout.
      // Si el método es "mixed" o algún ítem tiene cash_paid/transfer_paid definido,
      // la suma de pagos por ítem debe cuadrar con el subtotal por ítem.
      // Si es "cash" puro, validamos que no haya residual de pago mixto activo.
      const total = getTotal();
      if (total <= 0) {
        toast.error("No se puede cobrar un total de 0. Agrega productos al carrito.");
        return;
      }

      if (paymentMethod === "mixed" || items.some(i => i.cash_paid > 0 || i.transfer_paid > 0)) {
        // POS-3b audit P0.2: Validación con descuento global aplicado.
        // El subtotal esperado por item = bruto - porción del descuento global.
        const grossSubtotal = items.reduce((acc, i) => acc + (i.subtotal || 0), 0);
        const globalDiscountAmount = discount && discount.value > 0
          ? (discount.type === "percentage"
            ? (grossSubtotal * discount.value) / 100
            : Math.min(discount.value, grossSubtotal))
          : 0;

        const mismatchedItem = items.find(i => {
          const itemWeight = grossSubtotal > 0 ? (i.subtotal || 0) / grossSubtotal : 0;
          const itemAdjustedSubtotal = Math.max(
            0,
            (i.subtotal || 0) - globalDiscountAmount * itemWeight,
          );
          const itemPaid = (i.cash_paid || 0) + (i.transfer_paid || 0);
          return Math.abs(itemPaid - itemAdjustedSubtotal) > 0.01;
        });
        if (mismatchedItem) {
          const name = mismatchedItem.product?.name || "Un producto";
          toast.error(`Pago mixto descuadrado en "${name}". Revisa el desglose efectivo/transferencia.`, {
            duration: 6000,
            action: {
              label: "Ver carrito",
              onClick: () => {/* el carrito ya está visible al estar cobrando */},
            },
          });
          return;
        }
      }

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
    [isProcessingSale, items, getTotal, processCheckout, discount],
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
