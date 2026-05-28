'use client';

import React from 'react';
import { Product, PaymentMethod } from '@/types';
import type { SalesCatalogRow } from './useSalesCatalog';
import SalesCatalogCard from './SalesCatalogCard';

interface SalesCatalogCardGridProps {
  products: Product[];
  getOrCreateRow: (product: Product) => SalesCatalogRow;
  handlers: {
    handleSetQuantity: (product: Product, val: number) => void;
    handleSelectVariant: (product: Product, variantId: string | null) => void;
    handleSetDiscountType: (product: Product) => void;
    handleSetDiscountValue: (product: Product, val: number) => void;
    handleSetPaymentMethod: (product: Product, method: PaymentMethod) => void;
    handleSetCashPaid: (product: Product, val: number) => void;
    handleSetTransferPaid: (product: Product, val: number) => void;
    updateRow: (productId: string, updater: (r: SalesCatalogRow) => SalesCatalogRow) => void;
  };
}

export default function SalesCatalogCardGrid({
  products,
  getOrCreateRow,
  handlers,
}: SalesCatalogCardGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {products.map((product) => {
        const row = getOrCreateRow(product);
        const isActive = row.quantity > 0;

        return (
          <SalesCatalogCard
            key={product.id}
            product={product}
            row={row}
            isActive={isActive}
            handlers={handlers}
          />
        );
      })}
    </div>
  );
}
