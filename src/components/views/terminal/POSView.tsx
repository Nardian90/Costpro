'use client';

import React, { useMemo, useState } from 'react';
import { ShoppingCart, Search, X, Loader2, Check, Minus, Plus, Trash2, DollarSign, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import ProductCard from '@/components/ProductCard';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import type { Product, DiscountType, PaymentMethod } from '@/types';
import { toast } from 'sonner';

interface POSViewProps {
  products: Product[];
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
}

export default function POSView({
  products,
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
  onCheckout
}: POSViewProps) {
  const { theme } = useTheme();
  const [showCart, setShowCart] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');
  const [localDiscount, setLocalDiscount] = useState({ type: 'fixed', value: 0 });
  const [selectedCategory, setSelectedCategory] = useState('');

  const filteredProducts = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(lowerSearch) ||
        (p.sku && p.sku.toLowerCase().includes(lowerSearch)) ||
        (p.category && p.category.toLowerCase().includes(lowerSearch));
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  }, [products]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">TPV</h2>
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
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Cart Panel */}
        <AnimatePresence>
          {showCart && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="w-full lg:w-[400px] shrink-0 lg:sticky top-24 z-20 lg:order-last"
            >
              <div className="rounded-xl border border-primary/20 bg-card overflow-hidden shadow-2xl">
                <div className="bg-primary p-6 flex items-center justify-between text-white">
                  <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3">
                    <ShoppingCart className="w-6 h-6" />
                    Caja Registradora
                  </h3>
                  <button onClick={() => setShowCart(false)} className="p-2 hover:bg-white/10 rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-6">
                  {items.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      <ShoppingCart className="w-20 h-20 mx-auto mb-6 opacity-5" />
                      <p className="font-black uppercase tracking-widest text-sm">Carrito Vacío</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 mb-8 no-scrollbar">
                        {items.map(item => (
                          <div key={`${item.product_id}-${item.variant_id}`} className="p-4 rounded-lg border border-border bg-background/50 group relative">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex-1">
                                <div className="font-black text-sm uppercase tracking-tight truncate pr-6">{item.product.name}</div>
                                <div className="text-[10px] font-bold text-muted-foreground mt-1">${item.price.toFixed(2)} / unidad</div>
                              </div>
                              <button
                                onClick={() => onRemoveItem(item.product_id, item.variant_id)}
                                className="absolute top-2 right-2 text-muted-foreground hover:text-destructive p-2 rounded-full hover:bg-destructive/5 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1 bg-background rounded-lg p-1 border border-border">
                                <button
                                  onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-8 text-center font-black text-sm">{item.quantity}</span>
                                <button
                                  onClick={() => onUpdateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="font-black text-lg text-primary">${item.subtotal.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-6 pt-6 border-t border-border">
                        {/* Descuento */}
                        <div className="px-2 space-y-2">
                          <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Descuento (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={localDiscount.value || ''}
                            onChange={(e) => setLocalDiscount({ ...localDiscount, value: parseInt(e.target.value) || 0 })}
                            className="w-full p-2 rounded-lg border border-border bg-background text-sm font-bold focus:ring-1 focus:ring-primary outline-none"
                            placeholder="0"
                          />
                        </div>

                        <div className="flex justify-between items-center px-2">
                           <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">Total a Pagar</span>
                           <span className="text-4xl font-black text-primary tracking-tighter">${getTotal().toFixed(2)}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <button
                            onClick={() => setSelectedPayment('cash')}
                            className={cn(
                              "p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all bg-background",
                              selectedPayment === 'cash' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent"
                            )}
                           >
                             <DollarSign className={cn("w-6 h-6", selectedPayment === 'cash' ? "text-primary" : "text-muted-foreground")} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Efectivo</span>
                           </button>
                           <button
                            onClick={() => setSelectedPayment('transfer')}
                            className={cn(
                              "p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all bg-background",
                              selectedPayment === 'transfer' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent"
                            )}
                           >
                             <CreditCard className={cn("w-6 h-6", selectedPayment === 'transfer' ? "text-primary" : "text-muted-foreground")} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Transf.</span>
                           </button>
                        </div>

                        <button
                          onClick={() => onCheckout(selectedPayment, localDiscount.value > 0 ? localDiscount : null)}
                          disabled={isProcessing || items.length === 0}
                          className="w-full py-5 rounded-xl bg-primary text-white font-black text-lg shadow-2xl disabled:opacity-50 flex items-center justify-center gap-3 transition-transform active:scale-[0.98]"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                          ) : (
                            <Check className="w-6 h-6" />
                          )}
                          {isProcessing ? 'PROCESANDO...' : 'FINALIZAR VENTA'}
                        </button>

                        <button
                          onClick={() => {
                            if (confirm('¿Anular el carrito?')) {
                              onClearCart();
                              setShowCart(false);
                            }
                          }}
                          className="w-full py-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-destructive transition-colors"
                        >
                          Anular Carrito
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Product Grid */}
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
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full p-3 rounded-lg border border-border bg-background text-sm font-bold"
                  >
                    <option value="">Todas</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
             </div>
          </SearchBar>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.length > 0 ? (
              filteredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={onAddItem}
                />
              ))
            ) : (
              <div className="col-span-full py-32 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
                <Search className="w-16 h-16 mx-auto mb-6 opacity-5" />
                <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Sin resultados</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
