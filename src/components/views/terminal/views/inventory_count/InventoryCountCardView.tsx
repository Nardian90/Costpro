'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Package, Minus, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtendedProduct } from './useInventoryCount';

interface InventoryCountCardProps {
  products: ExtendedProduct[];
  countedQuantities: { [key: string]: number };
  onQuantityChange: (productId: string, quantity: number) => void;
  loading: boolean;
  onRemoveProduct?: (productId: string) => void;
  samplePercentage?: number;
  showRemoveButton?: boolean;
}

export default function InventoryCountCard({
  products,
  countedQuantities,
  onQuantityChange,
  loading,
  onRemoveProduct,
  samplePercentage = 100,
  showRemoveButton = false,
}: InventoryCountCardProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="neu-card h-48 animate-pulse bg-muted/20" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-20 text-center">
        <Package className="w-16 h-16 mx-auto mb-4 opacity-5" />
        <p className="font-black uppercase text-muted-foreground text-sm tracking-widest">No se encontraron productos</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <AnimatePresence mode="popLayout">
        {products.map((product) => {
          const counted = countedQuantities[product.id] ?? product.stock_current;
          const diff = counted - product.stock_current;

          return (
            <motion.div
              key={product.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="neu-card group hover:border-primary/30 transition-all duration-300 flex flex-col justify-between overflow-hidden"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1 flex-1 min-w-0">
                    <h3 className="font-black text-sm uppercase tracking-tight leading-tight line-clamp-2">
                      {product.name}
                    </h3>
                    <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      {product.sku || 'SIN SKU'} • {product.category || 'GENERAL'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-xs font-black uppercase tracking-tighter",
                      diff === 0 ? "bg-muted/10 text-muted-foreground/50" :
                      diff > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                    )}>
                      {diff === 0 ? 'Sin cambios' : diff > 0 ? `+${diff}` : diff}
                    </span>
                    {showRemoveButton && onRemoveProduct && (
                      <button
                        onClick={() => onRemoveProduct(product.id)}
                        className="p-1.5 hover:bg-rose-500/10 text-rose-500 rounded-lg transition-colors"
                        aria-label={`Quitar ${product.name} del conteo`}
                        title="Quitar del conteo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="neu-inset-sm !p-3 bg-muted/5">
                    <p className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1">Stock Teórico</p>
                    <p className="text-xl font-black text-foreground">{product.stock_current}</p>
                  </div>
                  <div className="neu-inset-sm !p-3 bg-primary/5 border-primary/10">
                    <p className="text-xs font-black uppercase text-primary tracking-widest mb-1">Stock Físico</p>
                    <p className="text-xl font-black text-primary">{counted}</p>
                  </div>
                </div>

                {/* Sample percentage badge */}
                <div className="flex justify-end">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                    samplePercentage >= 80 ? "bg-success/10 text-success" :
                    samplePercentage >= 50 ? "bg-amber-500/10 text-amber-600" :
                    "bg-danger/10 text-danger"
                  )}>
                    Muestra: {samplePercentage}%
                  </span>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <button
                  onClick={() => onQuantityChange(product.id, Math.max(0, counted - 1))}
                  className="neu-btn h-12 w-12 !p-3 hover:bg-danger/10 hover:text-danger group-active:scale-90 transition-all"
                >
                  <Minus className="w-5 h-5" />
                </button>

                <div className="flex-1 relative">
                  <input
                    type="number"
                    value={counted}
                    onChange={(e) => onQuantityChange(product.id, parseFloat(e.target.value) || 0)}
                    aria-label={`Stock físico para ${product.name}`}
                    className="neu-input w-full h-12 text-center font-black text-xl text-primary bg-primary/5 border-primary/20 focus:ring-4 ring-primary/10 transition-all"
                  />
                </div>

                <button
                  onClick={() => onQuantityChange(product.id, counted + 1)}
                  className="neu-btn h-12 w-12 !p-3 hover:bg-success/10 hover:text-success group-active:scale-90 transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
