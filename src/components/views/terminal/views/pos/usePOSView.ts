
'use client'

import { useState } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useAuthStore, useCartStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCreateSale } from '@/hooks/api/useTransactions';
import { PaymentMethod } from '@/types';
import { auditService } from '@/services/audit-service';
import { createSaleParamsSchema } from '@/validation/schemas';
import { CartItem } from '@/store/cart';
import { Product } from '@/types';

export function usePOSView() {
  const { user } = useAuthStore();
  const { items, addItem, removeItem, updateQuantity, clearCart, getTotal, getSubtotal, getItemCount, discount } = useCartStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [posLayoutMode, setPosLayoutMode] = useState<'grid' | 'table'>('grid');
  const [showPriceWarning, setShowPriceWarning] = useState(false);
  const [pendingCheckoutData, setPendingCheckoutData] = useState<{
    paymentMethod: PaymentMethod;
    discount: any;
  } | null>(null);

  // Data Fetching
  const { data: productsData, isLoading: isLoadingProducts } = useProducts(user?.storeId, searchTerm);
  const products = productsData || [];

  // Mutations
  const createSaleMutation = useCreateSale();

  const handleAddItem = (product: Product) => {
    if (product.stock_current <= 0) {
      toast.error(`${product.name} no tiene stock disponible.`);
      return;
    }
    const item: CartItem = {
        product_id: product.id,
        variant_id: null,
        product: product,
        variant: null,
        quantity: 1,
        price: product.price,
        cost: product.cost_price || product.cost_average || 0,
        subtotal: product.price
    };
    addItem(item);
    toast.success(`${product.name} agregado`);
  }

  const startCheckout = async (paymentMethod: PaymentMethod, checkoutDiscount?: { type: string, value: number } | null) => {
    const unpricedItems = items.filter(i => i.price === null || i.price <= 0);
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
    const unpricedItems = items.filter(i => i.price === null || i.price <= 0);
    for (const item of unpricedItems) {
      await auditService.logInvoiceWithoutPrice(user.id, item.product_id, user.storeId);
    }

    await handleCheckout(pendingCheckoutData.paymentMethod, pendingCheckoutData.discount);
    setPendingCheckoutData(null);
  };

  const handleCheckout = async (paymentMethod: PaymentMethod, checkoutDiscount?: { type: string, value: number } | null) => {
    if (items.length === 0 || createSaleMutation.isPending || !user) return;

    const toastId = toast.loading('Procesando venta...');

    logger.info('POS', 'CHECKOUT_ATTEMPT', {
      userId: user?.id,
      storeId: user?.storeId,
      itemCount: items.length,
      total: getTotal(),
    });

    try {
      const finalDiscount = checkoutDiscount || discount;

      const saleParams = {
        p_store_id: user.storeId,
        p_seller_id: user.id,
        p_payment_method: paymentMethod,
        p_total_amount: Number(getTotal().toFixed(2)), // Keep Number casting for API
        p_subtotal: Number(getSubtotal().toFixed(2)), // Keep Number casting for API
        p_discount_type: (finalDiscount?.type || 'fixed') as string,
        p_discount_value: Number(finalDiscount?.value || 0),
        p_items: items.map(i => ({
          product_id: i.product_id, variant_id: i.variant_id,
          quantity: i.quantity, price: i.price, cost: i.cost
        }))
      };

      const validationResult = createSaleParamsSchema.safeParse(saleParams);
      if (!validationResult.success) {
          console.error('[Zod Validation Error] create_sale params:', validationResult.error.format());
          throw new Error('Datos de venta inválidos. Revise el carrito.');
      }

      const result = await createSaleMutation.mutateAsync(validationResult.data);

      logger.info('POS', 'CHECKOUT_SUCCESS', {
        userId: user?.id,
        storeId: user?.storeId,
        saleId: (result as any)?.[0]?.r_sale_id,
      });

      toast.success('Venta exitosa', { id: toastId });
      clearCart();
    } catch (error: any) {
      logger.error('POS', 'CHECKOUT_FAILED', {
        userId: user?.id,
        storeId: user?.storeId,
        error: error.message,
      });
      toast.error(error.message || 'Error en venta', { id: toastId });
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

    // Cart
    items,
    handleAddItem,
    removeItem,
    updateQuantity,
    clearCart,
    getTotal,
    getSubtotal,
    getItemCount,

    // Operations
    startCheckout,
    confirmUnpricedCheckout,
    showPriceWarning,
    setShowPriceWarning,
    handleCheckout,
    isProcessingSale: createSaleMutation.isPending,
  };
}
