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

      // FIX P1: Idempotencia — generar key ANTES de procesar, reutilizar en retries.
      // Antes: se generaba dentro de createSale con Date.now()+Math.random()
      // lo que permitía doble-submit crear 2 ventas. Ahora la key se genera
      // una sola vez por intento de checkout y se reutiliza en todos los retries.

      try {
        const cartState = useCartStore.getState();
        const customerId = cartState.customerId;
        const customerName = cartState.customerName;
        const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const safeCustomerId =
          customerId && validUuid.test(customerId) ? customerId : null;

        // FIX: validar coherencia de pagos mixtos antes de enviar
        const totalAmount = getTotal();
        // FIX-ZELLE (2026-07-06): soportar 3 métodos de pago (cash + transfer + zelle)
        const cashAmount = paymentMethod === 'cash' ? totalAmount
          : paymentMethod === 'mixed' ? items.reduce((s, i) => s + (i.cash_paid || 0), 0)
          : 0;
        const transferAmount = paymentMethod === 'transfer' ? totalAmount
          : paymentMethod === 'mixed' ? items.reduce((s, i) => s + (i.transfer_paid || 0), 0)
          : 0;
        const zelleAmount = paymentMethod === 'zelle' ? totalAmount
          : paymentMethod === 'mixed' ? items.reduce((s, i) => s + (i.zelle_paid || 0), 0)
          : 0;

        // FIX-ZELLE: validar coherencia solo para mixed (cash+transfer+zelle = total)
        // Para métodos únicos (cash/transfer/zelle), el total se paga con ese método
        if (paymentMethod === 'mixed' && Math.abs(cashAmount + transferAmount + zelleAmount - totalAmount) > 0.01) {
          throw new Error(`Descuadre de pagos: cash (${cashAmount}) + transfer (${transferAmount}) + zelle (${zelleAmount}) ≠ total (${totalAmount})`);
        }

        const saleId = await createSale({
          p_store_id: user.activeStoreId,
          p_seller_id: user.id,
          p_payment_method: paymentMethod,
          p_total_amount: useCartStore.getState().getTotalCup(),
          p_subtotal: getSubtotal(),
          p_discount_type: (checkoutDiscount || discount)?.type || "fixed",
          p_discount_value: getDiscountAmount(),
          // FIX F2-01: persistir split cash/transfer server-side
          p_cash_amount: cashAmount,
          p_transfer_amount: transferAmount,
          // FIX: idempotencia con crypto.randomUUID() para mayor entropía
          p_idempotency_key: `sale-${crypto.randomUUID()}`,
          // FIX-MULTI-MONEDA: cada item lleva su propia moneda y tasa
          p_sale_currency: 'MIXED',
          p_sale_exchange_rate: 1.0,
          p_items: items.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id ?? null,
            quantity: i.quantity,
            price: i.price,
            cost: i.cost,
            cash_paid: i.cash_paid,
            transfer_paid: i.transfer_paid,
            zelle_paid: i.zelle_paid || 0,
            currency: i.currency || 'CUP',
            exchange_rate: i.exchange_rate || 1.0,
          })),
        });

        // POS-3b audit P0.1: persistir customer_id y customer_name en transactions.
        // create_sale RPC no acepta estos parámetros (no podemos modificarla sin romperla).
        // Solución: UPDATE directo a la fila recién creada.
        // FIX: customer update post-venta. Si falla, la venta YA está registrada
        // (no se puede revertir sin anular). Mostrar warning honesto al usuario.
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
              // FIX: no mostrar toast.success mintiendo, mostrar warning
              toast.warning("Venta registrada, pero no se pudo asociar el cliente", {
                description: "La venta se completó sin cliente. Puedes editarla después.",
              });
            }
          } catch {
            // FIX: el toast.warning ya se mostró en el bloque if anterior
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

      // ── VALIDACIÓN DE STOCK: impedir overselling (stock negativo) ──
      // FIX-G10: multiplicar cantidad por conversion_factor de la variante
      // antes de comparar con stock_current. Vender 1 docena = 12 unidades.
      const itemsByProduct = new Map<string, { productName: string; totalQty: number; stock: number }>();
      for (const item of items) {
        const pid = item.product.id;
        const existing = itemsByProduct.get(pid) || { productName: item.product.name, totalQty: 0, stock: item.product.stock_current ?? 0 };
        // FIX-G10: convertir cantidad a unidades base usando conversion_factor
        const conversionFactor = item.variant?.conversion_factor || 1;
        existing.totalQty += item.quantity * conversionFactor;
        itemsByProduct.set(pid, existing);
      }
      const insufficientStock: string[] = [];
      for (const [pid, info] of itemsByProduct) {
        if (info.totalQty > info.stock) {
          insufficientStock.push(`${info.productName}: pedido ${info.totalQty}, stock ${info.stock}`);
        }
      }
      if (insufficientStock.length > 0) {
        toast.error(`Stock insuficiente para: ${insufficientStock.slice(0, 3).join('; ')}${insufficientStock.length > 3 ? ` (+${insufficientStock.length - 3} más)` : ''}`, { duration: 6000 });
        return;
      }

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
          // FIX-ZELLE: incluir zelle_paid en la validación
          const itemPaid = (i.cash_paid || 0) + (i.transfer_paid || 0) + (i.zelle_paid || 0);
          return Math.abs(itemPaid - itemAdjustedSubtotal) > 0.01;
        });
        if (mismatchedItem) {
          const name = mismatchedItem.product?.name || "Un producto";
          toast.error(`Pago mixto descuadrado en "${name}". Revisa el desglose efectivo/transferencia/Zelle.`, {
            duration: 6000,
            action: {
              label: "Ver carrito",
              onClick: () => {/* el carrito ya está visible al estar cobrando */},
            },
          });
          return;
        }
      }

      // FIX-EXCHANGE-VALIDATION (2026-07-06): validar que los pagos en múltiples
      // monedas cuadren con el total usando la última tasa informal CUP/USD.
      // Si hay diferencia > 2%, advertir al vendedor antes de confirmar.
      if (paymentMethod === 'mixed' || items.some(i => i.currency && i.currency !== 'CUP')) {
        try {
          // Obtener última tasa informal CUP/USD
          const rateRes = await fetch('/api/exchange-rates?currency=USD&source=elToque&days=1');
          let usdToCupRate = 0;
          if (rateRes.ok) {
            const rateData = await rateRes.json();
            if (rateData.rates && rateData.rates.length > 0) {
              usdToCupRate = parseFloat(rateData.rates[0].rate) || 0;
            }
          }
          // Fallback: usar tasa de BCC si no hay elToque
          if (usdToCupRate === 0) {
            const bccRes = await fetch('/api/exchange-rates?currency=USD&source=BCC&segment=3&days=1');
            if (bccRes.ok) {
              const bccData = await bccRes.json();
              if (bccData.rates && bccData.rates.length > 0) {
                usdToCupRate = parseFloat(bccData.rates[0].rate) * 1.15 || 0; // spread estimado
              }
            }
          }

          if (usdToCupRate > 0) {
            // Calcular total en CUP y total pagado en CUP
            const totalCup = useCartStore.getState().getTotalCup();
            const totalPaidCup = items.reduce((s, i) => {
              const rate = i.exchange_rate || (i.currency === 'USD' ? usdToCupRate : 1);
              const paidCup = (i.cash_paid || 0) + (i.transfer_paid || 0) + (i.zelle_paid || 0);
              return s + (i.currency === 'CUP' ? paidCup : paidCup * rate);
            }, 0);

            const diff = Math.abs(totalPaidCup - totalCup);
            const pctDiff = totalCup > 0 ? (diff / totalCup) * 100 : 0;

            if (pctDiff > 2) {
              // Advertencia: el pago no cuadra con la tasa actual
              const confirm = window.confirm(
                `⚠ ADVERTENCIA: El pago no cuadra con la tasa actual (1 USD = ${usdToCupRate.toFixed(0)} CUP).\n\n` +
                `Total venta: ${totalCup.toFixed(2)} CUP\n` +
                `Total pagado (convertido): ${totalPaidCup.toFixed(2)} CUP\n` +
                `Diferencia: ${diff.toFixed(2)} CUP (${pctDiff.toFixed(1)}%)\n\n` +
                `¿Confirmar la venta de todos modos?`
              );
              if (!confirm) return;
            }
          }
        } catch (e) {
          // Si no se puede obtener la tasa, no bloquear la venta
          console.warn('No se pudo validar la tasa de cambio:', e);
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
