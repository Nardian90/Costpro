'use client';

import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { formatCurrency } from '@/lib/utils';
import { Product } from '@/types';
import { DollarSign, Tag, Package } from 'lucide-react';

interface PriceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSelect: (variant: any) => void;
}

export const PriceSelectorModal: React.FC<PriceSelectorModalProps> = ({
  isOpen,
  onClose,
  product,
  onSelect
}) => {
  if (!product) return null;

  const variants = product.product_variants || [];

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={onClose}
      title={
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Seleccionar Modalidad</span>
          <span className="text-xl font-black uppercase truncate">{product.name}</span>
        </div>
      }
    >
      <div className="py-4 space-y-3">
        {/* Base Price Option */}
        <button
          onClick={() => onSelect(null)}
          className="w-full p-4 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Tag className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
            </div>
            <div>
              <div className="font-black uppercase text-sm">Unidad Base</div>
              <div className="text-xs text-muted-foreground">Precio estándar</div>
            </div>
          </div>
          <div className="text-lg font-black text-primary">
            {formatCurrency(product.price)}
          </div>
        </button>

        {/* Variants */}
        {variants.map((variant: any) => (
          <button
            key={variant.id}
            onClick={() => onSelect(variant)}
            className="w-full p-4 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Package className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
              </div>
              <div>
                <div className="font-black uppercase text-sm">{variant.name}</div>
                <div className="text-xs text-muted-foreground">Factor: x{variant.conversion_factor}</div>
              </div>
            </div>
            <div className="text-lg font-black text-primary">
              {formatCurrency(variant.price)}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <SecondaryButton label="Cancelar" onClick={onClose} className="w-full" />
      </div>
    </BaseModal>
  );
};
