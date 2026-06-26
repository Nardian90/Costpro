'use client';

import React, { useState, useRef, useMemo } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { useProducts } from '@/hooks/api/useProducts';
import SearchBar from '@/components/ui/SearchBar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, cn } from '@/lib/utils';
import { Search, Package, Check } from 'lucide-react';
import { SecondaryButton } from '@/components/ui/atomic';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Product } from '@/types';

import { useTranslations } from 'next-intl';
import { useDebounce } from '@/hooks/ui/useDebounce';
interface ProductInventoryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (product: Product) => void;
  storeId?: string | null;
}

const ROW_HEIGHT = 52; // px — altura estimada de cada fila de producto

const ProductInventoryPicker: React.FC<ProductInventoryPickerProps> = ({
  open,
  onOpenChange,
  onSelect,
  storeId
}) => {
  const t = useTranslations('costSheet');
  const [searchTerm, setSearchTerm] = useState('');
  // P4-2: Debounce 250ms en búsqueda de productos para no saturar la API.
  const debouncedSearch = useDebounce(searchTerm, 250);
  const { data: products, isLoading } = useProducts(storeId, debouncedSearch);

  // P4-3: Virtualización de la lista de productos con @tanstack/react-virtual.
  // Sin virtualización, 1000+ productos renderizan 1000 TableRow en el DOM,
  // causando lag severo. Con virtualización, solo se renderizan las filas
  // visibles en el viewport (~8-10 filas).
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: products?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

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

        <div
          ref={parentRef}
          className="max-h-[400px] overflow-y-auto rounded-xl border border-border"
        >
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
                  <TableRow key={i} style={{ height: ROW_HEIGHT }}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 mx-auto rounded-lg" /></TableCell>
                  </TableRow>
                ))
              ) : products && products.length > 0 ? (
                // P4-3: Renderizado virtualizado — solo las filas visibles + overscan.
                // El contenedor tiene altura dinámica = totalHeight, y cada fila
                // se posiciona absolutamente con transform: translateY.
                <tr style={{ height: totalHeight, position: 'relative' }}>
                  <td colSpan={4} style={{ padding: 0, position: 'relative' }}>
                    {virtualItems.map(virtualItem => {
                      const product = products[virtualItem.index];
                      return (
                        <div
                          key={product.id}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: ROW_HEIGHT,
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                          className="hover:bg-primary/5 transition-colors group flex items-center px-4 border-b border-border/30"
                        >
                          <div className="flex-1 font-bold text-sm truncate">{product.name}</div>
                          <div className="w-24 text-xs text-muted-foreground truncate">{product.sku || '-'}</div>
                          <div className="w-28 text-right font-mono text-sm">{formatCurrency(product.cost_price || 0)}</div>
                          <div className="w-24 text-center">
                            <SecondaryButton
                              label="Seleccionar"
                              icon={Check}
                              onClick={() => {
                                onSelect(product);
                                onOpenChange(false);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </td>
                </tr>
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
        {/* P4-3: Indicador de count cuando hay muchos productos */}
        {products && products.length > 20 && (
          <p className="text-xs text-muted-foreground text-center">
            {products.length} productos • Lista virtualizada para performance
          </p>
        )}
      </div>
    </BaseModal>
  );
};

export default ProductInventoryPicker;
