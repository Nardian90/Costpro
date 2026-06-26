'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface ElderlyColumn<T> {
  key: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  isAction?: boolean;
}

interface ElderlyTableProps<T> {
  columns: ElderlyColumn<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  cardTitleField?: string;
}

export function ElderlyTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  emptyState,
  onRowClick,
  cardTitleField,
}: ElderlyTableProps<T>) {
  if (!data || data.length === 0) {
    return <>{emptyState || <div className="py-12 text-center text-elderly-micro">Sin datos</div>}</>;
  }

  const highPriorityCols = columns.filter(c => c.priority === 'high');
  const desktopCols = columns;

  return (
    <>
      {/* MOBILE: Cards */}
      <div className="sm:hidden space-y-3">
        {data.map((row) => {
          const titleCol = cardTitleField
            ? columns.find(c => c.key === cardTitleField)
            : highPriorityCols[0];
          const title = titleCol ? (titleCol.render ? titleCol.render(row) : String(row[titleCol.key] ?? '')) : '';
          const otherHighCols = highPriorityCols.filter(c => c.key !== titleCol?.key && !c.isAction).slice(0, 3);
          const actionCols = highPriorityCols.filter(c => c.isAction);

          return (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'rounded-2xl border-2 border-border bg-card p-4 space-y-3',
                onRowClick && 'cursor-pointer hover:border-primary/40 active:scale-[0.98] transition-all'
              )}
            >
              {title && (
                <div className="text-elderly-body font-black text-foreground border-b border-border pb-2">
                  {title}
                </div>
              )}
              <div className="space-y-2">
                {otherHighCols.map(col => (
                  <div key={col.key} className="flex items-center justify-between gap-2">
                    <span className="text-elderly-micro">{col.label}:</span>
                    <span className="text-elderly-body font-bold text-foreground text-right">
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </span>
                  </div>
                ))}
              </div>
              {actionCols.length > 0 && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  {actionCols.map(col => (
                    <div key={col.key}>{col.render!(row)}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DESKTOP: Tabla */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr className="border-b-2 border-border">
              {desktopCols.map(col => (
                <th
                  key={col.key}
                  className={cn(
                    'th-elderly',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.className
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border/50 hover:bg-muted/30',
                  onRowClick && 'cursor-pointer'
                )}
              >
                {desktopCols.map(col => (
                  <td
                    key={col.key}
                    className={cn(
                      'td-elderly text-foreground',
                      col.align === 'right' && 'text-right font-mono',
                      col.align === 'center' && 'text-center',
                      col.className
                    )}
                  >
                    {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
