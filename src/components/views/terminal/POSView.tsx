'use client';

import React, { useState } from 'react';
import { ShoppingCart, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import ProductCard from '@/components/ProductCard';
import POSTableView from '@/components/POSTableView';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { AnimatePresence } from 'framer-motion';
import type { Product, PaymentMethod } from '@/types';
import { usePOSProducts } from '@/hooks/usePOSProducts';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import { POSCart } from './POSCart';

interface POSViewProps {
  products: Product[];
  isLoading: boolean;
  error: Error | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  items: any[];
  onAddItem: (product: Product) => void;
  onRemoveItem: (productId: string, variantId: string | null) => void;
  onUpdateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  onClearCart: () => void;
  getTotal: () => number;
  getSubtotal: () => number;
  getItemCount: () => number;
  isProcessing: boolean;
  onCheckout: (paymentMethod: PaymentMethod, discount?: { type: string, value: number } | null) => Promise<void>;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

const EmptyProductsComponent = () => (
  <div className="col-span-full py-32 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
    <Search className="w-16 h-16 mx-auto mb-6 opacity-5" />
    <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Sin resultados</p>
    <p className="text-sm text-muted-foreground mt-2">Intenta con otra búsqueda o filtro.</p>
  </div>
);

export default function POSView({
  products,
  isLoading,
  error,
  searchTerm,
  onSearchChange,
  items,
  onAddItem,
  onRemoveItem,
  onUpdateQuantity,
  onClearCart,
  getTotal,
  getSubtotal,
  getItemCount,
  isProcessing,
  onCheckout,
  viewMode = 'grid',
  onViewModeChange
}: POSViewProps) {
  const [showCart, setShowCart] = useState(false);
  const isMobile = useIsMobile();
  const { filteredProducts, categories, selectedCategory, handleCategoryChange, isPending } = usePOSProducts(products, searchTerm);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">TPV</h2>
          {onViewModeChange && (
            <ViewSwitcher currentView={viewMode} onViewChange={onViewModeChange} />
          )}
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
              onRemoveItem={onRemoveItem}
              onUpdateQuantity={onUpdateQuantity}
              onClearCart={onClearCart}
              getTotal={getTotal}
              isProcessing={isProcessing}
              onCheckout={onCheckout}
              onClose={() => setShowCart(false)}
            />
          )}
        </AnimatePresence>

        {isMobile && (
          <Drawer open={showCart} onOpenChange={setShowCart}>
            <DrawerContent className="p-0 border-none bg-transparent">
              <POSCart
                items={items}
                onRemoveItem={onRemoveItem}
                onUpdateQuantity={onUpdateQuantity}
                onClearCart={onClearCart}
                getTotal={getTotal}
                isProcessing={isProcessing}
                onCheckout={onCheckout}
                onClose={() => setShowCart(false)}
              />
            </DrawerContent>
          </Drawer>
        )}

        <div className="flex-1 w-full space-y-6 lg:order-first">
          <SearchBar
            value={searchTerm}
            onChange={onSearchChange}
            placeholder="Buscar productos..."
            showSettings={true}
          >
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase mb-1 block">Categoría</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full p-3 rounded-lg border border-border bg-background text-sm font-bold"
                  >
                    <option value="">Todas</option>
                    {categories.map(cat => (
                      <option key={cat || 'uncategorized'} value={cat || ""}>{cat || 'Sin categoría'}</option>
                    ))}
                  </select>
                </div>
             </div>
          </SearchBar>

          <div className={cn(isPending && "opacity-50 transition-opacity")}>
            <StateRenderer
              isLoading={isLoading}
              error={error}
              data={filteredProducts}
              emptyComponent={<EmptyProductsComponent />}
            >
              {(data) => (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {data.map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onClick={onAddItem}
                        variant="pos"
                      />
                    ))}
                  </div>
                ) : (
                  <POSTableView products={data} onAddToCart={onAddItem} />
                )
              )}
            </StateRenderer>
          </div>
        </div>
      </div>
    </div>
  );
}
