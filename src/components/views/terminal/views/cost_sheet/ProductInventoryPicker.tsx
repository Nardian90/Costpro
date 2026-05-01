'use client';

import React, { useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { useProducts } from '@/hooks/api/useProducts';
import SearchBar from '@/components/ui/SearchBar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import { Search, Package, Check } from 'lucide-react';
import { SecondaryButton } from '@/components/ui/atomic';
import type { Product } from '@/types';

interface ProductInventoryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (product: Product) => void;
  storeId?: string | null;
}

const ProductInventoryPicker: React.FC<ProductInventoryPickerProps> = ({
  open,
  onOpenChange,
  onSelect,
  storeId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: products, isLoading } = useProducts(storeId, searchTerm);

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <span>Importar desde Inventario</span>
        </div>
      }
      maxWidth="sm:max-w-3xl"
    >
      <div className="space-y-4 py-4">
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por nombre o código..."
          showSettings={false}
        />

        <div className="max-h-[400px] overflow-y-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="font-black text-xs uppercase tracking-widest">Producto</TableHead>
                <TableHead className="font-black text-xs uppercase tracking-widest">Código</TableHead>
                <TableHead className="font-black text-xs uppercase tracking-widest text-right">Costo</TableHead>
                <TableHead className="font-black text-xs uppercase tracking-widest text-center">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 mx-auto rounded-lg" /></TableCell>
                  </TableRow>
                ))
              ) : products && products.length > 0 ? (
                products.map((product) => (
                  <TableRow key={product.id} className="hover:bg-primary/5 transition-colors group">
                    <TableCell className="font-bold text-sm">{product.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{product.sku || '-'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(product.cost_price || 0)}</TableCell>
                    <TableCell className="text-center">
                      <SecondaryButton
                        label="Seleccionar"
                        icon={Check}
                        onClick={() => {
                          onSelect(product);
                          onOpenChange(false);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground italic">
                    <div className="flex flex-col items-center gap-2">
                       <Search className="w-8 h-8 opacity-20" />
                       <p>No se encontraron productos</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </BaseModal>
  );
};

export default ProductInventoryPicker;
