import React from 'react';
import Image from 'next/image';
import {
  Building,
  Edit,
  Trash2,
  Plus,
  RotateCcw,
  Target,
  Check,
  Eye,
  Search,
  Download,
  Tag,
  Camera,
  Printer,
  RefreshCw,
  DollarSign,
  Package,
  LayoutGrid,
  List,
  X
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

// Helper component for horizontal scroll
const HorizontalScroll: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("flex overflow-x-auto no-scrollbar", className)}>
    {children}
  </div>
);

// Helper for product images
export const ProductImage: React.FC<{ src?: string; alt?: string; name?: string; className?: string; forceShow?: boolean; width?: number; height?: number }> = ({ src, alt, name, className, forceShow, width = 64, height = 64 }) => {
  if (src) return <Image src={src} alt={alt || name || 'Product image'} width={width} height={height} className={cn("object-cover", className)} unoptimized />;
  if (forceShow) return <div className={cn("bg-muted flex items-center justify-center text-muted-foreground", className)}><Package className="w-1/3 h-1/3 opacity-20" /></div>;
  return (
    <div className={cn("bg-muted flex items-center justify-center text-muted-foreground", className)}>
      <span className="text-xl font-bold">{(name || '?').charAt(0).toUpperCase()}</span>
    </div>
  );
};

const resolveProductImage = (product: any) => product.public_image_url || product.image_url;

export interface PrimaryButtonProps {
  label?: string;
  icon?: any;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  asChild?: boolean;
  children?: React.ReactNode;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ label, icon: Icon, onClick, className, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "w-full py-2.5 rounded-xl bg-primary text-foreground font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50",
      className
    )}
  >
    {Icon && <Icon className="w-3.5 h-3.5" />}
    {label}
    {children}
  </button>
);

export const SecondaryButton: React.FC<PrimaryButtonProps> = ({ label, icon: Icon, onClick, className, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "py-2 rounded-xl border border-border hover:bg-muted font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-50",
      className
    )}
  >
    {Icon && <Icon className="w-3 h-3" />}
    {label}
    {children}
  </button>
);

export const IconButton: React.FC<{ icon: any; onClick: () => void; label?: string; title?: string; className?: string; variant?: 'ghost' | 'outline' | 'primary' }> = ({ icon: Icon, onClick, label, title, className, variant = 'ghost' }) => (
  <button
    onClick={onClick}
    aria-label={label || title}
    title={title}
    className={cn(
      "p-2 rounded-lg transition-all active:scale-90",
      variant === 'ghost' && "hover:bg-muted text-muted-foreground hover:text-foreground",
      variant === 'outline' && "border border-border hover:bg-muted text-muted-foreground hover:text-foreground",
      variant === 'primary' && "bg-primary text-foreground shadow-lg shadow-primary/20",
      className
    )}
  >
    <Icon className="w-4 h-4" />
  </button>
);

export const SearchInput: React.FC<any> = ({ value, onChange, placeholder, ariaLabel, className, ...props }) => (
  <div className={cn("relative group", className)}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder || 'Buscar'}
      className="w-full bg-muted/20 border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
      {...props}
    />
    {value && (
      <button
        onClick={() => onChange('')}
        aria-label="Limpiar búsqueda"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

export const CategoryChips: React.FC<{
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  className?: string;
}> = ({ categories, selectedCategory, onCategoryChange, className }) => {
  return (
    <div
      role="radiogroup"
      aria-label="Filtrar inventario por categoría"
      className={cn("flex overflow-x-auto no-scrollbar gap-2 py-2", className)}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selectedCategory === ''}
        onClick={() => onCategoryChange('')}
        aria-label="Mostrar todos los productos"
        className={cn(
          "px-5 py-3 min-h-[44px] rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border shrink-0 flex items-center justify-center",
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
          role="radio"
          aria-checked={selectedCategory === cat}
          onClick={() => onCategoryChange(cat)}
          aria-label={`Filtrar por ${cat}`}
          className={cn(
            "px-5 py-3 min-h-[44px] rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border shrink-0 flex items-center justify-center",
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

export const ProductCard: React.FC<any> = ({
  product, onEdit, onViewPrices, onDelete, onToggleActive, onPrintLabel, onClick, className, variant = 'catalog'
}) => {
  const isOutOfStock = product.stock_current <= 0;
  const isLowStock = product.stock_current <= (product.min_stock || 0);
  const hasImage = !!(product.public_image_url || product.image_url);
  const variantCount = product.product_variants?.length || 0;

  if (variant === 'pos') {
    return (
      <button
        type="button"
        onClick={() => !isOutOfStock && onClick?.(product)}
        aria-label={`Agregar ${product.name} al carrito. Precio: ${formatCurrency(product.price)}. Stock: ${product.stock_current}`}
        className={cn(
          "flex flex-row items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-border bg-card transition-all w-full text-left relative overflow-hidden",
          isOutOfStock ? "opacity-60 cursor-not-allowed" : "hover:shadow-md active:scale-[0.98]",
          className
        )}
      >
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl overflow-hidden shrink-0 bg-muted">
           <ProductImage src={resolveProductImage(product)} alt={product.name} name={product.name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-black text-xs sm:text-xs uppercase truncate mb-0.5 sm:mb-1">{product.name}</h4>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[clamp(0.875rem,4vw,1.125rem)] font-black text-primary leading-none">{formatCurrency(product.price)}</div>
            <div className={cn(
              "text-[10px] sm:text-xs font-black uppercase tracking-tighter px-1.5 py-0.5 rounded border shrink-0",
              isOutOfStock ? "bg-danger/10 text-danger border-danger/20" :
              isLowStock ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
              "bg-success/10 text-success border-success/20"
            )}>
              Stock: {product.stock_current}
            </div>
          </div>
        </div>
        {isOutOfStock && (
          <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-center justify-center">
            <span className="text-xs font-black uppercase tracking-[0.2em] bg-background px-3 py-1 rounded-full border border-border shadow-xl">Sin Stock</span>
          </div>
        )}
      </button>
    );
  }

  return (
    <div className={cn(
      "neu-card !p-4 border border-white/5 flex flex-col gap-4 w-full max-w-full overflow-hidden transition-all hover:shadow-lg relative elevation-1",
      !product.is_active && "opacity-75 grayscale-[0.3] bg-muted/20",
      className
    )}>
      <div className={cn(
        "rounded-xl overflow-hidden bg-background/50 flex items-center justify-center shrink-0 relative group transition-all",
        hasImage ? "w-full aspect-square sm:aspect-video" : "w-10 h-10 self-start"
      )}>
        {hasImage ? (
          <ProductImage
            src={resolveProductImage(product)}
            alt={product.name}
            name={product.name}
            className="w-full h-full"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
            <Tag className="w-5 h-5" />
          </div>
        )}

        {hasImage && (
          <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
            {!product.is_active && (
              <div className="bg-danger text-foreground text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full shadow-lg">
                Inactivo
              </div>
            )}
            {product.price < (product.cost_price || 0) && (
              <div className="bg-danger text-foreground text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full shadow-lg border border-white/20 animate-pulse">
                ALERTA: Margen Negativo
              </div>
            )}
            {variant === 'inventory' && (
              <div
                className={cn(
                  "text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md",
                  isLowStock ? "bg-danger/20 text-danger border-danger/30" : "bg-success/20 text-success border-success/30"
                )}
              >
                {isLowStock ? 'Stock Bajo' : 'En Stock'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-col mb-1">
          <div className="flex justify-between items-start gap-2">
            <div>
              {variant === 'inventory' && (
                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block">{product.category || 'General'}</span>
              )}
              <h3 className="font-black text-base uppercase tracking-tight truncate">{product.name}</h3>
            </div>
            {!hasImage && (
              <button
                onClick={() => onEdit?.(product)}
                className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-foreground transition-all active:scale-90 shadow-sm"
                title="Adjuntar Imagen"
                aria-label="Adjuntar imagen"
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
          </div>
          {variantCount > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">
                {variantCount} {variantCount === 1 ? 'Variante' : 'Variantes'} de precio
              </span>
            </div>
          )}
        </div>

        {variant !== 'inventory' && (
          <p className="text-xs text-muted-foreground line-clamp-2 min-h-[30px] mb-4">
            {product.description || 'Sin descripción disponible'}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
          <div className="p-1.5 sm:p-2 rounded-lg bg-muted/30 border border-white/5 text-center">
            <div className="text-[10px] sm:text-xs font-black uppercase text-muted-foreground mb-0.5">Costo</div>
            <div className="font-bold text-[11px] sm:text-xs">{formatCurrency(product.cost_price || 0)}</div>
          </div>
          <div className="p-1.5 sm:p-2 rounded-lg bg-primary/5 border border-primary/10 text-center">
            <div className="text-[10px] sm:text-xs font-black uppercase text-primary mb-0.5">Venta</div>
            <div className="font-black text-[11px] sm:text-xs text-primary">{formatCurrency(product.price || 0)}</div>
          </div>
        </div>

        {variant === 'inventory' && (
           <div className="neu-inset-sm !p-3 bg-background/50 border border-white/5 mb-4">
              <div className="flex justify-between items-center">
                  <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">Stock Disponible</span>
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
                    {onPrintLabel && (
                      <SecondaryButton
                        label="Etiqueta"
                        icon={Printer}
                        onClick={() => onPrintLabel(product)}
                        className="w-full"
                      />
                    )}
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

export const ViewSwitcher: React.FC<{ currentView: 'grid' | 'table'; onViewChange: (view: 'grid' | 'table') => void }> = ({ currentView, onViewChange }) => (
  <div className="flex p-1 bg-muted/50 rounded-xl border border-border">
    <button
      onClick={() => onViewChange('grid')}
      className={cn(
        "p-2 rounded-lg transition-all",
        currentView === 'grid' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
      aria-label="Vista de cuadrícula"
      aria-pressed={currentView === 'grid'}
    >
      <LayoutGrid className="w-4 h-4" />
    </button>
    <button
      onClick={() => onViewChange('table')}
      className={cn(
        "p-2 rounded-lg transition-all",
        currentView === 'table' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
      aria-label="Vista de lista"
      aria-pressed={currentView === 'table'}
    >
      <List className="w-4 h-4" />
    </button>
  </div>
);
