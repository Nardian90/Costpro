'use client';

import React, { useState } from 'react';
import { ShoppingCart, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { ProductCard, CategoryChips } from '@/components/ui/atomic';
import POSTableView from './POSTableView';
import ViewSwitcher from '@/components/ui/ViewSwitcher';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence } from 'framer-motion';
import { usePOSProducts } from '@/hooks/usePOSProducts';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import { POSCart } from './POSCart';
import { usePOSView } from './usePOSView';

const EmptyProductsComponent = () => (
  <div className="col-span-full py-32 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
    <Search className="w-16 h-16 mx-auto mb-6 opacity-5" />
    <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Sin resultados</p>
    <p className="text-sm text-muted-foreground mt-2">Intenta con otra búsqueda o filtro.</p>
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
    items,
    handleAddItem,
    removeItem,
    updateQuantity,
    clearCart,
    getTotal,
    getItemCount,
    handleCheckout,
    isProcessingSale,
  } = usePOSView();

  const [showCart, setShowCart] = useState(false);
  const isMobile = useIsMobile();
  const { filteredProducts, categories, selectedCategory, handleCategoryChange, isPending } = usePOSProducts(products, searchTerm);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">TPV</h2>
          <ViewSwitcher currentView={posLayoutMode} onViewChange={setPosLayoutMode} />
        </div>
        <ActionMenu
          actions={[
            {
              id: 'cart',
              label: `Caja (${getItemCount()})`,
              icon: ShoppingCart,
              onClick: () => setShowCart(!showCart),
              variant: getItemCount() > 0 ? 'primary' : 'outline',
              active: showCart
            }
          ]}
          className="sm:w-auto"
          position={isMobile ? 'bottom' : 'top'}
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <AnimatePresence>
          {showCart && !isMobile && (
            <POSCart
              items={items}
              onRemoveItem={removeItem}
              onUpdateQuantity={updateQuantity}
              onClearCart={clearCart}
              getTotal={getTotal}
              isProcessing={isProcessingSale}
              onCheckout={handleCheckout}
              onClose={() => setShowCart(false)}
            />
          )}
        </AnimatePresence>

        {isMobile && (
          <Drawer open={showCart} onOpenChange={setShowCart}>
            <DrawerContent className="p-0 border-none bg-transparent">
              <POSCart
                items={items}
                onRemoveItem={removeItem}
                onUpdateQuantity={updateQuantity}
                onClearCart={clearCart}
                getTotal={getTotal}
                isProcessing={isProcessingSale}
                onCheckout={handleCheckout}
                onClose={() => setShowCart(false)}
              />
            </DrawerContent>
          </Drawer>
        )}

        <div className="flex-1 w-full space-y-6 lg:order-first">
          <div className="space-y-4">
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

          <div className={cn(isPending && "opacity-50 transition-opacity")}>
            <StateRenderer
              isLoading={isLoadingProducts}
              error={null}
              data={filteredProducts}
              emptyComponent={<EmptyProductsComponent />}
              loadingComponent={<POSLoadingSkeleton layoutMode={posLayoutMode} />}
            >
              {(data) => (
                posLayoutMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {data.map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onClick={handleAddItem}
                        variant="pos"
                      />
                    ))}
                  </div>
                ) : (
                  <POSTableView products={data} onAddToCart={handleAddItem} />
                )
              )}
            </StateRenderer>
          </div>
        </div>
      </div>
    </div>
  );
}
