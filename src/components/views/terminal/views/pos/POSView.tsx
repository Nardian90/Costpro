'use client';

import React, { useState } from 'react';
import { ShoppingCart, Search, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
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
} from '@/components/ui/drawer';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { POSCart } from './POSCart';
import { usePOSView } from './usePOSView';
import { QueryInspector } from '@/components/ui/QueryInspector';

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
    isProcessingSale,
  } = usePOSView();

  const [showCart, setShowCart] = useState(false);
  const isMobile = useIsMobile();
  const { filteredProducts, categories, selectedCategory, handleCategoryChange, isPending } = usePOSProducts(products, searchTerm);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase hidden sm:block">TPV</h2>
          <ViewSwitcher currentView={posLayoutMode} onViewChange={setPosLayoutMode} />
        </div>
        {!isMobile && (
          <ActionMenu
            actions={[
              {
                id: 'cart',
                label: getItemCount() > 0
                  ? `Caja (${getItemCount()}) - ${formatCurrency(getTotal())}`
                  : `Caja (${getItemCount()})`,
                icon: ShoppingCart,
                onClick: () => setShowCart(!showCart),
                variant: getItemCount() > 0 ? 'primary' : 'outline',
                active: showCart
              }
            ]}
            className="sm:w-auto"
            position="top"
          />
        )}
      </div>

      <QueryInspector />

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <AnimatePresence>
          {showCart && !isMobile && (
            <POSCart
              items={items}
              onRemoveItem={removeItem}
              onUpdateQuantity={updateQuantity}
              onClearCart={clearCart}
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
            />
          )}
        </AnimatePresence>

        {isMobile && (
          <Drawer open={showCart} onOpenChange={setShowCart}>
            <DrawerContent className="p-0 border-none bg-transparent max-h-[85vh]">
              <POSCart
                items={items}
                onRemoveItem={removeItem}
                onUpdateQuantity={updateQuantity}
                onClearCart={clearCart}
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
              />
            </DrawerContent>
          </Drawer>
        )}

        {/* Modal de Advertencia de Precio */}
        <BaseModal
          open={showPriceWarning}
          onOpenChange={setShowPriceWarning}
          title={
            <div className="text-amber-500 flex items-center gap-2">
               ⚠ Advertencia de Precio
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
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20"
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
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                Esta acción quedará registrada en la auditoría del sistema.
              </p>
            </div>
        </BaseModal>

        <div className="flex-1 w-full space-y-6 lg:order-first">
          <div className="space-y-4 sticky top-[76px] z-40 bg-background/95 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 shadow-xl sm:relative sm:top-0 sm:bg-transparent sm:pb-0 sm:pt-0 sm:mx-0 sm:px-0 sm:shadow-none">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Buscar productos..."
              showSettings={false}
            />

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
                    {data.map(product => {
                      const quantity = items.find(i => i.product_id === product.id)?.quantity || 0;
                      return (
                        <ProductCard
                          key={product.id}
                          product={product}
                          cartQuantity={quantity}
                          onClick={(p) => {
                            handleAddItem(p);
                            toast.success(`${p.name} añadido`);
                          }}
                          variant="pos"
                        />
                      );
                    })}
                  </div>
                ) : (
                  <POSTableView products={data} onAddToCart={(p) => {
                    handleAddItem(p);
                    toast.success(`${p.name} añadido`);
                  }} />
                )
              )}
            </StateRenderer>
          </div>
        </div>
      </div>

      {isMobile && (
        <ActionMenu
          actions={[
            {
              id: 'cart',
              label: getItemCount() > 0
                ? `Caja (${getItemCount()}) - ${formatCurrency(getTotal())}`
                : `Caja Vacía`,
              icon: ShoppingCart,
              onClick: () => setShowCart(!showCart),
              variant: getItemCount() > 0 ? 'primary' : 'outline',
              active: showCart,
              className: getItemCount() > 0 ? "neu-pulse" : ""
            }
          ]}
          className="w-full"
          position="bottom"
        />
      )}
    </div>
  );
}
