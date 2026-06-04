'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ShoppingCart,
  Trash2,
  QrCode,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCartStore, setCartNotificationHandler } from '@/store/cart';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import { auditService } from '@/services/audit-service';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import SearchBar from '@/components/ui/SearchBar';
import { CategoryChips, ProductCard, ViewSwitcher } from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { useIsMobile } from '@/hooks/ui/useMobile';
import ActionMenu from '@/components/ui/ActionMenu';
import { SpeedDial, SpeedDialAction } from '@/components/ui/SpeedDial';
import { Portal } from '@/components/ui/Portal';
import { QueryInspector } from '@/components/ui/QueryInspector';

// POS sub-components
import { POSCart } from './POSCart';
import { StickyCartSummary } from './StickyCartSummary';
import { POSModals } from './POSModals';
import POSTableView from './POSTableView';
import PriceSelectorModal from './PriceSelectorModal';
import BarcodeScanner from './BarcodeScanner';
import EmptyProducts from './EmptyProducts';
import POSLoadingSkeleton from './POSLoadingSkeleton';

// Extracted hooks
import { usePOSCheckout } from './usePOSCheckout';
import { usePOSProductFilters } from './usePOSProductFilters';

export default function POSView() {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();

  // Wire up cart notifications (decoupled from store via callback)
  React.useEffect(() => {
    setCartNotificationHandler((type, message) => {
      type === "warning" ? toast.warning(message) : toast.error(message);
    });
    return () => setCartNotificationHandler(() => {});
  }, []);

  // ── Extracted hooks ─────────────────────────────────────────
  const {
    startCheckout,
    confirmUnpricedCheckout,
    isProcessingSale,
    showPriceWarning,
    setShowPriceWarning,
    lastSale,
    setLastSale,
  } = usePOSCheckout();

  const { data: productsData, isLoading: isLoadingProducts, error: productsError } = useProducts(user?.activeStoreId);
  const products = (productsData || []) as Product[];

  const {
    isPending,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    handleCategoryChange,
    categories,
    filteredProducts,
  } = usePOSProductFilters({ products });

  // ── Local UI state ─────────────────────────────────────────
  const [posLayoutMode, setPosLayoutMode] = useState<'grid' | 'table'>('grid');
  const [showCart, setShowCart] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<Product | null>(null);

  // ── Cart store (shallow) ────────────────────────────────────
  const {
    items, addItem, removeItem, updateQuantity, clearCart,
    getSubtotal, getDiscountAmount, getTotal,
    discount, setDiscount,
    updateItemDiscount, updateItemPayment, prorateGlobalPayment,
    getItemCount,
  } = useCartStore(useShallow(state => ({
    items: state.items, addItem: state.addItem, removeItem: state.removeItem,
    updateQuantity: state.updateQuantity, clearCart: state.clearCart,
    getSubtotal: state.getSubtotal,
    getDiscountAmount: state.getDiscountAmount, getTotal: state.getTotal,
    discount: state.discount, setDiscount: state.setDiscount,
    updateItemDiscount: state.updateItemDiscount,
    updateItemPayment: state.updateItemPayment,
    prorateGlobalPayment: state.prorateGlobalPayment,
    getItemCount: state.getItemCount,
  })));

  // ── Cart handlers ───────────────────────────────────────────
  const handleCloseCart = useCallback(() => setShowCart(false), []);

  const handleClearLastSale = useCallback(() => {
    setLastSale(null);
    handleCloseCart();
  }, [setLastSale, handleCloseCart]);

  // ── Add to cart with stock validation & price<cost audit ────
  const onAddToCart = (product: Product) => {
    if ((product.stock_current ?? 0) <= 0) {
      toast.error(`${product.name} no tiene stock disponible`);
      return;
    }
    const price = product.price || 0;
    const cost = product.cost_price || product.cost_average || 0;
    if (cost > 0 && price < cost) {
      toast.warning(`Atención: ${product.name} tiene precio (${formatCurrency(price)}) inferior al costo (${formatCurrency(cost)})`, { duration: 5000 });
      if (user) auditService.logSaleBelowCost(user.id, product.id, user.activeStoreId!, price, cost);
    }
    if (product.product_variants && product.product_variants.length > 0) {
      setSelectedProductForVariants(product);
    } else {
      addItem({
        product_id: product.id, variant_id: null, variant: null,
        price: product.price, cost: product.cost_price || 0,
        quantity: 1, product, subtotal: product.price,
      });
      toast.success(`${product.name} añadido`);
    }
  };

  const handleAddItem = (product: Product, variant: ProductVariant | null) => {
    if (!variant && (product.stock_current ?? 0) <= 0) {
      toast.error(`${product.name} no tiene stock disponible`);
      return;
    }
    if (variant && (product.stock_current ?? 0) < (variant.conversion_factor || 1)) {
      toast.error(`${product.name} no tiene stock suficiente para ${variant.name}`);
      return;
    }
    if (!variant) {
      addItem({
        product_id: product.id, variant_id: null, variant: null,
        price: product.price, cost: product.cost_price || 0,
        quantity: 1, product, subtotal: product.price,
      });
      toast.success(`${product.name} (unidad base) añadido`);
    } else {
      const conversionFactor = variant.conversion_factor || 1;
      const variantPrice = variant.price || 0;
      const variantCost = (product.cost_price || 0) * conversionFactor;
      if (variantCost > 0 && variantPrice < variantCost) {
        toast.warning(`Atención: ${product.name} (${variant.name}) precio < costo ajustado`, { duration: 5000 });
        if (user) auditService.logSaleBelowCost(user.id, product.id, user.activeStoreId!, variantPrice, variantCost);
      }
      addItem({
        product_id: product.id, variant_id: variant.id, variant,
        price: variant.price, cost: (product.cost_price || 0) * conversionFactor,
        quantity: 1, product, subtotal: variant.price,
      });
      toast.success(`${product.name} (${variant.name}, x${conversionFactor}) añadido`);
    }
  };

  // ── Barcode scan (SKU exact → name fuzzy) ──────────────────
  const handleScan = (query: string) => {
    const product = products.find(p => p.sku === query);
    if (product) { onAddToCart(product); return; }
    const nameMatch = products.find(p => p.name.toLowerCase().includes(query.toLowerCase()));
    if (nameMatch) { onAddToCart(nameMatch); return; }
    toast.error(`Producto con "${query}" no encontrado`);
  };

  // ── Derived values ──────────────────────────────────────────
  const cartCount = getItemCount();
  const cartTotal = getTotal();

  // ── POSCart shared props (DRY — single definition) ──────────
  const posCartProps = useMemo(() => ({
    items,
    onRemoveItem: removeItem,
    onUpdateQuantity: updateQuantity,
    onClearCart: clearCart,
    getSubtotal,
    getDiscountAmount,
    getTotal,
    discount,
    setDiscount,
    updateItemDiscount,
    updateItemPayment,
    prorateGlobalPayment,
    isProcessing: isProcessingSale,
    onCheckout: startCheckout,
    onClose: handleCloseCart,
    lastSale,
    isMobile,
    onClearLastSale: handleClearLastSale,
  }), [
    items, removeItem, updateQuantity, getSubtotal, getDiscountAmount,
    getTotal, discount, setDiscount, updateItemDiscount, updateItemPayment,
    prorateGlobalPayment, isProcessingSale, startCheckout, handleCloseCart,
    lastSale, isMobile, handleClearLastSale,
  ]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {cartCount > 0
          ? `Carrito actualizado: ${cartCount} productos, total ${formatCurrency(cartTotal)}`
          : 'Carrito vacío'}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-[clamp(1.875rem,6vw,3rem)] font-black text-foreground tracking-tighter uppercase hidden sm:block">TPV</h2>
          <div className="flex items-center gap-2">
            <ViewSwitcher currentView={posLayoutMode} onViewChange={setPosLayoutMode} />
            <ActionMenu
              actions={[{
                id: 'cart',
                label: isMobile ? `(${cartCount})` : `Caja (${cartCount})`,
                icon: ShoppingCart,
                onClick: () => setShowCart(!showCart),
                variant: cartCount > 0 ? 'primary' : 'outline',
                active: showCart,
              }]}
              className="w-auto"
              position="top"
            />
          </div>
        </div>
      </div>

      <QueryInspector />

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <AnimatePresence>
          {(showCart || lastSale) && (
            isMobile ? (
              <Portal><POSCart {...posCartProps} /></Portal>
            ) : (
              <POSCart {...posCartProps} />
            )
          )}
        </AnimatePresence>

        <POSModals
          showPriceWarning={showPriceWarning}
          onPriceWarningChange={setShowPriceWarning}
          onConfirmUnpriced={confirmUnpricedCheckout}
        />

        <div className="flex-1 w-full space-y-4 sm:space-y-6 lg:order-first">
          <div className="space-y-3 sm:space-y-4 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-3 sm:pb-4 pt-2 -mx-4 px-4 shadow-xl">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchBar
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Buscar productos..."
                  showSettings={false}
                  aria-label="Buscar productos por nombre o código de barras"
                  aria-busy={isLoadingProducts}
                  aria-controls="pos-product-list"
                  aria-autocomplete="list"
                  role="combobox"
                  aria-expanded={searchTerm.length > 0 && filteredProducts.length > 0}
                />
              </div>
            </div>
            <CategoryChips
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategoryChange}
            />
          </div>

          <div
            id="pos-product-list"
            role="listbox"
            aria-label="Resultados de búsqueda de productos"
            aria-busy={isLoadingProducts}
            className={cn("flex-1 overflow-hidden", isPending && "opacity-50 transition-opacity")}
          >
            <StateRenderer
              isLoading={isLoadingProducts}
              error={productsError as Error}
              data={filteredProducts}
              emptyComponent={<EmptyProducts onClearSearch={searchTerm ? () => setSearchTerm('') : undefined} />}
              loadingComponent={<POSLoadingSkeleton layoutMode={posLayoutMode} />}
            >
              {(data) => (
                posLayoutMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {data.map(product => (
                      <div key={product.id} role="option" aria-selected={false} aria-label={`${product.name} — ${formatCurrency(product.price)}`}>
                        <ProductCard product={product} onClick={onAddToCart} variant="pos" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <POSTableView products={data} onAddToCart={onAddToCart} />
                )
              )}
            </StateRenderer>
          </div>
        </div>
      </div>

      <PriceSelectorModal
        isOpen={!!selectedProductForVariants}
        onClose={() => setSelectedProductForVariants(null)}
        product={selectedProductForVariants}
        onSelect={(variant: ProductVariant | null) => {
          if (selectedProductForVariants) {
            handleAddItem(selectedProductForVariants, variant);
            setSelectedProductForVariants(null);
          }
        }}
      />

      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
        products={products}
      />

      <SpeedDial actions={[
        {
          id: 'view-cart',
          label: `Caja (${cartCount})`,
          icon: ShoppingCart,
          onClick: () => setShowCart(true),
          category: 'Acción',
          variant: cartCount > 0 ? 'success' : 'primary',
        },
        {
          id: 'scan',
          label: 'Escanear SKU',
          icon: QrCode,
          onClick: () => setShowScanner(true),
          category: 'Acción',
        },
        {
          id: 'clear-cart',
          label: 'Anular Carrito',
          icon: Trash2,
          onClick: () => { if (cartCount > 0) { clearCart(); toast.success('Carrito anulado'); } },
          category: 'Edición',
          variant: 'destructive',
        },
      ] as SpeedDialAction[]} />

      {isMobile && cartCount > 0 && !showCart && (
        <StickyCartSummary itemCount={cartCount} total={cartTotal} onClick={() => setShowCart(true)} />
      )}
    </div>
  );
}
