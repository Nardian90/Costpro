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
  // FIX-EXCHANGE-VALIDATION: modal custom de advertencia de tasa (no window.confirm)
  const [showRateWarning, setShowRateWarning] = useState(false);
  const [rateWarningData, setRateWarningData] = useState<{
    totalCup: number;
    totalPaidCup: number;
    diff: number;
    pctDiff: number;
    usdRate: number;
    currentRates: Record<string, number>;
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
        // FIX-BUG-4 (2026-07-06): usar getTotalCup() (siempre CUP) para comparar
        const totalAmountCup = cartState.getTotalCup();
        // Para métodos únicos, el monto se paga en CUP equivalente
        const cashAmountCup = paymentMethod === 'cash' ? totalAmountCup
          : paymentMethod === 'mixed' ? items.reduce((s, i) => {
              const rate = i.currency === 'CUP' ? 1 : (i.exchange_rate || 1);
              return s + (i.cash_paid || 0) * (i.cash_currency === 'CUP' || i.cash_currency === i.currency ? rate : 1);
            }, 0)
          : 0;
        const transferAmountCup = paymentMethod === 'transfer' ? totalAmountCup
          : paymentMethod === 'mixed' ? items.reduce((s, i) => {
              const rate = i.currency === 'CUP' ? 1 : (i.exchange_rate || 1);
              return s + (i.transfer_paid || 0) * (i.transfer_currency === 'CUP' || i.transfer_currency === i.currency ? rate : 1);
            }, 0)
          : 0;
        const zelleAmountCup = paymentMethod === 'zelle' ? totalAmountCup
          : paymentMethod === 'mixed' ? items.reduce((s, i) => {
              // Zelle generalmente en USD — convertir a CUP con globalRate o exchange_rate
              const zelleRate = cartState.globalRates[i.zelle_currency || 'USD'] || cartState.globalRates['USD'] || (i.exchange_rate || 1);
              return s + (i.zelle_paid || 0) * zelleRate;
            }, 0)
          : 0;

        // Para enviar al RPC, usamos los montos en CUP
        const cashAmount = cashAmountCup;
        const transferAmount = transferAmountCup;
        const zelleAmount = zelleAmountCup;

        // FIX-ZELLE: validar coherencia solo para mixed (en CUP)
        if (paymentMethod === 'mixed' && Math.abs(cashAmountCup + transferAmountCup + zelleAmountCup - totalAmountCup) > 0.01) {
          throw new Error(`Descuadre de pagos: cash (${cashAmountCup.toFixed(2)}) + transfer (${transferAmountCup.toFixed(2)}) + zelle (${zelleAmountCup.toFixed(2)}) ≠ total (${totalAmountCup.toFixed(2)}) CUP`);
        }

        const saleId = await createSale({
          p_store_id: user.activeStoreId,
          p_seller_id: user.id,
          p_payment_method: paymentMethod,
          p_total_amount: useCartStore.getState().getTotalCup(),
          p_subtotal: getSubtotal(),
          p_discount_type: (checkoutDiscount || discount)?.type || "fixed",
          p_discount_value: getDiscountAmount(),
          // FIX F2-01: persistir split cash/transfer/zelle server-side
          p_cash_amount: cashAmount,
          p_transfer_amount: transferAmount,
          // FIX-ZELLE: enviar zelle_amount al RPC
          p_zelle_amount: zelleAmount,
          // FIX: idempotencia con crypto.randomUUID() para mayor entropía
          p_idempotency_key: `sale-${crypto.randomUUID()}`,
          // FIX-MULTI-MONEDA: cada item lleva su propia moneda y tasa
          p_sale_currency: useCartStore.getState().saleCurrency || 'MIXED',
          p_sale_exchange_rate: useCartStore.getState().saleExchangeRate || 1.0,
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
            // FIX-PAYMENT-METHOD-CURRENCY: moneda por método de pago
            cash_currency: i.cash_currency || 'CUP',
            transfer_currency: i.transfer_currency || 'CUP',
            zelle_currency: i.zelle_currency || 'USD',
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
          // FIX-BUG-4b (2026-07-06): convertir cada componente a CUP antes de comparar
          // (cash/transfer en moneda del item, zelle en USD normalmente)
          const cartSt = useCartStore.getState();
          const cashCup = (i.cash_paid || 0) * (i.cash_currency === 'CUP' || i.cash_currency === i.currency ? 1 : (i.exchange_rate || 1));
          const transferCup = (i.transfer_paid || 0) * (i.transfer_currency === 'CUP' || i.transfer_currency === i.currency ? 1 : (i.exchange_rate || 1));
          const zelleCup = (i.zelle_paid || 0) * (cartSt.globalRates[i.zelle_currency || 'USD'] || cartSt.globalRates['USD'] || (i.exchange_rate || 1));
          const itemPaidCup = cashCup + transferCup + zelleCup;
          // Convertir subtotal ajustado a CUP también
          const itemAdjustedSubtotalCup = itemAdjustedSubtotal * (i.currency === 'CUP' ? 1 : (i.exchange_rate || 1));
          return Math.abs(itemPaidCup - itemAdjustedSubtotalCup) > 0.01;
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
      // monedas cuadren con el total usando tasas (manuales primero, luego API).
      // Si diferencia > 2%, abrir modal custom (NO window.confirm) para:
      // 1. Mostrar detalles del descuadre
      // 2. Permitir editar tasas manualmente (se arrastran via globalRates)
      // 3. Confirmar o cancelar
      const cartState = useCartStore.getState();
      const hasMultiCurrency = paymentMethod === 'mixed'
        || items.some(i => i.currency && i.currency !== 'CUP')
        || items.some(i => i.zelle_paid && i.zelle_paid > 0)
        || paymentMethod === 'zelle';

      if (hasMultiCurrency) {
        try {
          // FIX-GLOBAL-RATES: usar tasas manuales si existen, si no fetch API
          let usdToCupRate = cartState.globalRates['USD'] || 0;

          if (usdToCupRate === 0) {
            // Fetch tasa informal
            const rateRes = await fetch('/api/exchange-rates?currency=USD&source=elToque&days=1');
            if (rateRes.ok) {
              const rateData = await rateRes.json();
              if (rateData.rates && rateData.rates.length > 0) {
                usdToCupRate = parseFloat(rateData.rates[0].rate) || 0;
              }
            }
            // Fallback BCC
            if (usdToCupRate === 0) {
              const bccRes = await fetch('/api/exchange-rates?currency=USD&source=BCC&segment=3&days=1');
              if (bccRes.ok) {
                const bccData = await bccRes.json();
                if (bccData.rates && bccData.rates.length > 0) {
                  usdToCupRate = parseFloat(bccData.rates[0].rate) * 1.15 || 0;
                }
              }
            }
          }

          if (usdToCupRate > 0) {
            const totalCup = cartState.getTotalCup();
            // Calcular total pagado en CUP usando tasas (manuales o item.exchange_rate)
            const totalPaidCup = items.reduce((s, i) => {
              const paidCup = (i.cash_paid || 0) + (i.transfer_paid || 0) + (i.zelle_paid || 0);
              // Si el item está en CUP, no convertir
              if (i.currency === 'CUP' && !i.zelle_paid) return s + paidCup;
              // Para Zelle, usar tasa manual o global
              const zelleCup = (i.zelle_paid || 0) * (cartState.globalRates[i.zelle_currency || 'USD'] || usdToCupRate);
              const otherCup = ((i.cash_paid || 0) + (i.transfer_paid || 0)) * (i.exchange_rate || 1);
              return s + zelleCup + otherCup;
            }, 0);

            const diff = Math.abs(totalPaidCup - totalCup);
            const pctDiff = totalCup > 0 ? (diff / totalCup) * 100 : 0;

            if (pctDiff > 2) {
              // Abrir modal custom con datos del descuadre
              setRateWarningData({
                totalCup,
                totalPaidCup,
                diff,
                pctDiff,
                usdRate: usdToCupRate,
                currentRates: { ...cartState.globalRates, USD: usdToCupRate },
              });
              setShowRateWarning(true);
              // Guardar pending data para reanudar después de que el usuario decida
              setPendingCheckoutData({ paymentMethod, discount: checkoutDiscount || null });
              return; // Pausar checkout hasta que el usuario decida
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

  // FIX-EXCHANGE-VALIDATION: handlers del modal de advertencia de tasa
  const confirmRateWarning = useCallback(async () => {
    setShowRateWarning(false);
    if (pendingCheckoutData) {
      await processCheckout(
        pendingCheckoutData.paymentMethod,
        pendingCheckoutData.discount,
      );
      setPendingCheckoutData(null);
    }
  }, [pendingCheckoutData, processCheckout]);

  const cancelRateWarning = useCallback(() => {
    setShowRateWarning(false);
    setRateWarningData(null);
    setPendingCheckoutData(null);
  }, []);

  // FIX-GLOBAL-RATES: actualizar tasa manual desde el modal (se arrastra)
  const updateRateFromModal = useCallback((currency: string, rate: number) => {
    useCartStore.getState().setGlobalRate(currency, rate);
    if (rateWarningData) {
      setRateWarningData({ ...rateWarningData, currentRates: { ...rateWarningData.currentRates, [currency]: rate } });
    }
  }, [rateWarningData]);

  return {
    // Checkout
    startCheckout,
    confirmUnpricedCheckout,
    processCheckout,
    isProcessingSale,

    // Modals
    showPriceWarning,
    setShowPriceWarning,
    // FIX-EXCHANGE-VALIDATION: modal de tasa
    showRateWarning,
    rateWarningData,
    confirmRateWarning,
    cancelRateWarning,
    updateRateFromModal,

    // Sale result
    lastSale,
    setLastSale,
  };
}
