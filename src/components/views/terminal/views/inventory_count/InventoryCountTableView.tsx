'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Package, Trash2 } from 'lucide-react';
import { ExtendedProduct } from './useInventoryCount';

interface InventoryCountTableViewProps {
  products: ExtendedProduct[];
  countedQuantities: { [key: string]: number };
  onQuantityChange: (productId: string, quantity: number) => void;
  loading: boolean;
  onRemoveProduct?: (productId: string) => void;
  samplePercentage?: number;
  showRemoveButton?: boolean;
}

export default function InventoryCountTableView({
  products,
  countedQuantities,
  onQuantityChange,
  loading,
  onRemoveProduct,
  samplePercentage = 100,
  showRemoveButton = false,
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
            <th className="p-4 text-center">% Muestra</th>
            {showRemoveButton && <th className="p-4 text-center w-12"></th>}
          </tr>
        </thead>
        <tbody className="bg-background/30 backdrop-blur-sm">
          {loading ? (
            <tr aria-label="Cargando catálogo">
              <td colSpan={showRemoveButton ? 6 : 5} className="p-20 text-center">
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                  <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Cargando catálogo...</p>
                </div>
              </td>
            </tr>
          ) : products.length === 0 ? (
            <tr>
              <td colSpan={showRemoveButton ? 6 : 5} className="p-20 text-center">
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
                        onChange={(e) => onQuantityChange(product.id, parseFloat(e.target.value) || 0)}
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
                  <td data-label="% Muestra" className="p-4 text-center">
                    <span className={cn(
                      "text-xs font-black uppercase tracking-widest px-2 py-1 rounded-full",
                      samplePercentage >= 80 ? "bg-success/10 text-success" :
                      samplePercentage >= 50 ? "bg-amber-500/10 text-amber-600" :
                      "bg-danger/10 text-danger"
                    )}>
                      {samplePercentage}%
                    </span>
                  </td>
                  {showRemoveButton && onRemoveProduct && (
                    <td className="p-4 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveProduct(product.id); }}
                        className="p-2 hover:bg-rose-500/10 text-rose-500 rounded-xl transition-colors"
                        aria-label={`Quitar ${product.name} del conteo`}
                        title="Quitar del conteo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
