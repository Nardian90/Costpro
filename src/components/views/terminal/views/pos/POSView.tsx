'use client';

import React, { useState } from 'react';
import { ShoppingCart, Search, X, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { ProductCard, CategoryChips } from '@/components/ui/atomic';
import POSTableView from './POSTableView';
import ViewSwitcher from '@/components/ui/ViewSwitcher';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence } from 'framer-motion';
import { usePOSProducts } from '@/hooks/logic/usePOSProducts';
import { useIsMobile } from '@/hooks/ui/useMobile';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { POSCart } from './POSCart';
import { StickyCartSummary } from './StickyCartSummary';
import { usePOSView } from './usePOSView';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { PriceSelectorModal } from '@/components/modals/PriceSelectorModal';
import { BarcodeScanner } from '@/components/modals/BarcodeScanner';
import { Product } from '@/types';
import { QrCode } from 'lucide-react';
import { SpeedDial, SpeedDialAction } from '@/components/ui/SpeedDial';

const EmptyProductsComponent = ({ onClearSearch }: { onClearSearch?: () => void }) => (
  <div className="col-span-full py-32 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
    <Search className="w-16 h-16 mx-auto mb-6 opacity-5" />
    <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Sin resultados</p>
    <p className="text-sm text-muted-foreground mt-2">Intenta con otra búsqueda o filtro.</p>
    {onClearSearch && (
      <SecondaryButton
        label="Limpiar búsqueda"
        onClick={onClearSearch}
        className="mt-6 mx-auto"
        icon={X}
      />
    )}
  </div>
);

const POSLoadingSkeleton = ({ layoutMode }: { layoutMode: 'grid' | 'table' }) => {
  if (layoutMode === 'table') {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="neu-card p-4 space-y-4 h-64">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex justify-between items-center pt-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default function POSView() {
  const {
    searchTerm,
    setSearchTerm,
    posLayoutMode,
    setPosLayoutMode,
    products,
    isLoadingProducts,
    productsError,
    items,
    handleAddItem,
    removeItem,
    updateQuantity,
    clearCart,
    getSubtotal,
    getDiscountAmount,
    getTaxAmount,
    getTotal,
    discount,
    setDiscount,
    appliedTaxes,
    toggleTax,
    getItemCount,
    startCheckout,
    confirmUnpricedCheckout,
    showPriceWarning,
    setShowPriceWarning,
    lastSale,
    setLastSale,
    isProcessingSale,
  } = usePOSView();

  const [showCart, setShowCart] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<Product | null>(null);
  const isMobile = useIsMobile();
  const { filteredProducts, categories, selectedCategory, handleCategoryChange, isPending } = usePOSProducts(products, searchTerm);

  const onAddToCart = (product: Product) => {
    if (product.product_variants && product.product_variants.length > 0) {
      setSelectedProductForVariants(product);
    } else {
      handleAddItem(product);
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

  const handleClearCart = () => {
    clearCart();
    setShowClearConfirm(false);
    toast.success('Carrito vaciado');
  };

  const cartButton = (
    <ActionMenu
      actions={[
        {
          id: 'cart',
          label: isMobile ? `(${getItemCount()})` : `Caja (${getItemCount()})`,
          icon: ShoppingCart,
          onClick: () => setShowCart(!showCart),
          variant: getItemCount() > 0 ? 'primary' : 'outline',
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
      label: `Caja (${getItemCount()})`,
      icon: ShoppingCart,
      onClick: () => setShowCart(true),
      category: 'Acción',
      variant: getItemCount() > 0 ? 'success' : 'primary'
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
        if (getItemCount() > 0) {
          setShowClearConfirm(true);
        }
      },
      category: 'Edición',
      variant: 'destructive'
    }
  ];

  return (
    <div className="space-y-6">
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
            <POSCart
              items={items}
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
              isProcessing={isProcessingSale}
              onCheckout={startCheckout}
              onClose={() => setShowCart(false)}
              lastSale={lastSale}
              onClearLastSale={() => {
                setLastSale(null);
                setShowCart(false);
              }}
            />
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
              <SecondaryButton
                onClick={() => setShowPriceWarning(false)}
                label="Cancelar"
                className="flex-1"
              />
              <PrimaryButton
                onClick={confirmUnpricedCheckout}
                label="Confirmar Facturación"
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-primary-foreground shadow-amber-500/20"
              />
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
              <SecondaryButton
                onClick={() => setShowClearConfirm(false)}
                label="No, volver"
                className="flex-1"
              />
              <PrimaryButton
                onClick={handleClearCart}
                label="Sí, vaciar"
                className="flex-1"
                variant="destructive"
              />
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
                />
              </div>
            </div>

            <CategoryChips
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategoryChange}
            />
          </div>

          <div className={cn("flex-1 overflow-hidden", isPending && "opacity-50 transition-opacity")}>
            <StateRenderer
              isLoading={isLoadingProducts}
              error={productsError}
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
                      <ProductCard
                        key={product.id}
                        product={product}
                        onClick={onAddToCart}
                        variant="pos"
                      />
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
        onSelect={(variant) => {
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
    </div>
  );
}
