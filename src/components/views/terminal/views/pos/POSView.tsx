'use client';

import React, { useState, useMemo, useTransition, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ShoppingCart,
  Search,
  Plus,
  X,
  Trash2,
  QrCode,
  AlertTriangle
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useCartStore } from '@/store/cart';
import { Product } from '@/types';
import SearchBar from '@/components/ui/SearchBar';
import { CategoryChips, ProductCard, ViewSwitcher } from '@/components/ui/atomic';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { POSCart } from './POSCart';
import { StickyCartSummary } from './StickyCartSummary';
import { BaseModal } from '@/components/ui/BaseModal';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import POSTableView from './POSTableView';
import { Portal } from '@/components/ui/Portal';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { useCreateSale } from '@/hooks/api/useTransactions';
import { SpeedDial, SpeedDialAction } from '@/components/ui/SpeedDial';

// PriceSelectorModal: Shows product variants for selection when a product has multiple options
const PriceSelectorModal = ({ isOpen, onClose, product, onSelect }: {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSelect: (variant: any) => void;
}) => {
  if (!isOpen || !product) return null;
  const variants = product.product_variants || [];

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Seleccionar Variante — ${product.name}`}
      description="Elige una presentación para añadir al carrito"
      maxWidth="sm:max-w-md"
    >
      {variants.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay variantes disponibles</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => onSelect(variant)}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/50 hover:border-primary/30 active:scale-[0.99] transition-all text-left"
              aria-label={`${variant.name} — ${formatCurrency(variant.price)}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{variant.name}</p>
                {variant.sku && (
                  <p className="text-xs text-muted-foreground mt-0.5">SKU: {variant.sku}</p>
                )}
              </div>
              <span className="font-black text-sm text-primary ml-4 whitespace-nowrap">
                {formatCurrency(variant.price)}
              </span>
            </button>
          ))}
        </div>
      )}
    </BaseModal>
  );
};

// BarcodeScanner: Simple SKU input dialog for typing/pasting barcodes
const BarcodeScanner = ({ isOpen, onClose, onScan }: {
  isOpen: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) {
      onScan(trimmed);
      setInputValue('');
      onClose();
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setInputValue('');
          onClose();
        }
      }}
      title={
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5" /> Escanear / Buscar SKU
        </div>
      }
      description="Ingresa o pega un código de barras o SKU para buscar el producto"
      maxWidth="sm:max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="barcode-input" className="sr-only">Código de barras o SKU</label>
          <input
            id="barcode-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ej: 7501234567890"
            autoFocus
            autoComplete="off"
            aria-label="Código de barras o SKU"
            className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={!inputValue.trim()}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Buscar Producto
        </button>
      </form>
    </BaseModal>
  );
};

const EmptyProductsComponent = ({ onClearSearch }: { onClearSearch?: () => void }) => (
  <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-2xl bg-muted/5">
    <Search className="w-12 h-12 mx-auto mb-4 opacity-10" />
    <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">No se encontraron productos</p>
    {onClearSearch && (
      <button
        type="button"
        onClick={onClearSearch}
        className="mt-4 text-xs font-black uppercase tracking-widest text-primary hover:underline"
        aria-label="Limpiar búsqueda de productos"
      >
        Limpiar búsqueda
      </button>
    )}
  </div>
);

const POSLoadingSkeleton = ({ layoutMode }: { layoutMode: 'grid' | 'table' }) => (
  <div className={cn(layoutMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-3")} aria-hidden="true">
    {[...Array(8)].map((_, i) => (
      <Skeleton key={i} className={cn("rounded-2xl", layoutMode === 'grid' ? "h-64" : "h-16")} />
    ))}
  </div>
);

export default function POSView() {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [posLayoutMode, setPosLayoutMode] = useState<'grid' | 'table'>('grid');
  const [showCart, setShowCart] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<Product | null>(null);
  const [showPriceWarning, setShowPriceWarning] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);

  // FIX: Use useShallow to avoid re-renders on unrelated store changes
  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getItemCount,
    getSubtotal,
    getDiscountAmount,
    getTaxAmount,
    getTotal,
    discount,
    setDiscount,
    appliedTaxes,
    toggleTax,
    updateItemDiscount,
    updateItemPayment,
    prorateGlobalPayment
  } = useCartStore(useShallow(state => ({
    items: state.items,
    addItem: state.addItem,
    removeItem: state.removeItem,
    updateQuantity: state.updateQuantity,
    clearCart: state.clearCart,
    getItemCount: state.getItemCount,
    getSubtotal: state.getSubtotal,
    getDiscountAmount: state.getDiscountAmount,
    getTaxAmount: state.getTaxAmount,
    getTotal: state.getTotal,
    discount: state.discount,
    setDiscount: state.setDiscount,
    appliedTaxes: state.appliedTaxes,
    toggleTax: state.toggleTax,
    updateItemDiscount: state.updateItemDiscount,
    updateItemPayment: state.updateItemPayment,
    prorateGlobalPayment: state.prorateGlobalPayment,
  })));

  // API
  const { data: productsData, isLoading: isLoadingProducts, error: productsError } = useProducts(user?.activeStoreId);
  const { mutateAsync: createSale, isPending: isProcessingSale } = useCreateSale();

  const products = (productsData || []) as Product[];
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleCategoryChange = (val: string) => {
    startTransition(() => {
      setSelectedCategory(val);
    });
  };

  const onAddToCart = (product: Product) => {
    if (product.product_variants && product.product_variants.length > 0) {
      setSelectedProductForVariants(product);
    } else {
        addItem({
            product_id: product.id,
            variant_id: null,
            variant: null,
            price: product.price,
            cost: product.cost_price || 0,
            quantity: 1,
            product: product,
            subtotal: product.price
        });
        toast.success(`${product.name} añadido`);
    }
  };

  const handleAddItem = (product: Product, variant: any) => {
    addItem({
        product_id: product.id,
        variant_id: variant.id,
        variant: variant,
        price: variant.price,
        cost: product.cost_price || 0,
        quantity: 1,
        product: product,
        subtotal: variant.price
    });
    toast.success(`${product.name} (${variant.name}) añadido`);
  };

  const startCheckout = async () => {
    const hasUnpriced = items.some(item => (item.price || 0) <= 0);
    if (hasUnpriced) {
      setShowPriceWarning(true);
      return;
    }
    await processCheckout();
  };

  const confirmUnpricedCheckout = async () => {
    setShowPriceWarning(false);
    await processCheckout();
  };

  const processCheckout = async () => {
    if (!user?.activeStoreId || !user?.id) return;
    try {
      const saleId = await createSale({
        p_store_id: user.activeStoreId,
        p_seller_id: user.id,
        p_payment_method: 'mixed',
        p_total_amount: getTotal(),
        p_subtotal: getSubtotal(),
        p_discount_type: discount?.type || 'fixed',
        p_discount_value: getDiscountAmount(),
        p_items: items.map(i => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          quantity: i.quantity,
          price: i.price,
          cost: i.cost,
          cash_paid: i.cash_paid,
          transfer_paid: i.transfer_paid
        }))
      });
      setLastSale({ id: saleId });
      clearCart();
      toast.success('Venta completada con éxito');
    } catch (err: any) {
      toast.error('Error al procesar la venta');
    }
  };

  const handleScan = (sku: string) => {
    const product = products.find(p => p.sku === sku);
    if (product) {
      onAddToCart(product);
    } else {
      toast.error(`Producto con SKU ${sku} no encontrado`);
    }
  };

  // FIX-RCT-129: Extract shared close handler to useCallback
  const handleCloseCart = useCallback(() => setShowCart(false), []);

  const handleClearCart = () => {
    clearCart();
    setShowClearConfirm(false);
    toast.success('Carrito vaciado');
  };

  const cartCount = getItemCount();
  const cartTotal = getTotal();

  const cartButton = (
    <ActionMenu
      actions={[
        {
          id: 'cart',
          label: isMobile ? `(${cartCount})` : `Caja (${cartCount})`,
          icon: ShoppingCart,
          onClick: () => setShowCart(!showCart),
          variant: cartCount > 0 ? 'primary' : 'outline',
          active: showCart
        }
      ]}
      className="w-auto"
      position="top"
    />
  );

  const mobileActions: SpeedDialAction[] = [
    {
      id: 'view-cart',
      label: `Caja (${cartCount})`,
      icon: ShoppingCart,
      onClick: () => setShowCart(true),
      category: 'Acción',
      variant: cartCount > 0 ? 'success' : 'primary'
    },
    {
      id: 'scan',
      label: 'Escanear SKU',
      icon: QrCode,
      onClick: () => setShowScanner(true),
      category: 'Acción'
    },
    {
      id: 'clear-cart',
      label: 'Anular Carrito',
      icon: Trash2,
      onClick: () => {
        if (cartCount > 0) {
          setShowClearConfirm(true);
        }
      },
      category: 'Edición',
      variant: 'destructive'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Aria-live region for cart status updates */}
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
            {cartButton}
          </div>
        </div>
      </div>

      <QueryInspector />

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <AnimatePresence>
          {(showCart || lastSale) && (
            isMobile ? (
              <Portal>
                <POSCart
                  items={items as any}
                  onRemoveItem={removeItem}
                  onUpdateQuantity={updateQuantity}
                  onClearCart={() => setShowClearConfirm(true)}
                  getSubtotal={getSubtotal}
                  getDiscountAmount={getDiscountAmount}
                  getTaxAmount={getTaxAmount}
                  getTotal={getTotal}
                  discount={discount}
                  setDiscount={setDiscount}
                  appliedTaxes={appliedTaxes}
                  toggleTax={toggleTax}
                  updateItemDiscount={updateItemDiscount}
                  updateItemPayment={updateItemPayment}
                  prorateGlobalPayment={prorateGlobalPayment}
                  isProcessing={isProcessingSale}
                  onCheckout={startCheckout as any}
                  onClose={handleCloseCart}
                  lastSale={lastSale}
                  isMobile={isMobile}
                  onClearLastSale={() => {
                    setLastSale(null);
                    handleCloseCart();
                  }}
                />
              </Portal>
            ) : (
              <POSCart
                items={items as any}
                onRemoveItem={removeItem}
                onUpdateQuantity={updateQuantity}
                onClearCart={() => setShowClearConfirm(true)}
                getSubtotal={getSubtotal}
                getDiscountAmount={getDiscountAmount}
                getTaxAmount={getTaxAmount}
                getTotal={getTotal}
                discount={discount}
                setDiscount={setDiscount}
                appliedTaxes={appliedTaxes}
                toggleTax={toggleTax}
                  updateItemDiscount={updateItemDiscount}
                  updateItemPayment={updateItemPayment}
                  prorateGlobalPayment={prorateGlobalPayment}
                isProcessing={isProcessingSale}
                onCheckout={startCheckout as any}
                onClose={handleCloseCart}
                lastSale={lastSale}
                isMobile={isMobile}
                onClearLastSale={() => {
                  setLastSale(null);
                  handleCloseCart();
                }}
              />
            )
          )}
        </AnimatePresence>

        {/* Modal de Advertencia de Precio */}
        <BaseModal
          open={showPriceWarning}
          onOpenChange={setShowPriceWarning}
          title={
            <div className="text-amber-500 flex items-center gap-2">
               <AlertTriangle className="w-5 h-5" /> Advertencia de Precio
            </div>
          }
          maxWidth="sm:max-w-md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowPriceWarning(false)}
                className="flex-1 py-2.5 rounded-xl border border-border font-black text-xs uppercase tracking-widest hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmUnpricedCheckout}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-primary-foreground font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                Confirmar Facturación
              </button>
            </>
          }
        >
            <div className="py-6 text-center space-y-4">
              <p className="font-bold text-foreground">
                Uno o más productos en el carrito no tienen un precio asignado (Precio 0 o Nulo).
              </p>
              <div className="neu-card !p-4 bg-amber-500/10 border-amber-500/20">
                 <p className="text-sm font-medium text-amber-700 leading-relaxed">
                   ¿Desea continuar con la facturación bajo su responsabilidad?
                 </p>
              </div>
              <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">
                Esta acción quedará registrada en la auditoría del sistema.
              </p>
            </div>
        </BaseModal>

        {/* Modal de Confirmación de Limpieza de Carrito */}
        <BaseModal
          open={showClearConfirm}
          onOpenChange={setShowClearConfirm}
          title="Vaciar Carrito"
          maxWidth="sm:max-w-md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-border font-black text-xs uppercase tracking-widest hover:bg-muted transition-colors"
              >
                No, volver
              </button>
              <button
                type="button"
                onClick={handleClearCart}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-black text-xs uppercase tracking-widest shadow-lg shadow-destructive/20 active:scale-95 transition-all"
              >
                Sí, vaciar
              </button>
            </>
          }
        >
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <p className="font-bold text-foreground">
              ¿Estás seguro de que deseas vaciar el carrito?
            </p>
            <p className="text-sm text-muted-foreground">
              Esta acción no se puede deshacer y todos los productos seleccionados se eliminarán.
            </p>
          </div>
        </BaseModal>

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
              emptyComponent={
                <EmptyProductsComponent
                  onClearSearch={searchTerm ? () => setSearchTerm('') : undefined}
                />
              }
              loadingComponent={<POSLoadingSkeleton layoutMode={posLayoutMode} />}
            >
              {(data) => (
                posLayoutMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {data.map(product => (
                      <div key={product.id} role="option" aria-selected={false} aria-label={`${product.name} — ${formatCurrency(product.price)}`}>
                        <ProductCard
                          product={product}
                          onClick={onAddToCart}
                          variant="pos"
                        />
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
        onSelect={(variant: any) => {
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
      />

      <SpeedDial actions={mobileActions} />

      {/* Resumen pegajoso para móviles */}
      {isMobile && cartCount > 0 && !showCart && (
        <StickyCartSummary
          itemCount={cartCount}
          total={cartTotal}
          onClick={() => setShowCart(true)}
        />
      )}
    </div>
  );
}
