'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ShoppingCart,
  Trash2,
  QrCode,
  Eye,
  EyeOff,
  Camera,
  AlertTriangle,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCartStore, setCartNotificationHandler } from '@/store/cart';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import { auditService } from '@/services/audit-service';
import { toast } from 'sonner';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import SearchBar from '@/components/ui/SearchBar';
import { CategoryChips, ProductCard, ViewSwitcher } from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { SpeedDial, SpeedDialAction } from '@/components/ui/SpeedDial';
import { Portal } from '@/components/ui/Portal';
// POS sub-components
import { POSCart } from './POSCart';
import { StickyCartSummary } from './StickyCartSummary';
import { POSModals } from './POSModals';
import POSTableView from './POSTableView';
import PriceSelectorModal from './PriceSelectorModal';
import BarcodeScanner from './BarcodeScanner';
import CameraBarcodeScanner from './CameraBarcodeScanner';
import EmptyProducts from './EmptyProducts';
import POSLoadingSkeleton from './POSLoadingSkeleton';
import { CashStatusWidget } from './CashStatusWidget';
import { FrequentProducts } from './FrequentProducts';
import { NoShiftBanner } from './NoShiftBanner';
import { VirtualizedProductGrid, useGridColumnCount, VirtualizedProductGridWithResponsive } from './VirtualizedProductGrid';
import { POSAutocomplete } from './POSAutocomplete';
import { BackToVentaButton } from '@/components/ui/BackToVentaButton';
import { LoadMoreIndicator } from './LoadMoreIndicator';
import { POSExpressMode } from './POSExpressMode';
import { OfflineStatusIndicator } from './OfflineStatusIndicator';
import { Zap } from 'lucide-react';

// Extracted hooks
import { usePOSCheckout } from './usePOSCheckout';
import { usePOSShortcuts } from './usePOSShortcuts';
import { usePOSServerSearch } from '@/hooks/api/usePOSServerSearch';

export default function POSView() {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();

  // Wire up cart notifications (decoupled from store via callback)
  React.useEffect(() => {
    setCartNotificationHandler((type, message) => {
      if (type === "warning") { toast.warning(message); } else { toast.error(message); }
    });
    return () => setCartNotificationHandler(() => {});
  }, []);

  // Sync cart storeId with active store to prevent cross-store sales
  // FIX (2026-07-23): forzar sync al montar + cuando cambia activeStoreId
  React.useEffect(() => {
    if (user?.activeStoreId) {
      const cartState = useCartStore.getState();
      // Si el carrito tiene un storeId diferente al activeStoreId, forzar sync
      if (cartState.storeId !== user.activeStoreId) {
        useCartStore.getState().clearCartOnStoreSwitch(user.activeStoreId);
      }
      // FIX: si el carrito no tiene storeId, setearlo
      if (!cartState.storeId) {
        useCartStore.setState({ storeId: user.activeStoreId, lastUpdated: Date.now() });
      }
    }
  }, [user?.activeStoreId]);

  // QW-9: Toast si hay carrito persistente del turno anterior al cargar POS
  useEffect(() => {
    const cartState = useCartStore.getState();
    if (cartState.items.length > 0 && cartState.storeId === user?.activeStoreId) {
      // Verificar si el carrito es "antiguo" (más de 1 hora desde última modificación)
      const lastUpdate = cartState.lastUpdated;
      if (lastUpdate) {
        const ageMinutes = (Date.now() - lastUpdate) / 60000;
        // POS-3b audit P1.3: alinear con persistencia de 8h del cart store.
        // Antes disparaba a 1h (confuso: "del turno anterior" pero 1h ≠ turno).
        // Ahora dispara a 4h (mitad de la persistencia), mensaje más explícito.
        if (ageMinutes > 240) {
          const hours = Math.floor(ageMinutes / 60);
          toast.info(`Carrito de hace ${hours}h con ${cartState.items.length} producto(s)`, {
            description: 'Probablemente es de un turno anterior. Revísalo antes de continuar.',
            duration: 10000,
            action: {
              label: 'Vaciar',
              onClick: () => useCartStore.getState().clearCart(),
            },
          });
        }
      }
    }
    // Solo al montar
     
  }, []);

  // / keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        document.getElementById('pos-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Extracted hooks ─────────────────────────────────────────
  const {
    startCheckout,
    confirmUnpricedCheckout,
    isProcessingSale,
    showPriceWarning,
    setShowPriceWarning,
    // FIX-EXCHANGE-VALIDATION: modal de tasa
    showRateWarning,
    rateWarningData,
    confirmRateWarning,
    cancelRateWarning,
    updateRateFromModal,
    lastSale,
    setLastSale,
  } = usePOSCheckout();

  const { data: productsData, isLoading: isLoadingProducts, error: productsError } = useProducts(user?.activeStoreId);
  const products = (productsData || []) as Product[];

  // POS-3b EM-2: Server-side search paginado (híbrido client).
  // Reemplaza usePOSProductFilters. Mantiene misma interfaz + añade loadMore.
  const {
    searchTerm,
    setSearchTerm,
    selectedCategory,
    handleCategoryChange,
    categories,
    filteredProducts,
    isPending,
    hasMore,
    remainingCount,
    loadMore,
    hideOutOfStock,
    setHideOutOfStock,
  } = usePOSServerSearch({ products });

  // ── Local UI state ─────────────────────────────────────────
  const [posLayoutMode, setPosLayoutMode] = useState<'grid' | 'table'>('grid');
  const [showCart, setShowCart] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  // FIX (2026-07-23): escaneo directo a cámara sin paso intermedio
  const [showCameraDirect, setShowCameraDirect] = useState(false);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<Product | null>(null);
  // POS-3b EM-1: Modo Cajero Express (layout full-screen alternativo).
  const [expressMode, setExpressMode] = useState(false);

  // ── Cart store (shallow) ────────────────────────────────────
  const {
    items, addItem, removeItem, updateQuantity, clearCart,
    getSubtotal, getDiscountAmount, getTaxAmount, getTotal,
    discount, setDiscount,
    updateItemDiscount, updateItemPayment, prorateGlobalPayment,
    isPaymentModeByProduct, getConsolidatedPayments,
    getItemCount,
  } = useCartStore(useShallow(state => ({
    items: state.items, addItem: state.addItem, removeItem: state.removeItem,
    updateQuantity: state.updateQuantity, clearCart: state.clearCart,
    getSubtotal: state.getSubtotal,
    getDiscountAmount: state.getDiscountAmount,
    getTaxAmount: state.getTaxAmount,
    getTotal: state.getTotal,
    discount: state.discount, setDiscount: state.setDiscount,
    updateItemDiscount: state.updateItemDiscount,
    updateItemPayment: state.updateItemPayment,
    prorateGlobalPayment: state.prorateGlobalPayment,
    isPaymentModeByProduct: state.isPaymentModeByProduct,
    getConsolidatedPayments: state.getConsolidatedPayments,
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

  // ── Barcode scan (SKU/barcode exact → name fuzzy) ──────────────
  // QW-1: Añadida búsqueda por código de barras
  // QW-2: Fix case-sensitive — comparar con toLowerCase()
  // POS-3b EM-6: Soporta SKU prefix mode (query termina con "*")
  const handleScan = (query: string) => {
    const raw = query.trim();
    if (!raw) return;
    const q = raw.toLowerCase();

    // EM-6: SKU prefix mode ("123*" → agrega SKU 123)
    if (raw.endsWith('*')) {
      const skuQuery = raw.slice(0, -1).trim().toLowerCase();
      if (!skuQuery) { toast.error('Escribe un SKU antes del *'); return; }
      const skuMatch = products.find(p => p.sku?.toLowerCase() === skuQuery);
      if (skuMatch) { onAddToCart(skuMatch); return; }
      const skuStartsWith = products.find(p =>
        p.sku?.toLowerCase().startsWith(skuQuery)
      );
      if (skuStartsWith) {
        onAddToCart(skuStartsWith);
        toast.info(`SKU "${skuQuery}" → agregado ${skuStartsWith.name}`);
        return;
      }
      toast.error(`No se encontró producto con SKU "${skuQuery}"`);
      return;
    }

    // 1. Match exacto por SKU (case-insensitive)
    const product = products.find(p => p.sku?.toLowerCase() === q);
    if (product) { onAddToCart(product); return; }
    // 2. Match exacto por código de barras (case-insensitive)
    const barcodeMatch = products.find(p => p.barcode?.toLowerCase() === q);
    if (barcodeMatch) { onAddToCart(barcodeMatch); return; }
    // 3. Fuzzy por nombre
    const nameMatch = products.find(p => p.name.toLowerCase().includes(q));
    if (nameMatch) { onAddToCart(nameMatch); return; }
    toast.error(`Producto con "${query}" no encontrado`);
  };

  // ── POS-2 MM-1: Atajos POS locales ──────────────────────────
  // F9 = cobrar, F2 = foco search, Esc = cerrar carrito, +/- = qty último item.
  // Los handlers son estables (useCallback) para no recargar el listener.
  const focusSearch = useCallback(() => {
    document.getElementById('pos-search-input')?.focus();
  }, []);

  const incrementLastItem = useCallback(() => {
    const last = items[items.length - 1];
    if (!last) return;
    updateQuantity(last.product_id, last.variant_id, last.quantity + 1);
  }, [items, updateQuantity]);

  const decrementLastItem = useCallback(() => {
    const last = items[items.length - 1];
    if (!last) return;
    if (last.quantity <= 1) {
      removeItem(last.product_id, last.variant_id);
    } else {
      updateQuantity(last.product_id, last.variant_id, last.quantity - 1);
    }
  }, [items, updateQuantity, removeItem]);

  usePOSShortcuts({
    onCheckout: () => {
      if (items.length === 0) {
        toast.message('Carrito vacío — agrega productos antes de cobrar');
        return;
      }
      // Abrir carrito si está cerrado; el botón Confirmar hace el resto.
      setShowCart(true);
    },
    onEscape: () => {
      if (showCart) setShowCart(false);
    },
    onFocusSearch: focusSearch,
    onIncrementLast: incrementLastItem,
    onDecrementLast: decrementLastItem,
  });

  // ── Derived values ──────────────────────────────────────────
  const cartCount = getItemCount();
  const cartTotal = getTotal();

  // ── POSCart shared props (DRY — single definition) ──────────
  const posCartProps = {
    items,
    onRemoveItem: removeItem,
    onUpdateQuantity: updateQuantity,
    onClearCart: clearCart,
    getSubtotal,
    getDiscountAmount,
    getTotal,
    getTaxAmount,
    discount,
    setDiscount,
    updateItemDiscount,
    updateItemPayment,
    prorateGlobalPayment,
    isPaymentModeByProduct,
    getConsolidatedPayments,
    isProcessing: isProcessingSale,
    onCheckout: startCheckout,
    onClose: handleCloseCart,
    lastSale,
    isMobile,
    onClearLastSale: handleClearLastSale,
  };

  // ── Render ─────────────────────────────────────────────────
  // POS-3b EM-1: Modo Cajero Express. Si está activo, renderiza el layout
  // alternativo full-screen y sale del flujo normal del POSView.
  if (expressMode) {
    return <POSExpressMode products={products} onExit={() => setExpressMode(false)} />;
  }

  return (
    <div className="space-y-6">
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {cartCount > 0
          ? `Carrito actualizado: ${cartCount} productos, total ${formatCurrency(cartTotal)}`
          : 'Carrito vacío'}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* QW-1 (IA Audit): botón "← Volver a Venta" para wayfinding contextual.
              POSView es alcanzada desde el hub de Venta — este botón restaura el
              contexto en 1 clic y refuerza la jerarquía hub → vista. */}
          <BackToVentaButton compact />
          <h2 className="text-[clamp(1.875rem,6vw,3rem)] font-black text-foreground tracking-tighter uppercase hidden sm:block">TPV</h2>
          <div className="flex items-center gap-2">
            <ViewSwitcher currentView={posLayoutMode} onViewChange={setPosLayoutMode} />
            {/* POS-3a-v3 Fix 2: botón simple en vez de ActionMenu de un solo botón.
                El ActionMenu trae lógica de scroll horizontal con flechas — overkill
                para un solo botón y causaba scroll innecesario en el header. */}
            <button
              type="button"
              onClick={() => setShowCart(!showCart)}
              className={cn(
                "inline-flex items-center gap-2 h-11 min-h-[44px] px-3 sm:px-4 rounded-xl border-2 font-black text-xs uppercase tracking-widest transition-all active:scale-95",
                showCart
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : cartCount > 0
                    ? "bg-primary/5 text-primary border-primary/30 hover:bg-primary/10"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
              )}
              aria-label={showCart ? `Cerrar carrito (${cartCount} productos)` : `Abrir carrito (${cartCount} productos)`}
              aria-expanded={showCart}
            >
              <ShoppingCart className="w-5 h-5" />
              <span>{isMobile ? `🛒 (${cartCount})` : `Caja (${cartCount})`}</span>
            </button>
            {/* POS-3b EM-1: Toggle Modo Cajero Express.
                Layout full-screen alternativo optimizado para venta de alto volumen.
                FIX (2026-07-23): oculto en móvil — no es útil en pantalla pequeña. */}
            {!isMobile && (
            <button
              type="button"
              onClick={() => setExpressMode(true)}
              className="inline-flex items-center gap-1.5 h-11 min-h-[44px] px-3 sm:px-4 rounded-xl border-2 border-primary/30 bg-primary/5 text-primary font-black text-xs uppercase tracking-widest hover:bg-primary/10 hover:border-primary/50 transition-all active:scale-95"
              aria-label="Activar modo Cajero Express"
              title="Modo Express: layout optimizado para venta rápida"
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Express</span>
            </button>
            )}
          </div>
        </div>
        {/* POS-2 MM-6: Widget de estado de caja siempre visible en el header del POS.
            POS-3a-1: si no hay turno, es clickeable y navega a vista Caja.
            POS-3b EM-5: indicador offline/sync al lado del widget de caja.
            Solo aparece cuando hay algo que mostrar (offline o cola pendiente). */}
        <div className="flex items-center gap-2">
          <OfflineStatusIndicator />
          <CashStatusWidget compact={isMobile} />
        </div>
      </div>

      {/* POS-3a-5: Banner CTA cuando no hay turno abierto.
          No bloquea la venta pero hace muy claro que falta el turno. */}
      <NoShiftBanner />

      {/* POS-3a: Carrito ahora es `position: fixed right-0` (sidebar derecha real,
          full-height top→bottom, espejo del sidebar izquierdo).
          El contenido principal necesita padding-right en desktop cuando hay carrito
          para no quedar tapado. En mobile el carrito es full-screen Portal.
          Antes: gap-8 items-start con carrito sticky dentro del flex. */}
      <div className="flex flex-col gap-6 lg:pr-0">
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

        {/* FIX-EXCHANGE-VALIDATION (2026-07-06): modal custom de advertencia de tasa */}
        {showRateWarning && rateWarningData && (
          <Portal>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm" onClick={cancelRateWarning}>
              <div className="w-full max-w-md bg-card border border-border/50 rounded-3xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black uppercase">Descuadre de tasa</h2>
                    <p className="text-[10px] text-muted-foreground">El pago no cuadra con la tasa actual</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs mb-4">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total venta:</span><span className="font-mono font-black">{rateWarningData.totalCup.toFixed(2)} CUP</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total pagado (CUP):</span><span className="font-mono font-black">{rateWarningData.totalPaidCup.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Diferencia:</span><span className="font-mono font-black text-amber-500">{rateWarningData.diff.toFixed(2)} ({rateWarningData.pctDiff.toFixed(1)}%)</span></div>
                </div>

                {/* Tasas editables */}
                <div className="space-y-2 mb-4">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Tasas (editables — se arrastran):</p>
                  {Object.entries(rateWarningData.currentRates).map(([cur, rate]) => (
                    <div key={cur} className="flex items-center gap-2">
                      <span className="text-xs font-bold w-12">1 {cur} =</span>
                      <input
                        type="number"
                        value={rate}
                        onChange={(e) => updateRateFromModal(cur, parseFloat(e.target.value) || 0)}
                        className="flex-1 bg-background border border-border/50 rounded-lg px-2 py-2 text-xs font-bold"
                        aria-label={`Tasa ${cur}`}
                      />
                      <span className="text-xs font-bold">CUP</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={cancelRateWarning}
                    className="flex-1 min-h-[44px] px-4 rounded-xl border border-border text-xs font-black uppercase hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmRateWarning}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90"
                  >
                    Confirmar venta
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* POS-3a: cuando el carrito está abierto en desktop, añadimos padding-right
            para que el grid de productos no quede tapado por el sidebar fijo. */}
        <div
          className={cn(
            "flex-1 w-full space-y-4 sm:space-y-6 transition-[padding] duration-300",
            (showCart || lastSale) && "lg:pr-[460px] xl:pr-[500px] 2xl:pr-[540px]",
          )}
        >
          <div className="space-y-3 sm:space-y-4 sticky top-[calc(env(safe-area-inset-top)+56px)] sm:top-[76px] z-40 bg-background/95 backdrop-blur-md pb-3 sm:pb-4 pt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 shadow-xl">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <SearchBar
                  inputId="pos-search-input"
                  value={searchTerm}
                  onChange={setSearchTerm}
                  // POS-2 MM-2: Enter en search → intenta match exacto SKU/barcode primero.
                  // POS-3b EM-6: SKU prefix — "123*" agrega el producto con SKU 123 directo.
                  // Si encuentra, agrega al carrito y limpia search (retorna true).
                  // Si no encuentra match exacto, no hace nada especial (el grid ya está filtrado).
                  onSubmit={(query) => {
                    const raw = query.trim();
                    if (!raw) return false;

                    // EM-6: SKU prefix mode (input termina con "*")
                    // Permite venta experta: "123*" + Enter = agrega SKU 123 sin importar
                    // si hay otros productos con 123 en el nombre. Atajo de potencia.
                    if (raw.endsWith('*')) {
                      const skuQuery = raw.slice(0, -1).trim().toLowerCase();
                      if (!skuQuery) {
                        toast.error('Escribe un SKU antes del *');
                        return false;
                      }
                      // Match exacto por SKU
                      const skuMatch = products.find(p => p.sku?.toLowerCase() === skuQuery);
                      if (skuMatch) {
                        onAddToCart(skuMatch);
                        return true;
                      }
                      // Si no match exacto, intentar SKU que empiece con el prefijo
                      const skuStartsWith = products.find(p =>
                        p.sku?.toLowerCase().startsWith(skuQuery)
                      );
                      if (skuStartsWith) {
                        onAddToCart(skuStartsWith);
                        toast.info(`SKU "${skuQuery}" → agregado ${skuStartsWith.name}`);
                        return true;
                      }
                      toast.error(`No se encontró producto con SKU "${skuQuery}"`);
                      return false;
                    }

                    // Match normal (sin asterisco)
                    const q = raw.toLowerCase();
                    const product = products.find(p => p.sku?.toLowerCase() === q);
                    if (product) {
                      onAddToCart(product);
                      return true;
                    }
                    const barcodeMatch = products.find(p => p.barcode?.toLowerCase() === q);
                    if (barcodeMatch) {
                      onAddToCart(barcodeMatch);
                      return true;
                    }
                    // Sin match exacto: no limpiar, el usuario puede estar buscando por nombre
                    return false;
                  }}
                  placeholder="Buscar, escanear o 'SKU*' (Enter = agregar)..."
                  showSettings={false}
                  aria-label="Buscar productos por nombre, código de barras o SKU con asterisco"
                  aria-busy={isLoadingProducts}
                  aria-controls="pos-product-list"
                  aria-autocomplete="list"
                  role="combobox"
                  aria-expanded={searchTerm.length > 0 && filteredProducts.length > 0}
                />
                {/* POS-3b EM-7: Autocompletado dropdown tipo Shopify.
                    Solo se renderiza cuando hay query ≥ 2 chars y hay sugerencias.
                    Tab selecciona del dropdown; Enter sigue el flujo normal de onSubmit. */}
                <POSAutocomplete
                  products={products}
                  query={searchTerm}
                  onSelectProduct={(p) => {
                    onAddToCart(p);
                    setSearchTerm('');
                  }}
                  disabled={isLoadingProducts}
                />
              </div>
              {/* FIX-AUDIT-MOBILE-A2: Botón directo de cámara visible SIEMPRE.
                  Antes el escáner estaba oculto en el SpeedDial (4 taps para llegar).
                  Ahora es un botón de 44px al lado del search, accesible en 1 tap.
                  Icono Camera + label "Escanear" en sm+ para claridad. */}
              <button
                type="button"
                onClick={() => setShowCameraDirect(true)}
                className="shrink-0 flex items-center justify-center gap-2 h-11 px-3 sm:px-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 font-black text-xs uppercase tracking-widest hover:bg-green-500/20 active:scale-95 transition-all min-w-[44px]"
                aria-label="Escanear código de barras con cámara"
              >
                <Camera className="w-5 h-5" />
                <span className="hidden sm:inline">Escanear</span>
              </button>
            </div>
            <CategoryChips
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategoryChange}
            />

            {/* Toggle: ocultar/mostrar productos agotados. Default oculto para no hacer ruido visual.
                El cajero solo debe ver lo que puede vender AHORA. Si necesita ver agotados
                (para verificar catalogación, reponer, etc.), activa el toggle. */}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setHideOutOfStock(!hideOutOfStock)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95',
                  hideOutOfStock
                    ? 'bg-success/10 text-success border-success/30'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted',
                )}
                title={hideOutOfStock
                  ? 'Productos agotados ocultos (recomendado para venta rápida). Clic para mostrar todos.'
                  : 'Mostrando todos los productos incluyendo agotados. Clic para ocultar agotados.'}
                aria-label="Alternar visibilidad de productos agotados"
              >
                {hideOutOfStock ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {hideOutOfStock ? 'Solo con stock' : 'Ver todo (incl. agotados)'}
              </button>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {filteredProducts.length} productos
              </p>
            </div>
          </div>

          {/* POS-2 MM-5: Productos frecuentes del turno actual.
              Solo se renderiza si hay turno activo y hay ventas en él. */}
          <FrequentProducts products={products} onAddToCart={onAddToCart} />

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
                  // POS-3b EM-3: Virtualización para catálogos grandes.
                  // Threshold: 60 productos. Por debajo de eso, render normal
                  // (más rápido el setup que el overhead del virtualizador).
                  data.length > 60 ? (
                    <VirtualizedProductGridWithResponsive
                      products={data}
                      onAddToCart={onAddToCart}
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                      {data.map(product => (
                        <div key={product.id} role="option" aria-selected={false} aria-label={`${product.name} — ${formatCurrency(product.price)}`}>
                          <ProductCard product={product} onClick={onAddToCart} variant="pos" />
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <POSTableView products={data} onAddToCart={onAddToCart} />
                )
              )}
            </StateRenderer>

            {/* POS-3b EM-2: Indicador "Cargar más" cuando hay resultados paginados.
                Aparece solo si hasMore es true (más productos de los visibles). */}
            {hasMore && (
              <LoadMoreIndicator
                remainingCount={remainingCount}
                onLoadMore={loadMore}
                isLoading={isPending}
              />
            )}
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

      {/* FIX (2026-07-23): Cámara directa sin paso intermedio del BarcodeScanner */}
      <CameraBarcodeScanner
        isOpen={showCameraDirect}
        onScan={(code) => { handleScan(code); setShowCameraDirect(false); }}
        onClose={() => setShowCameraDirect(false)}
      />

      {/* POS-3a-v3 Fix 3: SpeedDial solo visible cuando el carrito NO está abierto.
          Antes estaba siempre visible, lo que hacía que se superpongiera con las
          opciones del carrito (Cobrar, Anular, etc.) cuando el sidebar estaba abierto.
          Ahora solo aparece cuando hay espacio libre en pantalla. */}
      {!showCart && !lastSale && (
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
      )}

      {isMobile && cartCount > 0 && !showCart && (
        <StickyCartSummary itemCount={cartCount} total={cartTotal} onClick={() => setShowCart(true)} />
      )}
    </div>
  );
}
