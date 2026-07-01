'use client';

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

/**
 * B3: Grid virtualizada para StoresManagementView cuando hay >20 tiendas.
 *
 * En desktop: grid CSS virtualizado (3 columnas) con scroll virtual.
 * En mobile: lista virtualizada (1 columna).
 *
 * Solo se activa cuando storeCount > 20. Para ≤20 tiendas, el grid simple
 * normal es más eficiente (overhead de virtualización no vale la pena).
 *
 * Uso:
 * <VirtualizedStoreGrid
 *   stores={stores}
 *   renderItem={(store) => <StoreCard store={store} />}
 *   columns={3} // columnas en desktop
 * />
 */

interface VirtualizedStoreGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  rowKey: (item: T) => string;
  columns?: number; // columnas desktop (default 3)
  className?: string;
}

export function VirtualizedStoreGrid<T>({
  items,
  renderItem,
  rowKey,
  columns = 3,
  className,
}: VirtualizedStoreGridProps<T>) {
  const t = useTranslations('stores');
  const parentRef = useRef<HTMLDivElement>(null);

  // Calcular filas basadas en columnas
  const rowCount = Math.ceil(items.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 380, // altura aproximada de cada tarjeta de tienda
    overscan: 2,
  });

  return (
    <div
      ref={parentRef}
      className={cn("overflow-y-auto max-h-[calc(100vh-200px)]", className)}
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * columns;
          const rowItems = items.slice(startIdx, startIdx + columns);

          return (
            <div
              key={`row-${virtualRow.key}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className={cn(
                "grid gap-6 pb-6",
                columns === 3 && "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
                columns === 2 && "grid-cols-1 md:grid-cols-2",
                columns === 1 && "grid-cols-1",
              )}
            >
              {rowItems.map((item, i) => (
                <div key={rowKey(item)}>
                  {renderItem(item, startIdx + i)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
