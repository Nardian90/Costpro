'use client';

import React from 'react';
import { Product, PaymentMethod } from '@/types';
import type { SalesCatalogRow } from './useSalesCatalog';
import SalesCatalogCard from './SalesCatalogCard';

interface SalesCatalogCardGridProps {
  products: Product[];
  getOrCreateRow: (product: Product) => SalesCatalogRow;
  handlers: {
    handleSetQuantity: (product: Product, qty: number) => void;
    handleSelectVariant: (product: Product, variant: any) => void;
    handleSetDiscountType: (product: Product) => void;
    handleSetDiscountValue: (product: Product, value: number) => void;
    handleSetPaymentMethod: (product: Product, method: PaymentMethod) => void;
    handleSetCashPaid: (product: Product, val: number) => void;
    handleSetTransferPaid: (product: Product, val: number) => void;
    updateRow: (productId: string, updater: (row: SalesCatalogRow) => SalesCatalogRow) => void;
  };
  hasDiscrepancy: (row: SalesCatalogRow) => boolean;
  calcSubtotal: (row: SalesCatalogRow) => number;
}

export default function SalesCatalogCardGrid({
  products,
  getOrCreateRow,
  handlers,
  hasDiscrepancy,
  calcSubtotal,
}: SalesCatalogCardGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {products.map((product) => {
        const row = getOrCreateRow(product);
        const subtotal = calcSubtotal(row);
        const isActive = row.quantity > 0;
        const discrepancy = hasDiscrepancy(row);

        return (
          <SalesCatalogCard
            key={product.id}
            product={product}
            row={row}
            subtotal={subtotal}
            isActive={isActive}
            discrepancy={discrepancy}
            handlers={handlers}
            calcSubtotal={calcSubtotal}
          />
        );
      })}
    </div>
  );
}
