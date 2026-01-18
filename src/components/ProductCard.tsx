import React from 'react';
import { Package } from 'lucide-react';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  onClick: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onClick }) => {
  return (
    <button
      type="button"
      className="neu-card p-4 cursor-pointer hover:scale-105 transition-transform w-full text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      onClick={() => onClick(product)}
      aria-label={`Agregar ${product.name} al carrito. Precio: $${product.price.toFixed(2)}. Stock disponible: ${product.stock_current}`}
    >
      <div className="neu-raised-sm w-16 h-16 mx-auto mb-3 flex items-center justify-center overflow-hidden">
        {product.public_image_url ? (
          <img
            src={product.public_image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Package className="w-8 h-8 text-muted-foreground" />
        )}
      </div>
      <h3 className="font-semibold text-sm mb-1 text-center">{product.name}</h3>
      <div className="text-xs text-muted-foreground text-center mb-2">{product.sku}</div>
      <div className="text-center">
        <div className="text-lg font-bold text-primary">${product.price.toFixed(2)}</div>
        <div className="text-xs text-muted-foreground">Stock: {product.stock_current}</div>
      </div>
    </button>
  );
};

// Memoize the component to prevent unnecessary re-renders, improving performance in large lists.
export default React.memo(ProductCard);
