"use client";

import { useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore, useCartStore } from "@/store";
import { useShallow } from 'zustand/react/shallow';
import { useProducts } from "@/hooks/api/useProducts";
import { useCreateSale } from "@/hooks/api/useTransactions";
import { PaymentMethod } from "@/types";
import { auditService } from "@/services/audit-service";
import { createSaleParamsSchema } from "@/validation/schemas";
import { CartItem } from "@/store/cart";
import { Product } from "@/types";

export function usePOSView() {
  const { user } = useAuthStore();
  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getTotal,
    getSubtotal,
    getDiscountAmount,
    getTaxAmount,
    getItemCount,
    discount,
    setDiscount,
    appliedTaxes,
    toggleTax,
    updateItemDiscount,
    updateItemPayment,
    prorateGlobalPayment,
  } = useCartStore(useShallow(state => ({
    items: state.items,
    addItem: state.addItem,
    removeItem: state.removeItem,
    updateQuantity: state.updateQuantity,
    clearCart: state.clearCart,
    getTotal: state.getTotal,
    getSubtotal: state.getSubtotal,
    getDiscountAmount: state.getDiscountAmount,
    getTaxAmount: state.getTaxAmount,
    getItemCount: state.getItemCount,
    discount: state.discount,
    setDiscount: state.setDiscount,
    appliedTaxes: state.appliedTaxes,
    toggleTax: state.toggleTax,
    updateItemDiscount: state.updateItemDiscount,
    updateItemPayment: state.updateItemPayment,
    prorateGlobalPayment: state.prorateGlobalPayment,
  })));

  const [searchTerm, setSearchTerm] = useState("");
  const [posLayoutMode, setPosLayoutMode] = useState<"grid" | "table">("grid");
  const [showPriceWarning, setShowPriceWarning] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [pendingCheckoutData, setPendingCheckoutData] = useState<{
    paymentMethod: PaymentMethod;
    discount:
      | { type: "fixed" | "percentage"; value: number }
      | null
      | undefined;
  } | null>(null);

  // Data Fetching
  // Implementamos "Zero Latency": El POS descarga todo el catálogo una sola vez
  // y el filtrado ocurre localmente en el hook usePOSProducts.
  const {
    data: productsData,
    isLoading: isLoadingProducts,
    error: productsError,
  } = useProducts(user?.activeStoreId);
  const products = productsData || [];

  // Mutations
  const createSaleMutation = useCreateSale();

  const handleAddItem = (product: Product, variant?: any) => {
    if (product.stock_current <= 0) {
      toast.error(`${product.name} no tiene stock disponible.`);
      return;
    }

    const price = variant ? variant.price : product.price;

    if (price < (product.cost_price || product.cost_average || 0)) {
      toast.warning(
        `Atención: ${product.name}${variant ? ` (${variant.name})` : ""} tiene precio inferior al costo (${formatCurrency(product.cost_price || product.cost_average || 0)})`,
        {
          duration: 5000,
        },
      );
      // Log to audit if we have user info
      if (user) {
        auditService.logSaleBelowCost(
          user.id,
          product.id,
          user.activeStoreId!,
          price,
          product.cost_price || product.cost_average || 0,
        );
      }
    }

    const item: CartItem = {
      product_id: product.id,
      variant_id: variant ? variant.id : null,
      product: product,
      variant: variant || null,
      quantity: 1,
      price: price,
      cost: product.cost_price || product.cost_average || 0,
      subtotal: price,
      discount_type: null,
      discount_value: 0,
      cash_paid: price,
      transfer_paid: 0,
    };
    addItem(item);
    toast.success(
      `${product.name}${variant ? ` (${variant.name})` : ""} agregado`,
    );
  };

  const startCheckout = async (
    paymentMethod: PaymentMethod,
    checkoutDiscount?: { type: "fixed" | "percentage"; value: number } | null,
  ) => {
    const unpricedItems = items.filter((i) => i.price === null || i.price <= 0);
    if (unpricedItems.length > 0) {
      setPendingCheckoutData({ paymentMethod, discount: checkoutDiscount });
      setShowPriceWarning(true);
      return;
    }
    await handleCheckout(paymentMethod, checkoutDiscount);
  };

  const confirmUnpricedCheckout = async () => {
    if (!pendingCheckoutData || !user) return;

    setShowPriceWarning(false);

    // Log audit events for each unpriced product
    const unpricedItems = items.filter((i) => i.price === null || i.price <= 0);
    for (const item of unpricedItems) {
      await auditService.logInvoiceWithoutPrice(
        user.id,
        item.product_id,
        user.activeStoreId,
      );
    }

    await handleCheckout(
      pendingCheckoutData.paymentMethod,
      pendingCheckoutData.discount,
    );
    setPendingCheckoutData(null);
  };

  const handleCheckout = async (
    paymentMethod: PaymentMethod,
    checkoutDiscount?: { type: "fixed" | "percentage"; value: number } | null,
  ) => {
    if (items.length === 0 || createSaleMutation.isPending || !user) return;

    const toastId = toast.loading("Procesando venta...");

    logger.info("POS", "CHECKOUT_ATTEMPT", {
      userId: user?.id,
      storeId: user?.activeStoreId,
      itemCount: items.length,
      total: getTotal(),
    });

    try {
      const finalDiscount = checkoutDiscount || discount;

      const saleParams = {
        p_store_id: user.activeStoreId,
        p_seller_id: user.id,
        p_payment_method: paymentMethod,
        p_total_amount: Number(getTotal().toFixed(2)),
        p_subtotal: Number(getSubtotal().toFixed(2)),
        p_discount_type: (finalDiscount?.type || "fixed") as string,
        p_discount_value: Number(finalDiscount?.value || 0),
        p_items: items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          quantity: i.quantity,
          price: i.price,
          cost: i.cost,
          discount_type: i.discount_type,
          discount_value: i.discount_value,
          cash_paid: i.cash_paid,
          transfer_paid: i.transfer_paid,
        })),
        p_applied_taxes: [],
        p_tax_amount: 0,
        p_cash_amount: items.reduce((acc, i) => acc + (i.cash_paid || 0), 0),
        p_transfer_amount: items.reduce(
          (acc, i) => acc + (i.transfer_paid || 0),
          0,
        ),
      };

      const validationResult = createSaleParamsSchema.safeParse(saleParams);
      if (!validationResult.success) {
        console.error(
          "[Zod Validation Error] create_sale params:",
          validationResult.error.format(),
        );
        throw new Error("Datos de venta inválidos. Revise el carrito.");
      }

      const result = await createSaleMutation.mutateAsync(
        validationResult.data,
      );

      logger.info("POS", "CHECKOUT_SUCCESS", {
        userId: user?.id,
        storeId: user?.activeStoreId,
        saleId: result,
      });

      setLastSale({
        id: result,
        items: [...items],
        total: getTotal(),
        subtotal: getSubtotal(),
        discount: checkoutDiscount || discount,
        paymentMethod,
        date: new Date().toISOString(),
      });

      toast.success("Venta exitosa", { id: toastId });
      clearCart();
    } catch (error: any) {
      logger.error("POS", "CHECKOUT_FAILED", {
        userId: user?.id,
        storeId: user?.activeStoreId,
        error: error.message,
      });
      toast.error(error.message || "Error en venta", { id: toastId });
    }
  };

  return {
    // State
    searchTerm,
    setSearchTerm,
    posLayoutMode,
    setPosLayoutMode,

    // Data
    products,
    isLoadingProducts,
    productsError,

    // Cart
    items,
    handleAddItem,
    removeItem,
    updateQuantity,
    clearCart,
    getTotal,
    getSubtotal,
    getDiscountAmount,
    getTaxAmount,
    getItemCount,
    discount,
    setDiscount,
    appliedTaxes,
    toggleTax,
    updateItemDiscount,
    updateItemPayment,
    prorateGlobalPayment,

    // Operations
    startCheckout,
    confirmUnpricedCheckout,
    showPriceWarning,
    setShowPriceWarning,
    handleCheckout,
    lastSale,
    setLastSale,
    isProcessingSale: createSaleMutation.isPending,
  };
}
