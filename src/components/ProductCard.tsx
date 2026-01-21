import React from 'react';
import type { Product } from '@/types';
import ImageWithFallback from './ui/ImageWithFallback';

interface ProductCardProps {
  product: Product;
  onClick: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onClick }) => {
  return (
    <button
      type="button"
      className="p-4 rounded-xl border border-border bg-card cursor-pointer hover:shadow-lg transition-all w-full text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none group"
      onClick={() => onClick(product)}
      aria-label={`Agregar ${product.name} al carrito. Precio: $${product.price.toFixed(2)}. Stock disponible: ${product.stock_current}`}
    >
      <div className="neu-raised-sm w-16 h-16 mx-auto mb-3 flex items-center justify-center overflow-hidden">
        <ImageWithFallback
          src={product.public_image_url}
          alt={product.name}
          name={product.name}
          className="w-full h-full object-cover"
        />
      </div>
      <h3 className="font-black text-sm mb-1 text-center uppercase truncate">{product.name}</h3>
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
