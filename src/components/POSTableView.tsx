'use client';

import React from 'react';
import type { Product } from '@/types';
import { ShoppingCart } from 'lucide-react';
import ImageWithFallback from './ui/ImageWithFallback';

interface POSTableViewProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

const POSTableView: React.FC<POSTableViewProps> = ({ products, onAddToCart }) => {
  return (
    <div className="responsive-table-container">
      <table className="w-full text-sm">
        <thead className="sticky-header">
          <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest text-left">
            <th className="p-4 pl-[68px]">Producto</th>
            <th className="p-4 priority-low">SKU</th>
            <th className="p-4 text-right">Stock</th>
            <th className="p-4 text-right">Precio</th>
            <th className="p-4 text-center">Acción</th>
          </tr>
        </thead>
        <tbody className="bg-background/30 backdrop-blur-sm">
          {products.map((product) => (
            <tr key={product.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors group">
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <div className="neu-raised-sm w-10 h-10 flex items-center justify-center overflow-hidden shrink-0">
                    <ImageWithFallback
                      alt={product.name}
                      name={product.name}
                      className="w-full h-full object-cover"
                      forcePlaceholder={true}
                    />
                  </div>
                  <div className="font-bold truncate max-w-[200px]">{product.name}</div>
                </div>
              </td>
              <td className="p-4 font-mono text-xs text-muted-foreground priority-low">{product.sku || '-'}</td>
              <td className="p-4 text-right font-bold">{product.stock_current}</td>
              <td className="p-4 text-right font-black text-primary">${product.price.toFixed(2)}</td>
              <td className="p-4">
                <div className="flex justify-center">
                  <button
                    onClick={() => onAddToCart(product)}
                    className="neu-raised-sm p-2 text-primary hover:bg-primary hover:text-white transition-all active:scale-90"
                    aria-label={`Agregar ${product.name} al carrito`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default POSTableView;
