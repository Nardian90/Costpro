'use client';

import React from 'react';
import type { Product } from '@/types';
import { resolveProductImage, formatCurrency } from '@/lib/utils';
import { ShoppingCart } from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';

interface POSTableViewProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

const POSTableView: React.FC<POSTableViewProps> = ({ products, onAddToCart }) => {
  return (
    <div className="table-scroll-wrapper overflow-x-auto">
      <table className="data-table sticky-column-1 w-full text-sm">
        <thead>
          <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
            <th className="p-4 pl-[68px] text-left">Producto</th>
            <th className="p-4 text-left priority-low">SKU</th>
            <th className="p-4 text-right">Stock</th>
            <th className="p-4 text-right">Precio</th>
            <th className="p-4 text-center">Acción</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
              <td className="p-4" aria-label={`Producto: ${product.name}`}>
                <div className="flex items-center gap-3">
                  <div className="neu-raised-sm w-10 h-10 flex items-center justify-center overflow-hidden shrink-0">
                    <ProductImage
                      src={resolveProductImage(product)}
                      name={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="font-bold truncate max-w-[200px] text-foreground">{product.name}</div>
                </div>
              </td>
              <td className="p-4 font-mono text-xs text-muted-foreground priority-low">{product.sku || '-'}</td>
              <td className="p-4 text-right font-bold text-foreground">{product.stock_current}</td>
              <td className="p-4 text-right font-black text-primary">{formatCurrency(product.price)}</td>
              <td className="p-4">
                <div className="flex justify-center">
                  <button
                    onClick={() => onAddToCart(product)}
                    className="neu-raised-sm w-11 h-11 flex items-center justify-center text-primary hover:bg-primary hover:text-primary-foreground transition-all active:scale-90"
                    aria-label={`Agregar ${product.name} al carrito`}
                  >
                    <ShoppingCart className="w-5 h-5" />
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
