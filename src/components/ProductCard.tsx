import React from 'react';
import type { Product } from '@/types';
import ImageWithFallback from './ui/ImageWithFallback';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  onClick: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onClick }) => {
  const isOutOfStock = product.stock_current <= 0;

  return (
    <button
      type="button"
      className={cn(
        "p-4 sm:p-5 rounded-2xl border border-border bg-card transition-all w-full text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none group relative overflow-hidden",
        isOutOfStock
          ? "opacity-60 cursor-not-allowed bg-card/50"
          : "cursor-pointer hover:shadow-xl hover:-translate-y-1 active:scale-[0.98]"
      )}
      onClick={() => !isOutOfStock && onClick(product)}
      disabled={isOutOfStock}
      aria-label={`Agregar ${product.name} al carrito. Precio: $${product.price.toFixed(2)}. Stock disponible: ${product.stock_current}`}
    >
      {isOutOfStock && (
        <div className="absolute top-3 right-3 bg-destructive text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest z-10 shadow-lg">
          Agotado
        </div>
      )}

      <div className="flex flex-row sm:flex-col items-center gap-4 sm:gap-2">
        <div className="neu-raised-sm w-20 h-20 sm:w-32 sm:h-32 sm:mx-auto flex items-center justify-center overflow-hidden shrink-0 aspect-square rounded-xl">
          <ImageWithFallback
            src={product.public_image_url}
            alt={product.name}
            name={product.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-110"
          />
        </div>

        <div className="flex-1 min-w-0 sm:text-center w-full">
          <h3 className="font-black text-sm sm:text-base mb-0.5 sm:mb-1 uppercase truncate text-foreground tracking-tight">
            {product.name}
          </h3>
          <div className="text-[9px] sm:text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-widest">
            {product.sku || 'SIN SKU'}
          </div>

          <div className="flex sm:flex-col items-center sm:justify-center justify-between gap-2">
            <div className="text-lg sm:text-2xl font-black text-primary tracking-tighter">
              ${product.price.toFixed(2)}
            </div>
            <div className={cn(
              "text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest",
              isOutOfStock
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            )}>
              {isOutOfStock ? 'Sin Stock' : `${product.stock_current} DISP.`}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

// Memoize the component to prevent unnecessary re-renders, improving performance in large lists.
export default React.memo(ProductCard);
