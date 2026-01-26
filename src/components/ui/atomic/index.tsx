'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { LucideIcon, Search, X, Edit, DollarSign, Package, Trash2, RefreshCw } from 'lucide-react';
import ProductImage from '../ProductImage';
import type { Product } from '@/types';

// --- BUTTONS ---

interface BaseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  label?: string;
  asChild?: boolean;
}

export const PrimaryButton: React.FC<BaseButtonProps> = ({ icon: Icon, label, className, asChild = false, children, ...props }) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] w-full sm:w-auto transition-all",
        "bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] rounded-xl",
        "hover:brightness-110 active:scale-95 shadow-lg shadow-primary/20",
        "disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap overflow-hidden",
        className
      )}
      {...props}
    >
      {asChild ? children : (
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 shrink-0" />}
          {label && <span className="truncate">{label}</span>}
          {children}
        </div>
      )}
    </Comp>
  );
};

export const SecondaryButton: React.FC<BaseButtonProps> = ({ icon: Icon, label, className, asChild = false, children, ...props }) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] w-full sm:w-auto transition-all",
        "bg-muted text-muted-foreground font-bold uppercase tracking-widest text-[10px] rounded-xl border border-border",
        "hover:bg-muted active:scale-95",
        "disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap overflow-hidden",
        className
      )}
      {...props}
    >
      {asChild ? children : (
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 shrink-0" />}
          {label && <span className="truncate">{label}</span>}
          {children}
        </div>
      )}
    </Comp>
  );
};

export const IconButton: React.FC<BaseButtonProps> = ({ icon: Icon, className, ...props }) => {
  if (!Icon) return null;
  return (
    <button
      className={cn(
        "flex items-center justify-center min-h-[44px] min-w-[44px] p-2 transition-all",
        "bg-background border border-border text-foreground rounded-xl",
        "hover:bg-muted active:scale-90 shadow-sm",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
};

// --- SEARCH ---

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({ onClear, value, className, ...props }) => {
  return (
    <div className={cn("relative w-full", className)}>
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
        <Search className="w-5 h-5" />
      </div>
      <input
        type="text"
        value={value}
        onChange={props.onChange}
        placeholder={props.placeholder}
        className={cn(
          "w-full pl-12 pr-12 py-3 min-h-[44px] text-base rounded-xl border border-border bg-background transition-all outline-none",
          "focus:ring-2 focus:ring-primary/20 focus:border-primary",
          "placeholder:text-muted-foreground/50 placeholder:uppercase placeholder:text-[10px] placeholder:tracking-widest placeholder:font-bold"
        )}
        {...props}
      />
      {value && onClear && (
        <button
          onClick={onClear}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

// --- PRODUCT CARD ---

interface ProductCardProps {
  product: Product;
  onEdit?: (product: Product) => void;
  onViewPrices?: (product: Product) => void;
  onDelete?: (product: Product) => void;
  onToggleActive?: (product: Product) => void;
  onClick?: (product: Product) => void;
  className?: string;
  variant?: 'catalog' | 'pos' | 'inventory';
}

export const CategoryChips: React.FC<{
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  className?: string;
}> = ({ categories, selectedCategory, onCategoryChange, className }) => {
  return (
    <div className={cn("w-full overflow-x-auto no-scrollbar flex flex-row gap-2 py-2 items-center", className)}>
      <button
        type="button"
        onClick={() => onCategoryChange('')}
        className={cn(
          "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border shrink-0",
          selectedCategory === ''
            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
            : "bg-background text-muted-foreground border-border hover:bg-muted"
        )}
      >
        Todas
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onCategoryChange(cat)}
          className={cn(
            "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border shrink-0",
            selectedCategory === cat
              ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          )}
        >
          {cat}
        </button>
      ))}
    </div>
  );
};

export const ProductCard: React.FC<ProductCardProps> = ({
  product, onEdit, onViewPrices, onDelete, onToggleActive, onClick, className, variant = 'catalog'
}) => {
  const isOutOfStock = product.stock_current <= 0;
  const isLowStock = product.stock_current <= (product.min_stock || 0);

  if (variant === 'pos') {
    return (
      <button
        type="button"
        onClick={() => !isOutOfStock && onClick?.(product)}
        className={cn(
          "flex flex-row items-center gap-4 p-3 rounded-2xl border border-border bg-card transition-all w-full text-left",
          isOutOfStock ? "opacity-60 cursor-not-allowed" : "hover:shadow-md active:scale-[0.98]",
          className
        )}
      >
        <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-muted">
           <ProductImage src={product.public_image_url} alt={product.name} name={product.name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-black text-xs uppercase truncate mb-1">{product.name}</h4>
          <div className="text-lg font-black text-primary">${product.price.toFixed(2)}</div>
        </div>
      </button>
    );
  }

  return (
    <div className={cn(
      "neu-card !p-4 border border-white/5 flex flex-col gap-4 w-full max-w-full overflow-hidden transition-all hover:shadow-lg relative",
      !product.is_active && "opacity-75 grayscale-[0.3] bg-muted/20",
      className
    )}>
      <div className="w-full aspect-square sm:aspect-video rounded-xl overflow-hidden bg-background/50 flex items-center justify-center shrink-0 relative group">
        <ProductImage
          src={product.public_image_url || product.image_url}
          alt={product.name}
          name={product.name}
          className="w-full h-full"
        />
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {!product.is_active && (
            <div className="bg-danger text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shadow-lg">
              Inactivo
            </div>
          )}
          {variant === 'inventory' && (
            <div
              className={cn(
                "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md",
                isLowStock ? "bg-danger/20 text-danger border-danger/30" : "bg-success/20 text-success border-success/30"
              )}
            >
              {isLowStock ? 'Stock Bajo' : 'En Stock'}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-col mb-1">
          {variant === 'inventory' && (
             <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">{product.category || 'General'}</span>
          )}
          <h3 className="font-black text-base uppercase tracking-tight truncate">{product.name}</h3>
        </div>

        {variant !== 'inventory' && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 min-h-[30px] mb-4">
            {product.description || 'Sin descripción disponible'}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-2 rounded-lg bg-muted/30 border border-white/5 text-center">
            <div className="text-[8px] font-black uppercase text-muted-foreground mb-0.5">Costo</div>
            <div className="font-bold text-xs">${product.cost_price?.toFixed(2) || '0.00'}</div>
          </div>
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/10 text-center">
            <div className="text-[8px] font-black uppercase text-primary mb-0.5">Venta</div>
            <div className="font-black text-xs text-primary">${product.price?.toFixed(2) || '0.00'}</div>
          </div>
        </div>

        {variant === 'inventory' && (
           <div className="neu-inset-sm !p-3 bg-background/50 border border-white/5 mb-4">
              <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Stock Disponible</span>
                  <span className={cn("font-black text-xl", isLowStock ? "text-danger" : "text-foreground")}>
                    {product.stock_current}
                  </span>
              </div>
           </div>
        )}

        <div className="flex flex-col gap-2">
          {variant === 'inventory' ? (
             <PrimaryButton
                label="Ajustar Stock"
                icon={Edit}
                onClick={() => onEdit?.(product)}
             />
          ) : (
            <>
              {onEdit && (
                <PrimaryButton
                  label="Info / Editar"
                  icon={Edit}
                  onClick={() => onEdit(product)}
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                {onViewPrices && (
                  <SecondaryButton
                    label="Precios"
                    icon={DollarSign}
                    onClick={() => onViewPrices(product)}
                    className="w-full"
                  />
                )}
                {variant === 'catalog' && (
                  <>
                    {product.has_movements ? (
                      <SecondaryButton
                        label={product.is_active ? "Desactivar" : "Reactivar"}
                        icon={product.is_active ? Trash2 : RefreshCw}
                        onClick={() => onToggleActive?.(product)}
                        className={cn(
                          "w-full",
                          !product.is_active && "bg-success/10 text-success border-success/20 hover:bg-success/20"
                        )}
                      />
                    ) : (
                      <SecondaryButton
                        label="Eliminar"
                        icon={Trash2}
                        onClick={() => onDelete?.(product)}
                        className="w-full text-danger border-danger/20 hover:bg-danger/10"
                      />
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
