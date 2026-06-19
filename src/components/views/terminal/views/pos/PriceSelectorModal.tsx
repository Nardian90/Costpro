'use client';

import React from 'react';
import { Tag, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { BaseModal } from '@/components/ui/BaseModal';
import { Product, ProductVariant } from '@/types';

interface PriceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSelect: (variant: ProductVariant | null) => void;
}

/**
 * PriceSelectorModal: Shows product variants AND base unit option for multi-unit selling.
 * Per international standards: product can be sold by base unit OR any defined variant (box, pack, etc.)
 */
export default function PriceSelectorModal({ isOpen, onClose, product, onSelect }: PriceSelectorModalProps) {
  if (!isOpen || !product) return null;
  const variants = product.product_variants || [];

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Seleccionar Modalidad de Venta</span>
          <span className="text-lg font-black uppercase truncate">{product.name}</span>
        </div>
      }
      description={`Stock: ${product.stock_current ?? 0} ${product.unit_of_measure || 'uds'}`}
      maxWidth="sm:max-w-md"
    >
      <div className="py-4 space-y-2">
        {/* Base Unit Option — always available */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-primary hover:border-primary hover:bg-primary/5 active:scale-[0.99] transition-all text-left"
          aria-label={`Unidad Base — ${formatCurrency(product.price)}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Tag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-black text-sm">Unidad Base</p>
              <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Recomendado</span>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                1 {product.unit_of_measure || 'ud'} — Precio estándar
              </p>
            </div>
          </div>
          <span className="font-black text-sm text-primary ml-4 whitespace-nowrap">
            {formatCurrency(product.price)}
          </span>
        </button>

        {/* Variant Options */}
        {variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            onClick={() => onSelect(variant)}
            className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 active:scale-[0.99] transition-all text-left"
            aria-label={`${variant.name} — ${formatCurrency(variant.price)}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Package className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-sm truncate">{variant.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  1 {variant.name} = x{variant.conversion_factor || 1} {product.unit_of_measure || 'uds'}
                </p>
                {variant.sku && (
                  <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">SKU: {variant.sku}</p>
                )}
              </div>
            </div>
            <span className="font-black text-sm text-primary ml-4 whitespace-nowrap">
              {formatCurrency(variant.price)}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
      </div>
    </BaseModal>
  );
}
