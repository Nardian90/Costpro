'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChevronRight } from 'lucide-react';

/**
 * F5-T04: Tabla responsiva con prioridad de columnas.
 *
 * En desktop: muestra todas las columnas normalmente.
 * En mobile (<768px): muestra solo columnas con priority='high' + botón expandir
 * que abre un bottom sheet con todas las columnas de la fila + acciones.
 *
 * Uso:
 * <ResponsiveTable
 *   columns={[
 *     { key: 'name', header: 'Nombre', priority: 'high', render: (row) => <strong>{row.name}</strong> },
 *     { key: 'price', header: 'Precio', priority: 'high', render: (row) => formatCurrency(row.price) },
 *     { key: 'sku', header: 'SKU', priority: 'medium', render: (row) => row.sku },
 *     { key: 'stock', header: 'Stock', priority: 'low', render: (row) => row.stock },
 *   ]}
 *   data={products}
 *   rowKey="id"
 *   actions={(row) => (
 *     <>
 *       <button onClick={() => edit(row)}>Editar</button>
 *       <button onClick={() => delete(row)}>Eliminar</button>
 *     </>
 *   )}
 * />
 */

export type ColumnPriority = 'high' | 'medium' | 'low';

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  priority: ColumnPriority;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  actions?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function ResponsiveTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  actions,
  emptyMessage = 'Sin datos',
  onRowClick,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();
  const [expandedRow, setExpandedRow] = useState<T | null>(null);

  // En desktop: mostrar todas las columnas
  if (!isMobile) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={cn(
                    "text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
              {actions && <th className="text-right px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="text-center py-8 text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map(row => (
                <tr
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  {columns.map(col => (
                    <td key={col.key} className={cn("px-3 py-3 text-sm", col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-3 py-3 text-right whitespace-nowrap">{actions(row)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // En mobile: mostrar solo columnas 'high' + botón expandir
  const highPriorityCols = columns.filter(c => c.priority === 'high');
  const lowPriorityCols = columns.filter(c => c.priority !== 'high');

  return (
    <>
      {/* Tabla mobile: solo columnas high + botón expandir */}
      <div className="space-y-2">
        {data.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          data.map(row => (
            <div
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className="p-3 rounded-xl border border-border bg-card cursor-pointer hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1">
                  {highPriorityCols.map(col => (
                    <div key={col.key} className="flex items-baseline gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 w-20 shrink-0">
                        {col.header}
                      </span>
                      <span className={cn("text-sm font-bold truncate", col.className)}>
                        {col.render(row)}
                      </span>
                    </div>
                  ))}
                </div>
                {lowPriorityCols.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedRow(row);
                    }}
                    className="shrink-0 p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    aria-label="Ver más detalles"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Acciones inline si las hay */}
              {actions && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                  {actions(row)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Bottom sheet con todas las columnas de la fila expandida */}
      <Sheet open={!!expandedRow} onOpenChange={(open) => !open && setExpandedRow(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm font-black uppercase tracking-widest text-primary">
              Detalles
            </SheetTitle>
          </SheetHeader>
          {expandedRow && (
            <div className="space-y-3 px-4 pb-6">
              {columns.map(col => (
                <div key={col.key} className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                    {col.header}
                  </span>
                  <span className="text-sm font-medium">
                    {col.render(expandedRow)}
                  </span>
                </div>
              ))}
              {actions && (
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  {actions(expandedRow)}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
