'use client';

import React from 'react';
import { Product, ProductVariant } from '@/types';
import { cn } from '@/lib/utils';
import { Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExtendedProduct } from './useInventoryCount';

interface InventoryCountTableViewProps {
  products: ExtendedProduct[];
  countedQuantities: { [key: string]: number };
  onQuantityChange: (productId: string, quantity: number) => void;
  loading: boolean;
}

export default function InventoryCountTableView({
  products,
  countedQuantities,
  onQuantityChange,
  loading
}: InventoryCountTableViewProps) {
  return (
    <div className="overflow-x-auto table-to-cards force-table rounded-2xl shadow-xl border border-white/5 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em] text-primary/70">
            <th className="p-4 text-left">Producto / SKU</th>
            <th className="p-4 text-right">Stock Teórico</th>
            <th className="p-4 text-center">Stock Físico (Contado)</th>
            <th className="p-4 text-right">Desviación</th>
          </tr>
        </thead>
        <tbody className="bg-background/30 backdrop-blur-sm">
          {loading ? (
            <tr aria-label="Cargando catálogo">
              <td colSpan={4} className="p-20 text-center">
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                  <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Cargando catálogo...</p>
                </div>
              </td>
            </tr>
          ) : products.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-20 text-center">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-5" />
                <p className="font-black uppercase text-muted-foreground text-sm tracking-widest">No se encontraron productos</p>
              </td>
            </tr>
          ) : (
            products.map(product => {
              const counted = countedQuantities[product.id] ?? product.stock_current;
              const diff = counted - product.stock_current;

              return (
                <tr key={product.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors group">
                  <td data-label="Producto" className="p-4">
                    <div className="font-black text-sm uppercase tracking-tight">{product.name}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-1">{product.sku || '-'} • {product.category || 'General'}</div>
                  </td>
                  <td data-label="Teórico" className="p-4 text-right font-black text-lg text-muted-foreground">{product.stock_current}</td>
                  <td data-label="Contado" className="p-4">
                    <div className="flex justify-center">
                      <input
                        type="number"
                        value={counted}
                        onChange={(e) => onQuantityChange(product.id, parseInt(e.target.value) || 0)}
                        aria-label={`Stock físico para ${product.name}`}
                        className="neu-input w-28 h-12 text-center font-black text-xl text-primary bg-primary/5 border-primary/20 transition-all focus:ring-4 focus:ring-primary/10"
                      />
                    </div>
                  </td>
                  <td data-label="Diferencia" className="p-4 text-right">
                    <span className={cn(
                      "text-lg font-black",
                      diff === 0 ? "text-muted-foreground/30" :
                      diff > 0 ? "text-success" : "text-danger"
                    )}>
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
