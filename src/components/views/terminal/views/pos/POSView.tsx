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
  Printer,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore, useUIStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCartStore, setCartNotificationHandler } from '@/store/cart';
// MISIÓN FECHAS DE TRABAJO (2026-10-18): default de la fecha de venta del
// carrito = preferencia de trabajo del usuario para ventas (si es válida
// contra los límites vivos de la política del PR #1422). El selector visible
// (POSOperationDateSection en los tres flujos de confirmación) sigue siendo
// el control autoritativo; esto solo fija el valor inicial.
import { usePosWorkDateDefault } from './usePosWorkDateDefault';
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
import { Zap, History, Coins } from 'lucide-react';
// MISIÓN CARRITO-VENTAS (2026-10-23): panel del carrito redimensionable —
// un solo dueño del estado (ancho + arrastre) para sidebar y padding.
import { useCartPanelResize, CART_PANEL_GAP } from './useCartPanelResize';

// Extracted hooks
import { usePOSCheckout } from './usePOSCheckout';
import { usePOSShortcuts } from './usePOSShortcuts';
import { usePOSServerSearch } from '@/hooks/api/usePOSServerSearch';
// MISIÓN-TASAS (2026-10-17): confirmación diaria de tasas al abrir el carrito
import { useDailyRatesConfirmation } from '@/hooks/api/useDailyRatesConfirmation';
import RatesConfirmationModal from './RatesConfirmationModal';
// UX-TASAS (2026-10-26): acceso directo al modal REAL de tasas (StoreRatesModal)
// desde el header de Vender — mismo componente que el botón «Tasas» del ítem
// del carrito y que la acción «Revisar o actualizar tasas» de la confirmación
// diaria. Sin segunda implementación.
import StoreRatesModal from './StoreRatesModal';

export default function POSView() {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();

  // CAMBIO 2026-10: acceso directo a Reporte Entrega desde Vender (entre
  // Carrito y Express). Misma política de permisos EFECTIVA que el acceso
  // original dentro de Caja (CashClosureView.allowedRoles): admin/manager/
  // encargado/clerk. Si el rol no puede abrir el reporte, el acceso NO se
  // presenta como disponible (no se renderiza). Navega a la vista existente
  // `cash_report` — sin segunda implementación del reporte.
  const canOpenCashReport = !!user?.roles?.some(r =>
    ['admin', 'manager', 'encargado', 'clerk'].includes(r)
  );

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

  // MISIÓN FECHAS DE TRABAJO (2026-10-18): inicializar la fecha de venta del
  // carrito con la preferencia válida del usuario (una vez por montaje y solo
  // si el carrito está en «hoy implícito» — saleDate === null). El selector
  // visible de los tres flujos de confirmación permite cambiarla; el checkout
  // la envía con la convención canónica (hoy → NOW(); ≠ hoy → mediodía).
  usePosWorkDateDefault();

  // FIX-USD-CUP-RATE (2026-10-14): hidratar las tasas de cambio configuradas de
  // la tienda (fuente canónica: store_exchange_rates, editadas en el modal
  // TASAS → /api/store-rates) AL MONTAR la vista Vender y al cambiar de tienda.
  // Sin esto, los productos con precio en USD entraban al carrito con tasa 1.0:
  // un producto de 120 USD se comparaba contra pagos reales en CUP (ej. 94 800
  // a tasa 790) → falso "Sobrepago" y error "Pago mixto descuadrado" al cobrar.
  // La configuración vigente de COSTPRO es la autoridad de conversión del carrito.
  React.useEffect(() => {
    const storeId = user?.activeStoreId;
    if (!storeId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = useAuthStore.getState().token;
        const res = await fetch(`/api/store-rates?storeId=${storeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return; // sin tasas configuradas → fallback legacy (tasa 1 + edición manual)
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.rates && typeof data.rates === 'object') {
          useCartStore.getState().hydrateStoreRates(data.rates);
        }
      } catch {
        // Silencio deliberado: la POS sigue operable sin tasas (fallback legacy);
        // el usuario puede fijarlas manualmente con el modal TASAS.
      }
    })();
    return () => { cancelled = true; };
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

  const { data: productsData, isLoading: isLoadingProducts, error: productsError, refetch: refetchProducts } = useProducts(user?.activeStoreId);
  const products = (productsData || []) as Product[];

  // POS-3b EM-2: Server-side search paginado (híbrido client).
  // Reemplaza usePOSProductFilters. Mantiene misma interfaz + añade loadMore.
  const {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    selectedCategory,
    handleCategoryChange,
    categories,
    filteredProducts,
    // MISIÓN POS FILTRO REAL DE STOCK: conteo real bajo los filtros activos
    // (incluye el criterio de stock) — no solo la página visible.
    allFilteredCount,
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
  // MISIÓN-TASAS (2026-10-17): el diálogo se dispara AL ABRIR el carrito —
  // primera vez del día operativo por usuario+tienda (o si las tasas
  // cambiaron tras la última confirmación). El hook gestiona persistencia
  // (user_preferences, servidor) y auditoría (rates_confirmed).
  const dailyRates = useDailyRatesConfirmation(user?.activeStoreId);
  // FIX (2026-07-23): escaneo directo a cámara sin paso intermedio
  const [showCameraDirect, setShowCameraDirect] = useState(false);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<Product | null>(null);
  const [expressMode, setExpressMode] = useState(false);
  // UX-TASAS (2026-10-26): apertura del modal de tasas desde el header (junto a
  // Historial). Reutiliza StoreRatesModal — el mismo del botón «Tasas» del
  // carrito. Disponible también con el carrito vacío.
  const [showStoreRates, setShowStoreRates] = useState(false);

  // ESTÁNDAR: si se navegó al POS desde "Duplicar venta", abrir carrito automáticamente
  const { forceOpenCart, setForceOpenCart, setCurrentView } = useUIStore();
  useEffect(() => {
    if (forceOpenCart) {
      setShowCart(true);
      setForceOpenCart(false);
    }
  }, [forceOpenCart, setForceOpenCart]);

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
    // MISIÓN TIPO-DE-ARTÍCULO (2026-10-19): los servicios (is_service) no tienen
    // existencias propias — el servidor (create_sale_v2) ya los exime del check
    // de stock; el pre-check del POS replica la misma regla. Los productos
    // físicos conservan íntegra la validación de disponibilidad.
    if (product.is_service !== true && (product.stock_current ?? 0) <= 0) {
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
      // FIX-FASE-D: addItem ahora reporta aceptación/rechazo — el toast de éxito
      // solo se muestra si el item REALMENTE entró al carrito (antes se mostraba
      // incondicionalmente y enmascaraba rechazos del guard de tienda/stock).
      const accepted = addItem({
        product_id: product.id, variant_id: null, variant: null,
        price: product.price, cost: product.cost_price || 0,
        quantity: 1, product, subtotal: product.price,
      });
      if (accepted) toast.success(`${product.name} añadido`);
    }
  };

  const handleAddItem = (product: Product, variant: ProductVariant | null) => {
    // MISIÓN TIPO-DE-ARTÍCULO: los servicios se agregan sin exigir existencias.
    if (!variant && product.is_service !== true && (product.stock_current ?? 0) <= 0) {
      toast.error(`${product.name} no tiene stock disponible`);
      return;
    }
    if (variant && product.is_service !== true && (product.stock_current ?? 0) < (variant.conversion_factor || 1)) {
      toast.error(`${product.name} no tiene stock suficiente para ${variant.name}`);
      return;
    }
    if (!variant) {
      // FIX-FASE-D: toast honesto (solo si addItem aceptó el item)
      const accepted = addItem({
        product_id: product.id, variant_id: null, variant: null,
        price: product.price, cost: product.cost_price || 0,
        quantity: 1, product, subtotal: product.price,
      });
      if (accepted) toast.success(`${product.name} (unidad base) añadido`);
    } else {
      const conversionFactor = variant.conversion_factor || 1;
      const variantPrice = variant.price || 0;
      const variantCost = (product.cost_price || 0) * conversionFactor;
      if (variantCost > 0 && variantPrice < variantCost) {
        toast.warning(`Atención: ${product.name} (${variant.name}) precio < costo ajustado`, { duration: 5000 });
        if (user) auditService.logSaleBelowCost(user.id, product.id, user.activeStoreId!, variantPrice, variantCost);
      }
      // FIX-FASE-D: toast honesto (solo si addItem aceptó el item)
      const accepted = addItem({
        product_id: product.id, variant_id: variant.id, variant,
        price: variant.price, cost: (product.cost_price || 0) * conversionFactor,
        quantity: 1, product, subtotal: variant.price,
      });
      if (accepted) toast.success(`${product.name} (${variant.name}, x${conversionFactor}) añadido`);
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

  // MISIÓN CARRITO-VENTAS (2026-10-23): ancho del carrito compartido entre el
  // sidebar (POSCart) y el padding compensatorio del catálogo (abajo). Solo
  // activo en viewport lg+; en móvil el carrito es overlay full-screen.
  const cartPanel = useCartPanelResize();

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
    // MISIÓN CARRITO-VENTAS (2026-10-23): panel redimensionable (desktop).
    panelWidth: cartPanel.width,
    isResizingPanel: cartPanel.isResizing,
    onPanelResizeStart: cartPanel.startResize,
    onPanelResizeKeyDown: cartPanel.handleResizeKeyDown,
    onPanelResizeReset: cartPanel.resetWidth,
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

      {/* F1 (UI-002): flex-wrap controlado — en <640px el grupo de estado (Abrir turno)
          envuelve a una segunda fila alineada a la derecha en vez de salirse del viewport
          (medido: 89px fuera a 360px). Desktop (≥sm): gap y composición originales. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* QW-1 (IA Audit): botón "← Volver a Venta" para wayfinding contextual.
              POSView es alcanzada desde el hub de Venta — este botón restaura el
              contexto en 1 clic y refuerza la jerarquía hub → vista. */}
          <BackToVentaButton compact />
          {/* F4 (IA-F05): h2 "TPV" eliminado — término técnico retirado por GATE 1.3.
              El título de la vista lo dan el Header global y el breadcrumb ("Vender");
              duplicarlo aquí con un 4º nombre reintroducía exactamente la ambigüedad
              que la arquitectura certificada eliminó. */}
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
              {/* F4 (IA-F13): "Carrito" — antes "Caja (n)", colisionaba con la vista Caja
                  (cash: arqueo/cierre de turno). aria-label, móvil y live-region ya
                  decían "carrito"; el desktop era la única voz discordante. */}
              <span>{isMobile ? `🛒 (${cartCount})` : `Carrito (${cartCount})`}</span>
            </button>
            {/* CAMBIO 2026-10: acceso directo a Reporte Entrega entre Carrito y
                Express. Mismo sistema visual que los accesos vecinos (border-2,
                rounded-xl, h-11/44px, uppercase tracking-widest), icono Printer
                como el botón original de Caja. Destino: la vista existente
                cash_report (CashReportModal elevado) — misma vista que el menú
                lateral y el botón de Caja. Icon-only en móvil (<sm) para no
                desbordar la fila; oculto si el rol no tiene permiso. */}
            {canOpenCashReport && (
            <button
              type="button"
              onClick={() => setCurrentView('cash_report')}
              className="inline-flex items-center gap-1.5 h-11 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-xl border-2 border-primary/20 bg-background text-primary font-black text-xs uppercase tracking-widest hover:bg-primary/10 hover:border-primary/40 transition-all active:scale-95"
              aria-label="Abrir Reporte Entrega"
              title="Reporte de caja con desglose de billetes para entrega de dinero"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Reporte Entrega</span>
            </button>
            )}
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
            {/* ESTÁNDAR: botón Registro — navega al Historial de Ventas (sales), NO a kardex (history) */}
            <button
              type="button"
              onClick={() => setCurrentView('sales')}
              className="inline-flex items-center justify-center gap-1.5 h-11 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-xl border-2 border-blue-500/30 bg-blue-500/5 text-blue-500 font-black text-xs uppercase tracking-widest hover:bg-blue-500/10 hover:border-blue-500/50 transition-all active:scale-95"
              aria-label="Ir al Historial de Ventas"
              title="Ver historial de ventas registradas"
            >
              <History className="w-4 h-4" />
              {/* F4 (IA-F15): "Historial" — mismo destino que la tarjeta "Historial de
                  Ventas" del hub (view 'sales'); "Registro" era un 3er nombre huérfano. */}
              <span className="hidden sm:inline">Historial</span>
            </button>
            {/* UX-TASAS (2026-10-26): botón «Tasas» inmediatamente después de
                «Historial» (orden visual: Historial | Tasas). Abre el MISMO
                StoreRatesModal del botón Tasas del carrito (reutilización, no
                segunda implementación) y funciona con el carrito vacío.
                PERMISOS: se presenta solo a quien ya puede gestionar las tasas
                (dailyRates.canManageRates = canManageStore, idéntico al gate de
                «Revisar o actualizar tasas» del diálogo de confirmación diaria
                y al POST /api/store-rates server-side). El botón NO concede
                permisos nuevos: el servidor sigue aplicando canViewStore (GET)
                y canManageStore (POST) sobre store_exchange_rates.
                Visual: mismo sistema que los botones vecinos (h-11, rounded-xl,
                border-2, uppercase tracking-widest); icon-only en móvil (<sm)
                como Historial/Express/Reporte Entrega. Abrir/cerrar sin guardar
                NO altera carrito, importes ni tasas activas. */}
            {dailyRates.canManageRates && (
            <button
              type="button"
              onClick={() => setShowStoreRates(true)}
              className="inline-flex items-center justify-center gap-1.5 h-11 min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-xl border-2 border-amber-500/30 bg-amber-500/5 text-amber-500 font-black text-xs uppercase tracking-widest hover:bg-amber-500/10 hover:border-amber-500/50 transition-all active:scale-95"
              aria-label="Consultar o actualizar tasas de cambio"
              title="Consultar o actualizar las tasas de cambio de la tienda (USD/EUR/MLC)"
            >
              <Coins className="w-4 h-4" />
              <span className="hidden sm:inline">Tasas</span>
            </button>
            )}
          </div>
        </div>
        {/* POS-2 MM-6: Widget de estado de caja siempre visible en el header del POS.
            POS-3a-1: si no hay turno, es clickeable y navega a vista Caja.
            POS-3b EM-5: indicador offline/sync al lado del widget de caja.
            Solo aparece cuando hay algo que mostrar (offline o cola pendiente). */}
        {/* F1 (UI-002): ml-auto — si este grupo envuelve a la 2ª fila queda alineado a la derecha */}
        <div className="ml-auto flex items-center gap-2">
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

        {/* MISIÓN-TASAS (2026-10-17): confirmación diaria de tasas al abrir el
            carrito (primera vez del día operativo por usuario+tienda, o si
            las tasas cambiaron tras la última confirmación). Persistente en
            servidor (user_preferences) y auditable (rates_confirmed). */}
        <RatesConfirmationModal
          open={showCart && dailyRates.showDialog}
          reason={dailyRates.reason}
          businessDay={dailyRates.businessDay}
          rates={dailyRates.rates}
          confirming={dailyRates.confirming}
          onConfirm={dailyRates.confirm}
          onContinueWithoutConfirm={dailyRates.dismiss}
          canManageRates={dailyRates.canManageRates}
        />

        {/* UX-TASAS (2026-10-26): modal REAL de tasas abierto desde el header
            (junto a Historial). Mismo componente compartido del botón Tasas
            del carrito: carga las vigentes al abrir (GET /api/store-rates),
            guarda solo con acción explícita del usuario (POST) y re-tasa el
            carrito con el mecanismo ya existente. Abrir y cerrar sin guardar
            no toca carrito, importes, conversiones ni registros. */}
        <StoreRatesModal
          open={showStoreRates}
          onClose={() => setShowStoreRates(false)}
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
            para que el grid de productos no quede tapado por el sidebar fijo.
            MISIÓN CARRITO-VENTAS (2026-10-23): el padding sigue al ancho REAL del
            panel (redimensionable) vía estilo inline; la transición se congela
            durante el arrastre para evitar saltos/lag. */}
        <div
          className={cn(
            "flex-1 w-full space-y-4 sm:space-y-6",
            !cartPanel.isResizing && "transition-[padding] duration-300",
            (showCart || lastSale) && cartPanel.isLgViewport && "lg:pr-[460px]",
          )}
          style={
            (showCart || lastSale) && cartPanel.isLgViewport
              ? { paddingRight: cartPanel.width + CART_PANEL_GAP }
              : undefined
          }
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
                    Tab selecciona del dropdown; Enter sigue el flujo normal de onSubmit.
                    MISIÓN POS FILTRO REAL DE STOCK (2026-10-26): las sugerencias
                    obedecen el MISMO «Solo con stock» que la cuadrícula (predicado
                    compartido del hook) — sin agotados en el dropdown cuando el
                    filtro está activo, con respuesta inmediata al toggle. */}
                <POSAutocomplete
                  products={products}
                  query={searchTerm}
                  onSelectProduct={(p) => {
                    onAddToCart(p);
                    setSearchTerm('');
                  }}
                  disabled={isLoadingProducts}
                  hideOutOfStock={hideOutOfStock}
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
                {/* MISIÓN POS FILTRO REAL DE STOCK (§5.5): el conteo refleja los
                    resultados realmente visibles bajo los filtros activos
                    (búsqueda + categoría + stock), no el conjunto completo. */}
                {allFilteredCount} producto{allFilteredCount !== 1 ? 's' : ''}
                {hideOutOfStock ? ' con stock' : ''}
              </p>
            </div>
          </div>

          {/* POS-2 MM-5: Productos frecuentes del turno actual.
              Solo se renderiza si hay turno activo y hay ventas en él.
              MISIÓN POS FILTRO REAL DE STOCK: los frecuentes también obedecen
              «Solo con stock» (coherencia de todo lo que ve el cajero); el
              guard de onAddToCart sigue como defensa última. */}
          <FrequentProducts products={products} onAddToCart={onAddToCart} hideOutOfStock={hideOutOfStock} />

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
              onRetry={refetchProducts as () => void}
              data={filteredProducts}
              emptyComponent={
                <EmptyProducts
                  onClearSearch={searchTerm ? () => setSearchTerm('') : undefined}
                  stockFiltered={hideOutOfStock}
                  hasSearchOrCategory={Boolean(searchTerm || selectedCategory)}
                />
              }
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
          Ahora solo aparece cuando hay espacio libre en pantalla.
          F1 (FIX-3): en móvil tampoco aparece cuando StickyCartSummary está visible
          (cartCount > 0) — el FAB z-110 solapaba tanto la tab bar como el CTA de
          checkout. Sus 3 acciones conservan alternativa visible en ese estado:
          Caja (header, con contador) · Escanear (botón de cámara junto al buscador) ·
          Anular (dentro del panel del carrito). Desktop sin cambio. */}
      {!showCart && !lastSale && !(isMobile && cartCount > 0) && (
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
